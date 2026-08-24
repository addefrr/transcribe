import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  apiTokens,
  creditLedger,
  folders,
  jobs,
  subscriptions,
  transcriptRevisions,
  transcripts,
} from "@/lib/schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const [jobRows, ledger, folderRows, subscriptionRows, tokenRows] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.userId, user.id)),
    db.select().from(creditLedger).where(eq(creditLedger.userId, user.id)),
    db.select().from(folders).where(eq(folders.userId, user.id)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)),
    db
      .select({ id: apiTokens.id, name: apiTokens.name, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt })
      .from(apiTokens)
      .where(eq(apiTokens.userId, user.id)),
  ]);
  const jobIds = new Set(jobRows.map((job) => job.id));
  const [transcriptRows, revisionRows] = jobIds.size
    ? await Promise.all([
        db.select().from(transcripts).where(inArray(transcripts.jobId, [...jobIds])),
        db
          .select()
          .from(transcriptRevisions)
          .where(inArray(transcriptRevisions.jobId, [...jobIds])),
      ])
    : [[], []];
  const safeJobs = jobRows.map((row) => {
    const { costPerMinuteCents, estCostCents, providerStartedAt, ...job } = row;
    void costPerMinuteCents;
    void estCostCents;
    void providerStartedAt;
    return job;
  });
  const body = JSON.stringify({
    format: "transcribe-account-export-v1",
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      creditBalance: user.creditBalance,
      createdAt: user.createdAt,
    },
    subscriptions: subscriptionRows,
    creditLedger: ledger,
    folders: folderRows,
    apiTokens: tokenRows,
    jobs: safeJobs,
    transcripts: transcriptRows.filter((transcript) => jobIds.has(transcript.jobId)),
    transcriptRevisions: revisionRows.filter((revision) => jobIds.has(revision.jobId)),
  }, null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="transcribe-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
