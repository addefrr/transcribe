import { redirect } from "next/navigation";
import TokenManager from "@/components/TokenManager";
import { listApiTokens } from "@/lib/apiTokens";
import { getCurrentUser } from "@/lib/auth";
import { APP_URL } from "@/lib/stripe";

export const metadata = { title: "Browser extension & API — Transcribe" };

export default async function TokensPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tokens = await listApiTokens(user.id);

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold">Browser extension &amp; API access</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Transcribe audio or video playing in any browser tab with our extension, or call the API
        from your own tools. Both authenticate with a personal access token you create below.
      </p>

      <div className="mt-8 max-w-3xl">
        <TokenManager tokens={tokens} />
      </div>

      <div className="mt-12 max-w-3xl rounded-xl border border-line p-6">
        <h2 className="text-lg font-semibold">Set up the browser extension</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Create a token above and copy it.</li>
          <li>
            Install the extension for your browser (Chrome, Edge and Firefox are supported — see the{" "}
            <code className="rounded bg-paper-2 px-1">extension/</code> folder in the repo for load
            instructions).
          </li>
          <li>Open the extension, paste your token, and set the API address:</li>
        </ol>
        <div className="mt-3 rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-sm">
          {APP_URL}
        </div>
        <p className="mt-3 text-sm text-muted">
          Then play any audio or video in a tab, click the extension, and choose a quality level to
          transcribe it. The result appears in{" "}
          <a href="/dashboard" className="text-brand hover:underline">
            My transcriptions
          </a>
          , billed to your account just like uploads.
        </p>
      </div>
    </div>
  );
}
