import { z } from 'zod';

const envSchema = z.object({
  NOTES_PASSWORD_HASH: z.string().min(1),
  NOTES_SESSION_SECRET: z.string().min(32),
  NOTES_ALLOWED_ORIGINS: z.string().min(1),
  NOTES_OWNER_ID: z.string().min(1).max(160).default('owner'),
  NOTES_DATABASE_PATH: z.string().min(1).default('./var/notes.sqlite3'),
  NOTES_STATIC_DIR: z.string().min(1).default('./dist/client'),
  NOTES_HOST: z.string().min(1).default('127.0.0.1'),
  NOTES_PORT: z.coerce.number().int().min(1).max(65_535).default(8788),
  NOTES_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(16_384)
    .max(16 * 1024 * 1024)
    .default(2 * 1024 * 1024),
  NOTES_SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  NOTES_SECURE_COOKIE: z.enum(['true', 'false']).default('true'),
});

export type ServerConfig = {
  passwordHash: string;
  sessionSecret: string;
  allowedOrigins: ReadonlySet<string>;
  ownerId: string;
  databasePath: string;
  staticDir: string;
  host: string;
  port: number;
  bodyLimit: number;
  sessionMaxAgeSeconds: number;
  secureCookie: boolean;
};

function normalizeOrigin(value: string) {
  const url = new URL(value.trim());
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(`Origin must not include a path: ${value}`);
  return url.origin;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.parse(env);
  const allowedOrigins = new Set(
    parsed.NOTES_ALLOWED_ORIGINS.split(',')
      .map(normalizeOrigin)
      .filter(Boolean),
  );
  if (allowedOrigins.size === 0)
    throw new Error('NOTES_ALLOWED_ORIGINS must contain at least one origin');

  return {
    passwordHash: parsed.NOTES_PASSWORD_HASH,
    sessionSecret: parsed.NOTES_SESSION_SECRET,
    allowedOrigins,
    ownerId: parsed.NOTES_OWNER_ID,
    databasePath: parsed.NOTES_DATABASE_PATH,
    staticDir: parsed.NOTES_STATIC_DIR,
    host: parsed.NOTES_HOST,
    port: parsed.NOTES_PORT,
    bodyLimit: parsed.NOTES_BODY_LIMIT_BYTES,
    sessionMaxAgeSeconds: parsed.NOTES_SESSION_DAYS * 24 * 60 * 60,
    secureCookie: parsed.NOTES_SECURE_COOKIE === 'true',
  };
}
