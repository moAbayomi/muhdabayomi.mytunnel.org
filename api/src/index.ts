import { Hono } from "hono";

export interface Env {
  WEB_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "blog-api",
    version: "0.1.0",
  }),
);

export default app;
