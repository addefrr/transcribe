import type { TranscriptSegment } from "./schema";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function stamp(seconds: number, msSeparator: string): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${msSeparator}${pad(ms, 3)}`;
}

export function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${stamp(seg.start, ",")} --> ${stamp(seg.end, ",")}\n${seg.text}\n`,
    )
    .join("\n");
}

export function segmentsToVtt(segments: TranscriptSegment[]): string {
  const body = segments
    .map((seg) => `${stamp(seg.start, ".")} --> ${stamp(seg.end, ".")}\n${seg.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
