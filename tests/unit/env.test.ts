import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPublicEnv, getServerEnv } from "@/lib/env";

const envKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_PUBLIC_VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FACTORY_COOKIE_SECRET",
] as const;

const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("environment configuration", () => {
  it("defaults the app URL for local development", () => {
    expect(getServerEnv().NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("accepts a Vercel-style app host without a protocol", () => {
    process.env.NEXT_PUBLIC_APP_URL = "xtensor.vercel.app";

    expect(getServerEnv().NEXT_PUBLIC_APP_URL).toBe("https://xtensor.vercel.app");
  });

  it("falls back to Vercel production URL on the server", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "xtensor.com";

    expect(getServerEnv().NEXT_PUBLIC_APP_URL).toBe("https://xtensor.com");
  });

  it("falls back to the public Vercel production URL for browser config", () => {
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL = "xtensor.com";

    expect(getPublicEnv().NEXT_PUBLIC_APP_URL).toBe("https://xtensor.com");
  });

  it("still rejects malformed app URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";

    expect(() => getServerEnv()).toThrow(/Invalid url/);
  });
});
