import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";

const FACTORY_COOKIE = "xt_factory";
const WORKER_COOKIE = "xt_worker";
const ONE_DAY_SECONDS = 60 * 60 * 24;

export async function setFactoryUnlocked() {
  const cookieStore = await cookies();
  cookieStore.set(FACTORY_COOKIE, signValue("unlocked"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_DAY_SECONDS,
  });
}

export async function isFactoryUnlocked() {
  const cookieStore = await cookies();
  const value = cookieStore.get(FACTORY_COOKIE)?.value;
  return Boolean(value && verifySignedValue(value, "unlocked"));
}

export async function clearFactorySession() {
  const cookieStore = await cookies();
  cookieStore.delete(FACTORY_COOKIE);
  cookieStore.delete(WORKER_COOKIE);
}

export async function setActiveWorker(workerId: string) {
  const cookieStore = await cookies();
  cookieStore.set(WORKER_COOKIE, signValue(workerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/planta",
  });
}

export async function getActiveWorkerId() {
  const cookieStore = await cookies();
  const value = cookieStore.get(WORKER_COOKIE)?.value;
  if (!value) {
    return null;
  }

  return verifySignedValue(value);
}

export async function clearActiveWorker() {
  const cookieStore = await cookies();
  cookieStore.delete(WORKER_COOKIE);
}

function signValue(value: string) {
  const signature = createHmac("sha256", requireEnv("FACTORY_COOKIE_SECRET")).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function verifySignedValue(signedValue: string, expectedValue?: string) {
  const separatorIndex = signedValue.lastIndexOf(".");
  if (separatorIndex === -1) {
    return null;
  }

  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);

  if (expectedValue && value !== expectedValue) {
    return null;
  }

  const expectedSignature = createHmac("sha256", requireEnv("FACTORY_COOKIE_SECRET"))
    .update(value)
    .digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer) ? value : null;
}
