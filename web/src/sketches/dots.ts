import type { SketchModule } from "./types";

/**
 * A grid of dots whose radius breathes with p5's noise field.
 * Dense dots turn accent-coloured; the rest stay muted.
 */
const dots: SketchModule = {
  id: "dots",
  title: "dots",
  run({ p, seed, width, height, palette, reduceMotion }) {
    const GAP = 22;

    p.setup = () => {
      p.pixelDensity(
        window.innerWidth < 640
          ? 1
          : Math.min(window.devicePixelRatio || 1, 2),
      );
      p.createCanvas(width, height);
      p.randomSeed(seed);
      p.noiseSeed(seed);
      p.noStroke();
    };

    p.draw = () => {
      p.clear();
      const t = p.millis() / 1000;

      for (let x = GAP / 2; x < width; x += GAP) {
        for (let y = GAP / 2; y < height; y += GAP) {
          const n = p.noise(x * 0.01, y * 0.01, t * 0.05);
          const radius = 0.8 + n * 2.6;
          p.fill(n > 0.62 ? palette.accent : palette.muted);
          p.circle(x, y, radius * 2);
        }
      }

      if (reduceMotion) p.noLoop();
    };

    p.windowResized = () => {
      const parent = p.canvas?.parentElement;
      if (parent) p.resizeCanvas(parent.clientWidth, parent.clientHeight);
    };
  },
};

export default dots;
