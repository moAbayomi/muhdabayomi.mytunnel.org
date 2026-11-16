import { neon } from '@neondatabase/serverless';
import { env } from 'cloudflare:workers';

export const sql = neon(env.DATABASE_URL);