import type { SketchModule } from "./types";

/**
 * Slow horizontal lines, each drifting on its own sine phase.
 * Every tenth line uses the accent colour.
 */
const drift: SketchModule = {
  id: "drift",
  title: "drift",
  run({ p, seed, width, height, palette, reduceMotion }) {
    const LINE_COUNT = 30;
    let phases: number[] = [];

    p.setup = () => {
      p.pixelDensity(
        window.innerWidth < 640
          ? 1
          : Math.min(window.devicePixelRatio || 1, 2),
      );
      p.createCanvas(width, height);
      p.randomSeed(seed);
      p.noiseSeed(seed);
      phases = Array.from({ length: LINE_COUNT }, () => p.random(0, p.TWO_PI));
      p.noFill();
      p.strokeWeight(1);
    };

    p.draw = () => {
      p.clear();
      const t = p.millis() / 1000;

      for (let i = 0; i < LINE_COUNT; i += 1) {
        const y = (i / (LINE_COUNT - 1)) * height;
        p.stroke(i % 10 === 0 ? palette.accent : palette.muted);
        p.beginShape();
        for (let x = 0; x <= width; x += 10) {
          const amplitude = 4 + p.noise(i * 0.2, t * 0.03) * 12;
          const wave = Math.sin(x * 0.008 + t * 0.2 + phases[i]!) * amplitude;
          p.vertex(x, y + wave);
        }
        p.endShape();
      }

      if (reduceMotion) p.noLoop();
    };

    p.windowResized = () => {
      const parent = p.canvas?.parentElement;
      if (parent) p.resizeCanvas(parent.clientWidth, parent.clientHeight);
    };
  },
};

export default drift;
