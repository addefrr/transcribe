import { and, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobBatches } from "@/lib/schema";
import { getSettings } from "@/lib/settings";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  remainingMinutes,
} from "@/lib/subscriptions";
import { isUuid } from "@/lib/uuid";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const settings = await getSettings();
  const rawSubscription = await getActiveSubscription(user.id);
  const subscription = isSubscriptionBypassed(user, settings) ? null : rawSubscription;
  return NextResponse.json(
    {
      batch,
      billing: {
        creditBalance: user.creditBalance,
        subscriptionTier: subscription?.tier ?? null,
        subscriptionMinutesLeft: subscription ? remainingMinutes(subscription) : 0,
        subscriptionPeriodLabel:
          subscription?.interval === "week"
            ? "in this seven-day pass"
            : "before its monthly reset",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Discard an unstarted playlist review. No jobs, holds, or charges exist yet. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [deleted] = await db
    .delete(jobBatches)
    .where(
      and(
        eq(jobBatches.id, id),
        eq(jobBatches.userId, user.id),
        ne(jobBatches.status, "started"),
      ),
    )
    .returning({ id: jobBatches.id });
  if (deleted) return NextResponse.json({ discarded: true });

  const [existing] = await db
    .select({ status: jobBatches.status })
    .from(jobBatches)
    .where(and(eq(jobBatches.id, id), eq(jobBatches.userId, user.id)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { error: "This playlist has already started and can no longer be discarded." },
    { status: 409 },
  );
}
