import { z } from "zod";

const DEFAULT_APP_URL = "http://localhost:3000";

function normalizeAppUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return url.replace(/\/+$/, "");
}

function firstAppUrl(...values: Array<string | undefined>) {
  for (const value of values) {
    const appUrl = normalizeAppUrl(value);
    if (appUrl) {
      return appUrl;
    }
  }

  return undefined;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default(DEFAULT_APP_URL),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  FACTORY_COOKIE_SECRET: z.string().optional(),
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: firstAppUrl(
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
      process.env.NEXT_PUBLIC_VERCEL_URL,
    ),
  });
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: firstAppUrl(
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.NEXT_PUBLIC_VERCEL_URL,
      process.env.VERCEL_URL,
    ),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    FACTORY_COOKIE_SECRET: process.env.FACTORY_COOKIE_SECRET,
  });
}

export function requireEnv(name: keyof z.infer<typeof serverEnvSchema>) {
  const value = getServerEnv()[name];
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

export function hasSupabaseConfig() {
  const env = getServerEnv();
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function hasFactoryConfig() {
  return Boolean(hasSupabaseConfig() && getServerEnv().FACTORY_COOKIE_SECRET);
}
