import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, planAllowanceMinutes } from "@/lib/settings";
import { getActiveSubscription, remainingMinutes } from "@/lib/subscriptions";

export const metadata = { title: "Plans — Transcribe" };
export const dynamic = "force-dynamic";

const intervalLabel: Record<string, string> = {
  month: "/month",
  year: "/year",
  week: "one-time · 7 days",
};

function hours(minutes: number): string {
  return minutes >= 60 ? `${Math.round(minutes / 60)} hours` : `${minutes} min`;
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string; canceled?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  const sub = await getActiveSubscription(user.id);
  const params = await searchParams;

  if (!settings.subscriptionsEnabled) {
    return (
      <div className="py-10">
        <h1 className="text-2xl font-semibold">Plans</h1>
        <p className="mt-2 text-sm text-zinc-500">Subscriptions aren&apos;t available right now.</p>
      </div>
    );
  }

  const activePlan = sub
    ? settings.subscriptionPlans.find((p) => p.id === sub.planId)
    : undefined;

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold">Subscribe &amp; save</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Unlimited transcriptions for a flat price — no counting credits.
      </p>

      {params.subscribed && (
        <p className="mt-4 rounded-md bg-green-100 px-4 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          You&apos;re subscribed! Your transcriptions are now covered by your plan.
        </p>
      )}
      {params.canceled && (
        <p className="mt-4 rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          No problem — nothing was charged.
        </p>
      )}

      {sub && activePlan && (
        <div className="mt-6 rounded-xl border border-indigo-500 bg-indigo-50 p-5 dark:bg-indigo-950/30">
          <p className="font-medium">
            Active plan: {activePlan.label}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {hours(remainingMinutes(sub))} of {hours(sub.allowanceMinutes)} left this period ·
            renews/ends {sub.periodEnd.toISOString().slice(0, 10)}
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {settings.subscriptionPlans.map((plan) => {
          const isActive = sub?.planId === plan.id;
          return (
            <form
              key={plan.id}
              action="/api/subscribe"
              method="POST"
              className={`flex flex-col rounded-xl border p-6 ${
                isActive
                  ? "border-indigo-500 ring-1 ring-indigo-500"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <input type="hidden" name="planId" value={plan.id} />
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                {plan.tier}
              </p>
              <h3 className="mt-1 font-semibold">{plan.label}</h3>
              <p className="mt-2">
                <span className="text-3xl font-bold">${(plan.priceUsdCents / 100).toFixed(2)}</span>{" "}
                <span className="text-sm text-zinc-500">{intervalLabel[plan.interval]}</span>
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Up to {hours(planAllowanceMinutes(plan, settings))} of audio included.
              </p>
              <button
                type="submit"
                disabled={isActive}
                className="mt-auto pt-4"
              >
                <span
                  className={`block rounded-md py-2 text-center text-sm font-medium ${
                    isActive
                      ? "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  }`}
                >
                  {isActive ? "Current plan" : "Choose plan"}
                </span>
              </button>
            </form>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        Prefer pay-as-you-go?{" "}
        <a href="/credits" className="text-indigo-600 hover:underline dark:text-indigo-400">
          Buy credits instead
        </a>
        .
      </p>
    </div>
  );
}
