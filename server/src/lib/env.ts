import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated environment. Fail fast at boot if something required is
 * missing rather than at first use deep in a worker.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  CONFIG_DIR: z.string().default('./config'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),

  // Database (Neon)
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url().optional(),

  // Queue
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Evidence store (Cloudinary — signed REST API, all evidence)
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('dda-evidence'),
  // Local fallback dir when Cloudinary isn't configured (dev only).
  EVIDENCE_DIR: z.string().default('./.evidence'),

  // On-chain
  SOLANA_RPC_URL: z.string().optional(),
  HELIUS_API_KEY: z.string().optional(),
  GEYSER_ENDPOINT: z.string().optional(),

  // Modules
  GITHUB_TOKEN: z.string().optional(),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),
  X_READ_PROVIDER_KEY: z.string().optional(),

  // LLM (summary only, downstream of persistence)
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('claude-sonnet-5'),

  // Publisher
  PUBLISHER_DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  // Security / hardening
  ADMIN_TOKEN: z.string().optional(), // bearer token for /api/admin/*; unset = fail closed
  ALLOWED_ORIGINS: z.string().default('*'), // comma-separated; '*' allows all (dev only)
  HELIUS_WEBHOOK_SECRET: z.string().optional(), // require matching Authorization on the webhook
  RATE_LIMIT_MAX: z.coerce.number().default(30),
  RATE_LIMIT_WINDOW_SEC: z.coerce.number().default(60),
  BODY_LIMIT_BYTES: z.coerce.number().default(1_000_000),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;

/** Resolved Solana RPC endpoint: explicit URL, else Helius, else public mainnet. */
export function solanaRpcUrl(): string {
  if (env.SOLANA_RPC_URL) return env.SOLANA_RPC_URL;
  if (env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  return 'https://api.mainnet-beta.solana.com';
}
