import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTier, TIERS } from "@/lib/pricing";
import { jobs } from "@/lib/schema";
import { isValidUploadKey } from "@/lib/storage";
import { screenUrl } from "@/lib/ssrf";

const MAX_ACTIVE_JOBS = Number(process.env.MAX_ACTIVE_JOBS_PER_USER ?? 3);
const ACTIVE = ["pending", "probing", "downloading", "transcribing"];

const bodySchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("url"),
    url: z.string().min(1).max(2000),
    tier: z.string(),
  }),
  z.object({
    sourceType: z.literal("upload"),
    uploadKey: z.string(),
    originalFilename: z.string().max(300).optional(),
    tier: z.string(),
  }),
]);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;
  if (!isTier(body.tier)) {
    return NextResponse.json({ error: "Unknown quality tier" }, { status: 400 });
  }
  if (user.creditBalance <= 0) {
    return NextResponse.json(
      { error: "You have no credits. Buy a credit pack first." },
      { status: 402 },
    );
  }

  const active = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, user.id), inArray(jobs.status, ACTIVE)));
  if (active.length >= MAX_ACTIVE_JOBS) {
    return NextResponse.json(
      { error: `You already have ${active.length} jobs in progress — wait for one to finish.` },
      { status: 429 },
    );
  }

  let values;
  if (body.sourceType === "url") {
    const problem = screenUrl(body.url);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    values = { sourceType: "url" as const, sourceUrl: body.url };
  } else {
    if (!isValidUploadKey(body.uploadKey)) {
      return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
    }
    values = {
      sourceType: "upload" as const,
      uploadKey: body.uploadKey,
      originalFilename: body.originalFilename,
    };
  }

  const [job] = await db
    .insert(jobs)
    .values({
      userId: user.id,
      tier: body.tier,
      creditsPerMinute: TIERS[body.tier].creditsPerMinute,
      ...values,
    })
    .returning();
  return NextResponse.json({ job }, { status: 201 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, user.id))
    .orderBy(desc(jobs.createdAt))
    .limit(100);
  return NextResponse.json({ jobs: rows, creditBalance: user.creditBalance });
}
