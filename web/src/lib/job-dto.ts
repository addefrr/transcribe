import type { Job } from "./schema";

/**
 * The customer-facing representation of a transcription job. Provider-cost
 * assumptions, storage keys, account IDs, queue claims, and subscription IDs
 * stay server-side even when the requester owns the job.
 */
export function customerJob(job: Job) {
  return {
    id: job.id,
    sourceType: job.sourceType,
    sourceUrl: job.sourceUrl,
    originalFilename: job.originalFilename,
    outputName: job.outputName,
    tier: job.tier,
    billing: job.billing,
    folderId: job.folderId,
    diarize: job.diarize,
    status: job.status,
    durationSeconds: job.durationSeconds,
    creditsHeld: job.creditsHeld,
    creditsCharged: job.creditsCharged,
    subscriptionMinutesHeld: job.subscriptionMinutesHeld,
    subscriptionMinutesCharged: job.subscriptionMinutesCharged,
    language: job.language,
    error: job.error,
    // Components need availability, never the underlying object-store key.
    audioKey: job.audioKey ? "available" : null,
    audioExpiresAt: job.audioExpiresAt,
    shareId: job.shareId,
    requiresConfirmation: job.requiresConfirmation,
    confirmedAt: job.confirmedAt,
    provider: job.provider,
    model: job.model,
    resultSource: job.resultSource,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export type CustomerJob = ReturnType<typeof customerJob>;
