import { Hono } from "hono";
import { mintToken } from "../lib/auth";
import { AppError } from "../errors";
import { AppEnv } from "../env";
import { constantTimeEqual, getClientIp } from "../lib/auth";
import { sql } from "../db";
import { zValidator } from "@hono/zod-validator";
import { validationErrorHook } from "../validation";
import z from "zod";

const auth = new Hono<AppEnv>();

const loginBodySchema = z.object({
  password: z.string().min(1, "Password is required"),
});

auth.post(
  "/login",
  zValidator("json", loginBodySchema, (result, c) =>
    validationErrorHook(result, c),
  ),
  async (c) => {
    const ip = getClientIp(c);

    // 1. Check the rate limit BEFORE touching the password —
    //    no point doing constant-time comparison for a rejected IP.
    const [rate] = (await sql`
      SELECT * FROM check_login_rate(${ip})
    `) as {
      allowed: boolean;
      failure_count: number;
      retry_after_seconds: number;
    }[];

    if (!rate.allowed) {
      c.header("Retry-After", String(rate.retry_after_seconds));
      throw new AppError(
        429,
        "too_many_attempts",
        "Too many failed login attempts. Try again later.",
        { retry_after_seconds: rate.retry_after_seconds },
      );
    }

    // 2. Verify the password (constant-time — see lib/auth.ts).
    const { password } = c.req.valid("json");
    const ok = await constantTimeEqual(
      password,
      c.env.ADMIN_PASSWORD,
      c.env.AUTH_SECRET,
    );

    if (!ok) {
      // 3. Log the failure, THEN throw. If we threw first, the insert
      //    wouldn't run.
      await sql`INSERT INTO login_attempts (ip) VALUES (${ip})`;
      throw new AppError(401, "invalid_credentials", "Invalid password");
    }

    // 4. Successful login clears the failure log for this IP —
    //    a legit user who mistyped twice shouldn't stay penalized.
    await sql`DELETE FROM login_attempts WHERE ip = ${ip}`;

    const token = await mintToken(c.env.AUTH_SECRET, "admin");
    return c.json({ token });
  },
);

export default auth;
