import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { estimateCredits } from "@/lib/pricing";
import { jobBatches, jobs, type BatchItem } from "@/lib/schema";
import {
  getActiveSubscription,
  remainingMinutes,
  subscriptionCovers,
} from "@/lib/subscriptions";
import { getWallet } from "@/lib/wallet";
import { isUuid } from "@/lib/uuid";
import type { Tier } from "@/lib/pricing";

// Confirm a ready batch: create one transcription job per video. Priced and
// paid-for up front for credit users.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [batch] = await db
    .select()
    .from(jobBatches)
    .where(and(eq(jobBatches.id, id), eq(jobBatches.userId, user.id)))
    .limit(1);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (batch.status === "started") {
    return NextResponse.json({ error: "This playlist has already been started." }, { status: 409 });
  }
  if (batch.status !== "ready") {
    return NextResponse.json({ error: "This playlist isn't ready yet." }, { status: 409 });
  }
  const items = batch.items as BatchItem[];
  if (items.length === 0) {
    return NextResponse.json({ error: "This playlist has no videos." }, { status: 400 });
  }

  const tier = batch.tier as Tier;
  const totalCredits = items.reduce(
    (sum, it) => sum + estimateCredits(it.duration ?? 0, batch.creditsPerMinute),
    0,
  );

  // Spend circuit-breaker.
  const wallet = await getWallet();
  if (wallet.overBudget) {
    return NextResponse.json(
      { error: "We're at capacity right now — please try again shortly." },
      { status: 503 },
    );
  }

  // Bill the whole batch to a covering subscription, else to credits.
  const sub = await getActiveSubscription(user.id);
  const coveredBySub = sub && subscriptionCovers(sub, tier) && remainingMinutes(sub) > 0;
  const billing = coveredBySub ? "subscription" : "credits";
  if (!coveredBySub && user.creditBalance < totalCredits) {
    return NextResponse.json(
      {
        error: `This playlist needs ${totalCredits} credits but you have ${user.creditBalance}. Buy more or start a subscription.`,
      },
      { status: 402 },
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(jobs).values(
      items.map((it) => ({
        userId: user.id,
        sourceType: "url" as const,
        sourceUrl: it.url,
        outputName: it.title || null,
        tier: batch.tier,
        creditsPerMinute: batch.creditsPerMinute,
        costPerMinuteCents: batch.costPerMinuteCents,
        billing,
        subscriptionId: coveredBySub ? sub!.id : null,
        batchId: batch.id,
        diarize: batch.diarize,
        languageHint: batch.languageHint,
      })),
    );
    await tx
      .update(jobBatches)
      .set({ status: "started", updatedAt: new Date() })
      .where(eq(jobBatches.id, batch.id));
  });

  return NextResponse.json({ started: items.length });
}
