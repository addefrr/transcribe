import Link from "next/link";
import { redirect } from "next/navigation";
import JobList from "@/components/JobList";
import NewJobForm from "@/components/NewJobForm";
import { T } from "@/components/T";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getTranscriptionRoutingInfo } from "@/lib/transcription-models";
import {
  getActiveSubscription,
  isSubscriptionBypassed,
  remainingMinutes,
} from "@/lib/subscriptions";

export const metadata = { title: "My transcriptions", robots: { index: false, follow: false } };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ verificationEmail?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  const { tiers, tierFeatures, usdCentsPerCredit } = settings;
  const rawSub = await getActiveSubscription(user.id);
  const sub = isSubscriptionBypassed(user, settings) ? null : rawSub;
  const routes = getTranscriptionRoutingInfo().routes;
  const providerRoutes = {
    standard: (() => {
      const route = routes.find((candidate) => candidate.assumptionTier === "standard")!;
      return { provider: route.provider, model: route.model };
    })(),
    premium: (() => {
      const route = routes.find((candidate) => candidate.assumptionTier === "premium")!;
      return { provider: route.provider, model: route.model };
    })(),
  };
  const params = await searchParams;

  return (
    <div className="py-10">
      {params.verificationEmail === "failed" && (
        <p role="alert" className="status-error mb-6">
          Your account was created, but the verification email could not be sent. Use the
          resend control above later, or contact support if the problem continues.
        </p>
      )}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold"><T id="dashboard.heading" /></h1>
        {sub ? (
          <p className="text-sm text-muted">
            <span className="font-semibold capitalize text-ink">
              <T id="dashboard.planLeft" vars={{ plan: sub.tier }} />
            </span>{" "}
            · <T id="dashboard.periodLeft" vars={{ hours: Math.round(remainingMinutes(sub) / 60) }} />
          </p>
        ) : (
          <p className="text-sm text-muted">
            <T id="dashboard.creditsLeft" vars={{ credits: user.creditBalance }} />{" "}
            <Link href="/plans" className="ml-2 text-brand underline underline-offset-4">
              <T id="dashboard.goUnlimited" />
            </Link>
          </p>
        )}
      </div>
      <NewJobForm
        tiers={tiers}
        tierFeatures={tierFeatures}
        usdCentsPerCredit={usdCentsPerCredit}
        subscriptionTier={sub?.tier ?? null}
        subscriptionMinutesLeft={sub ? remainingMinutes(sub) : 0}
        providerRoutes={providerRoutes}
        audioRetentionDays={Math.max(0, Number(process.env.AUDIO_RETENTION_DAYS ?? 7))}
        maxFileMb={Math.floor(Number(process.env.MAX_FILESIZE_BYTES ?? 2 * 1024 ** 3) / 1024 ** 2)}
        maxDurationHours={Number(process.env.MAX_DURATION_SECONDS ?? 14_400) / 3600}
        emailVerified={user.emailVerified}
      />
      <JobList />
    </div>
  );
}
