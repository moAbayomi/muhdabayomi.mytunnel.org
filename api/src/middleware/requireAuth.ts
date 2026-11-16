import { MiddlewareHandler } from 'hono';
import { verifyToken } from '../lib/auth';
import { AppEnv } from '../env';
import { AppError } from '../errors';

export const requireAuth = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'unauthorized', 'Missing token');

  const payload = await verifyToken(c.env.AUTH_SECRET, token);
  if (!payload) throw new AppError(401, 'unauthorized', 'Invalid or expired token');

  c.set('userId', payload.sub);
  await next();
};