import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLanguageCode } from "@/lib/languages";
import { isPlaylistUrl } from "@/lib/playlist";
import { isTier } from "@/lib/pricing";
import { jobBatches } from "@/lib/schema";
import { getSettings } from "@/lib/settings";
import { screenUrl } from "@/lib/ssrf";

const bodySchema = z.object({
  url: z.string().min(1).max(2000),
  tier: z.string(),
  language: z.string().optional(),
  diarize: z.boolean().optional(),
});

// Create a playlist batch. The worker expands it; the user confirms the price
// via /batches/[id] before any transcription starts.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
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
  const tier = diarize ? "premium" : body.tier;
  const settings = await getSettings();

  const [batch] = await db
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
  return NextResponse.json({ batchId: batch.id }, { status: 201 });
}
