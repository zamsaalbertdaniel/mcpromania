import { serve } from '@hono/node-server';
import 'dotenv/config';

import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createRedis } from './core/redis.js';
import { createSupabaseGateway } from './core/supabase.js';

const env = parseEnv(process.env);
const redis = createRedis(env.REDIS_URL);
const supabase = createSupabaseGateway(env);
const app = createApp({ env, redis, supabase });

const server = serve({
  fetch: app.fetch,
  port: env.PORT,
  hostname: '0.0.0.0',
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.warn(`Gateway shutting down (${signal})`);
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  try {
    await redis.quit();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'redis quit failed';
    console.error(message);
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
