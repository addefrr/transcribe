import { redirect } from "next/navigation";
import BatchDetail from "@/components/BatchDetail";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  remainingMinutes,
} from "@/lib/subscriptions";

export const metadata = { title: "Playlist" };

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const settings = await getSettings();
  const rawSub = await getActiveSubscription(user.id);
  const sub = isSubscriptionBypassed(user, settings) ? null : rawSub;
  return (
    <div className="py-10">
      <BatchDetail
        id={id}
        subscriptionTier={sub?.tier ?? null}
        subscriptionMinutesLeft={sub ? remainingMinutes(sub) : 0}
        subscriptionPeriodLabel={
          sub?.interval === "week" ? "in this seven-day pass" : "before its monthly reset"
        }
        creditBalance={user.creditBalance}
        maxBatchItems={positiveInteger(process.env.MAX_PLAYLIST_ITEMS, 100)}
        maxItemSeconds={positiveInteger(process.env.MAX_DURATION_SECONDS, 4 * 60 * 60)}
        maxBatchSeconds={positiveInteger(
          process.env.MAX_BATCH_DURATION_SECONDS,
          24 * 60 * 60,
        )}
      />
    </div>
  );
}
