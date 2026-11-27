import { handleWaitlistPost } from '@/lib/waitlist';

export async function POST(req: Request): Promise<Response> {
  return handleWaitlistPost(req, {
    env: {
      WAITLIST_EDGE_URL: process.env.WAITLIST_EDGE_URL,
      WAITLIST_EDGE_SECRET: process.env.WAITLIST_EDGE_SECRET,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });
}
