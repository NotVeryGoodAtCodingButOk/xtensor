import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { getFloorSnapshot } from "@/services/floor-snapshot";

/**
 * Snapshot de la planta para trabajar sin conexión (ver src/lib/floor). Con
 * If-None-Match responde 304 si nada cambió: el Wi-Fi de la planta es débil y
 * el iPad lo pide cada 30 s.
 */
export async function GET(request: Request) {
  if (!(await isFactoryUnlocked())) {
    return new NextResponse(null, { status: 401 });
  }

  const snapshot = await getFloorSnapshot();
  const { serverTime, ...content } = snapshot;
  const etag = `"${createHash("sha1").update(JSON.stringify(content)).digest("base64url")}"`;
  const headers = {
    "Cache-Control": "no-store",
    ETag: etag,
    // Aun sin cuerpo, el iPad necesita la hora del servidor para sus cronómetros.
    "X-Server-Time": String(serverTime),
  };

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return NextResponse.json(snapshot, { headers });
}
