import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLanguageCode } from "@/lib/languages";
import { isPlaylistUrl } from "@/lib/playlist";
import { isTier } from "@/lib/pricing";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { jobBatches, users } from "@/lib/schema";
import { getSettings } from "@/lib/settings";
import { screenUrl } from "@/lib/ssrf";
import { routeSupportsSpeakerLabels } from "@/lib/transcription-capabilities";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_OPEN_BATCHES = positiveInteger(process.env.MAX_OPEN_BATCHES_PER_USER, 3);

const bodySchema = z.object({
  url: z.string().trim().min(1).max(2000),
  tier: z.string(),
  language: z.string().optional(),
  diarize: z.boolean().optional(),
});

// Create a playlist batch. The worker expands it; the user confirms the price
// via /batches/[id] before any transcription starts.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Verify your email address before reading a playlist." },
      { status: 403 },
    );
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid playlist request." }, { status: 400 });
  }
  const body = parsed.data;

  if (!isTier(body.tier)) {
    return NextResponse.json({ error: "Unknown quality tier" }, { status: 400 });
  }
  if (!isPlaylistUrl(body.url)) {
    return NextResponse.json({ error: "That doesn't look like a playlist link." }, { status: 400 });
  }
  const problem = screenUrl(body.url);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const languageHint = body.language || null;
  if (languageHint && !isLanguageCode(languageHint)) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }
  const diarize = body.diarize === true;
  const tier = body.tier;
  const settings = await getSettings();
  if (
    diarize &&
    (!settings.tierFeatures[tier].speakerLabels || !routeSupportsSpeakerLabels(tier))
  ) {
    return NextResponse.json(
      { error: "Speaker labels are not available with the selected processing option." },
      { status: 400 },
    );
  }

  // Only valid requests count toward the expensive playlist-expansion limit.
  const submissionLimit = await rateLimit(
    `batch:${user.id}:${await clientIp()}`,
    10,
    60 * 60 * 1000,
  );
  if (!submissionLimit.ok) {
    const retryMinutes = Math.max(1, Math.ceil(submissionLimit.retryAfterSec / 60));
    return NextResponse.json(
      {
        error: `Too many playlists were submitted. Try again in about ${retryMinutes} minute${retryMinutes === 1 ? "" : "s"}.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(submissionLimit.retryAfterSec) },
      },
    );
  }

  // Expansion is deliberately bounded as well as rate-limited. Failed and
  // already-started batches do not block the user from trying another source.
  // Locking the account serializes this count-and-insert across simultaneous
  // tabs so the configured cap cannot be exceeded by a race.
  const result = await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update")
      .limit(1);
    if (!account) return { kind: "missing" as const };

    const openBatches = await tx
      .select({ id: jobBatches.id })
      .from(jobBatches)
      .where(
        and(
          eq(jobBatches.userId, user.id),
          inArray(jobBatches.status, ["expanding", "ready"]),
        ),
      )
      .limit(MAX_OPEN_BATCHES);
    if (openBatches.length >= MAX_OPEN_BATCHES) {
      return { kind: "limit" as const, count: openBatches.length };
    }

    const [batch] = await tx
      .insert(jobBatches)
      .values({
        userId: user.id,
        sourceUrl: body.url,
        tier,
        creditsPerMinute: settings.tiers[tier].creditsPerMinute,
        costPerMinuteCents: settings.costPerMinuteCents[tier],
        languageHint,
        diarize,
      })
      .returning({ id: jobBatches.id });
    return { kind: "created" as const, id: batch.id };
  });

  if (result.kind === "missing") {
    return NextResponse.json({ error: "Account not found" }, { status: 401 });
  }
  if (result.kind === "limit") {
    return NextResponse.json(
      {
        error: `You already have ${result.count} playlists waiting for review. Start or discard one before adding another.`,
      },
      { status: 429 },
    );
  }
  return NextResponse.json({ batchId: result.id }, { status: 201 });
}
