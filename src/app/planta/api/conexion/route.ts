import { NextResponse } from "next/server";
import { isFactoryUnlocked } from "@/lib/factory-session";
import { saveConnectivityEvents } from "@/services/connectivity";

/**
 * Recibe los eventos de conexión que anota ConnectionLogger. Es una ruta y no
 * una server action para no hacer fila con las acciones de los operarios en el
 * router de Next cuando la red está lenta.
 */
export async function POST(request: Request) {
  if (!(await isFactoryUnlocked())) {
    return new NextResponse(null, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { deviceId?: unknown; events?: unknown } | null;
  if (!body || typeof body.deviceId !== "string" || !Array.isArray(body.events)) {
    return new NextResponse(null, { status: 400 });
  }

  await saveConnectivityEvents(body.deviceId, request.headers.get("user-agent") ?? "", body.events);
  return new NextResponse(null, { status: 204 });
}
