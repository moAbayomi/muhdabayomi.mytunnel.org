import type { SketchModule } from "./types";

/** How long each sketch stays on the home page. */
export const ROTATION_DAYS = 3;

type SketchEntry = {
  id: string;
  /** Dynamic import so only the active sketch is downloaded. */
  load: () => Promise<{ default: SketchModule }>;
};

/**
 * The rotation. Add a sketch file to this folder and an entry here; order
 * is rotation order. Keep this list small — every entry is one more thing
 * to maintain.
 */
export const sketches: SketchEntry[] = [
  { id: "drift", load: () => import("./drift") },
  { id: "dots", load: () => import("./dots") },
];

/**
 * Deterministic pick: divide time into ROTATION_DAYS blocks and cycle.
 * Same sketch for everyone, all day, until the block changes.
 */
export function sketchIndexFor(date = new Date()): number {
  const dayNumber = Math.floor(date.getTime() / 86_400_000);
  return Math.floor(dayNumber / ROTATION_DAYS) % sketches.length;
}

export async function loadActiveSketch(date = new Date()) {
  const index = sketchIndexFor(date);
  const entry = sketches[index]!;
  const sketch = (await entry.load()).default;
  return { index, sketch };
}
