import type { PersonBeat } from "@/lib/people";

export const BEAT_LABELS: Record<PersonBeat, string> = {
  music: "Music",
  drama: "Drama",
  art: "Art",
  literature: "Literature",
  science: "Science",
  politics: "Politics",
  foreign: "Foreign Affairs",
  economics: "Economics",
  direction: "Direction",
};

export function getBeatLabel(beat: string | null | undefined): string | null {
  if (!beat) return null;
  const key = beat.toLowerCase() as PersonBeat;
  return BEAT_LABELS[key] ?? beat.charAt(0).toUpperCase() + beat.slice(1);
}
