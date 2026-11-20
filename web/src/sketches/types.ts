import type p5 from "p5";

export type Palette = {
  ink: string;
  muted: string;
  rule: string;
  accent: string;
  paper: string;
};

export type SketchContext = {
  p: p5;
  /** Stable for one rotation window. Pass it to randomSeed()/noiseSeed(). */
  seed: number;
  width: number;
  height: number;
  /** Colours read from the CSS custom properties, so sketches follow the theme. */
  palette: Palette;
  /** When true, draw one frame and call p.noLoop(). */
  reduceMotion: boolean;
};

export type SketchModule = {
  id: string;
  title: string;
  run: (context: SketchContext) => void;
};
