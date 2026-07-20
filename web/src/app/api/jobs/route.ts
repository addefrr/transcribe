import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLanguageCode } from "@/lib/languages";
import { isTier } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { jobs } from "@/lib/schema";
import { isValidUploadKey } from "@/lib/storage";
import { screenUrl } from "@/lib/ssrf";
import {
  getActiveSubscription,
  remainingMinutes,
  subscriptionCovers,
} from "@/lib/subscriptions";
import { getWallet } from "@/lib/wallet";

const MAX_ACTIVE_JOBS = Number(process.env.MAX_ACTIVE_JOBS_PER_USER ?? 3);
const ACTIVE = ["pending", "probing", "downloading", "transcribing"];

const bodySchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("url"),
    url: z.string().min(1).max(2000),
    tier: z.string(),
    language: z.string().optional(),
    diarize: z.boolean().optional(),
  }),
  z.object({
    sourceType: z.literal("upload"),
    uploadKey: z.string(),
    originalFilename: z.string().max(300).optional(),
    tier: z.string(),
    language: z.string().optional(),
    diarize: z.boolean().optional(),
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
  // Speaker recognition is only available on the diarizing (Premium/AssemblyAI)
  // engine, so requesting it forces the Premium tier.
  const diarize = body.diarize === true;
  const tier = diarize ? "premium" : body.tier;
  const settings = await getSettings();
  // Empty/absent language means auto-detect; a non-empty value must be one we offer.
  const languageHint = body.language || null;
  if (languageHint && !isLanguageCode(languageHint)) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }

  // A subscription covering this tier (with allowance left) bills the job to the
  // subscription; otherwise it's billed to credits and needs a positive balance.
  const sub = await getActiveSubscription(user.id);
  const coveredBySub =
    sub && subscriptionCovers(sub, tier) && remainingMinutes(sub) > 0;
  const billing = coveredBySub ? "subscription" : "credits";
  if (!coveredBySub && user.creditBalance <= 0) {
    return NextResponse.json(
      { error: "You have no credits. Buy credits or start a subscription first." },
      { status: 402 },
    );
  }

  // Global spend circuit-breaker: don't let API spend exceed the budget
  // (revenue × walletSpendPct). Trips when cumulative spend catches up.
  const wallet = await getWallet();
  if (wallet.overBudget) {
    return NextResponse.json(
      { error: "We're at capacity right now — please try again shortly." },
      { status: 503 },
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
      // Display/download name from the upload; worker fills this for URL jobs.
      outputName: body.originalFilename ?? null,
    };
  }

  const [job] = await db
    .insert(jobs)
    .values({
      userId: user.id,
      tier: tier,
      creditsPerMinute: settings.tiers[tier].creditsPerMinute,
      costPerMinuteCents: settings.costPerMinuteCents[tier],
      billing,
      subscriptionId: coveredBySub ? sub!.id : null,
      diarize,
      languageHint,
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
