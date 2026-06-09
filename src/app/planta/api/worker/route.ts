import { NextResponse } from "next/server";
import { isFactoryUnlocked, setActiveWorker } from "@/lib/factory-session";
import { listWorkers } from "@/services/catalog";

export async function POST(request: Request) {
  if (!(await isFactoryUnlocked())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { workerId } = (await request.json()) as { workerId?: string };
  const workers = await listWorkers(true);

  if (!workerId || !workers.some((worker) => worker.id === workerId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await setActiveWorker(workerId);
  return NextResponse.json({ ok: true });
}
