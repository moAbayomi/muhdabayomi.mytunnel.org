# Sketches

Generative p5.js sketches for the home page. One is active at a time; the
rotation changes every **3 days** (`ROTATION_DAYS` in `index.ts`).

## Add a sketch

1. Create `my-sketch.ts` in this folder:

   ```ts
   import type { SketchModule } from "./types";

   const mySketch: SketchModule = {
     id: "my-sketch",
     title: "my sketch",
     run({ p, seed, width, height, palette, reduceMotion }) {
       p.setup = () => {
         p.pixelDensity(
           window.innerWidth < 640 ? 1 : Math.min(window.devicePixelRatio || 1, 2),
         );
         p.createCanvas(width, height);
         p.randomSeed(seed);
         p.noiseSeed(seed);
       };

       p.draw = () => {
         p.clear();
         // ... draw with palette.ink / muted / rule / accent / paper
         if (reduceMotion) p.noLoop(); // one static frame
       };

       p.windowResized = () => {
         const parent = p.canvas?.parentElement;
         if (parent) p.resizeCanvas(parent.clientWidth, parent.clientHeight);
       };
     },
   };

   export default mySketch;
   ```

2. Register it in `index.ts`:

   ```ts
   { id: "my-sketch", load: () => import("./my-sketch") },
   ```

3. `pnpm --filter web dev` and scroll the home page.

## Rules

- **Seed everything.** `randomSeed(seed)` and `noiseSeed(seed)` make the
  drawing stable for the whole rotation window. Without them it changes
  on every reload.
- **Use the palette**, not literal colours, so dark mode works.
- **Honour `reduceMotion`**: draw one frame, then `p.noLoop()`.
- **Keep it quiet.** This sits on a reading page; motion should be slow.
- **Size from `width`/`height`**, never `windowWidth`/`windowHeight` — the
  canvas lives inside a fixed-height band.

The component (`src/components/Sketch.astro`) handles the rest: lazy-loading
after first paint, offscreen pausing, tab-hidden pausing, and the DPR cap.
