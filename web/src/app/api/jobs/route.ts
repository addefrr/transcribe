import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLanguageCode } from "@/lib/languages";
import { customerJob } from "@/lib/job-dto";
import { isTier } from "@/lib/pricing";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getSettings } from "@/lib/settings";
import { routeSupportsSpeakerLabels } from "@/lib/transcription-capabilities";
import { jobs, uploads, users } from "@/lib/schema";
import { deleteObject, isValidUploadKey, storedObjectSize } from "@/lib/storage";
import { screenUrl } from "@/lib/ssrf";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  remainingMinutes,
  subscriptionCovers,
} from "@/lib/subscriptions";
import { getWallet } from "@/lib/wallet";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_ACTIVE_JOBS = positiveInteger(process.env.MAX_ACTIVE_JOBS_PER_USER, 3);
const MAX_JOB_SUBMISSIONS_PER_HOUR = positiveInteger(
  process.env.MAX_JOB_SUBMISSIONS_PER_HOUR,
  30,
);
const ACTIVE = ["pending", "probing", "downloading", "transcribing", "awaiting_confirmation"];

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
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Verify your email address before starting a transcription." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;
  if (!isTier(body.tier)) {
    return NextResponse.json({ error: "Unknown quality tier" }, { status: 400 });
  }
  const settings = await getSettings();
  const tier = body.tier;
  const diarize = body.diarize === true;
  if (
    diarize &&
    (!settings.tierFeatures[tier].speakerLabels || !routeSupportsSpeakerLabels(tier))
  ) {
    return NextResponse.json(
      { error: "Speaker labels are not available with the selected processing option." },
      { status: 400 },
    );
  }
  // Empty/absent language means auto-detect; a non-empty value must be one we offer.
  const languageHint = body.language || null;
  if (languageHint && !isLanguageCode(languageHint)) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }
  const submissionLimit = await rateLimit(
    `job-submit:${user.id}:${await clientIp()}`,
    MAX_JOB_SUBMISSIONS_PER_HOUR,
    60 * 60 * 1000,
  );
  if (!submissionLimit.ok) {
    return NextResponse.json(
      { error: "Too many transcription requests. Try again after the current hour." },
      {
        status: 429,
        headers: { "Retry-After": String(submissionLimit.retryAfterSec) },
      },
    );
  }

  // A subscription covering this tier (with allowance left) bills the job to the
  // subscription; otherwise it's billed to credits and needs a positive balance.
  const rawSub = await getActiveSubscription(user.id);
  const sub = isSubscriptionBypassed(user, settings) ? null : rawSub;
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

  let values;
  if (body.sourceType === "url") {
    const problem = screenUrl(body.url);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    values = {
      sourceType: "url" as const,
      sourceUrl: body.url,
      requiresConfirmation: true,
    };
  } else {
    if (!isValidUploadKey(body.uploadKey)) {
      return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
    }
    const [intent] = await db
      .select()
      .from(uploads)
      .where(
        and(
          eq(uploads.key, body.uploadKey),
          eq(uploads.userId, user.id),
          isNull(uploads.claimedAt),
          gt(uploads.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!intent) {
      return NextResponse.json(
        { error: "This upload is invalid, expired, or already used." },
        { status: 400 },
      );
    }
    const actualSize = await storedObjectSize(body.uploadKey);
    if (actualSize === null || actualSize !== intent.sizeBytes) {
      await deleteObject(body.uploadKey).catch(() => {});
      return NextResponse.json(
        { error: "The uploaded file was incomplete or did not match its declared size." },
        { status: 400 },
      );
    }
    values = {
      sourceType: "upload" as const,
      uploadKey: body.uploadKey,
      originalFilename: intent.originalFilename,
      // Display/download name from the upload; worker fills this for URL jobs.
      outputName: intent.originalFilename,
    };
  }

  const base = {
    userId: user.id,
    tier,
    creditsPerMinute: settings.tiers[tier].creditsPerMinute,
    costPerMinuteCents: settings.costPerMinuteCents[tier],
    billing,
    subscriptionId: coveredBySub ? sub!.id : null,
    diarize,
    languageHint,
  };
  // Serialize the active-count check and insert on the account row. Without
  // this lock, simultaneous tabs could all observe a free slot and bypass the
  // per-account concurrency cap.
  const creation = await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update")
      .limit(1);
    if (!account) return { kind: "missing" as const };

    const active = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.userId, user.id), inArray(jobs.status, ACTIVE)))
      .limit(MAX_ACTIVE_JOBS);
    if (active.length >= MAX_ACTIVE_JOBS) {
      return { kind: "limit" as const, count: active.length };
    }

    if (body.sourceType === "upload") {
      const [claimed] = await tx
        .update(uploads)
        .set({ claimedAt: new Date() })
        .where(
          and(
            eq(uploads.key, body.uploadKey),
            eq(uploads.userId, user.id),
            isNull(uploads.claimedAt),
            gt(uploads.expiresAt, new Date()),
          ),
        )
        .returning({ key: uploads.key });
      if (!claimed) return { kind: "used" as const };
      const [created] = await tx.insert(jobs).values({ ...base, ...values }).returning();
      return { kind: "created" as const, job: created };
    }

    const [created] = await tx.insert(jobs).values({ ...base, ...values }).returning();
    return { kind: "created" as const, job: created };
  });
  if (creation.kind === "missing") {
    return NextResponse.json({ error: "Account not found" }, { status: 401 });
  }
  if (creation.kind === "limit") {
    return NextResponse.json(
      {
        error: `You already have ${creation.count} jobs in progress — wait for one to finish.`,
      },
      { status: 429 },
    );
  }
  if (creation.kind === "used") {
    return NextResponse.json({ error: "This upload was already used." }, { status: 409 });
  }
  const job = creation.job;
  return NextResponse.json(
    { job: { id: job.id, status: job.status }, requiresConfirmation: job.requiresConfirmation },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, user.id))
    .orderBy(desc(jobs.createdAt))
    .limit(100);
  return NextResponse.json(
    { jobs: rows.map(customerJob), creditBalance: user.creditBalance },
    { headers: { "cache-control": "private, no-store" } },
  );
}
