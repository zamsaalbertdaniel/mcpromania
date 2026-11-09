import { z } from 'zod';

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  ANAF_API_URL: z.string().url().default('https://api.anaf.ro/PlatitorTvaRest/api/v8/ws/tva'),
  BNR_XML_URL: z.string().url().default('https://www.bnr.ro/nbrfxrates.xml'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  AUTH_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().default(30_000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(3000).default(3000),
});

export type GatewayEnv = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): GatewayEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid gateway environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
