import type { TranscriptSegment } from "./schema";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function stamp(seconds: number, msSeparator: string): string {
  // Round to whole milliseconds FIRST so e.g. 59.9996s becomes 60.000s
  // instead of the malformed 59s + 1000ms.
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
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
