"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type WorkerCard = {
  id: string;
  full_name: string;
  role: string;
  display_color: string | null;
};

export function WorkerPicker({ workers }: { workers: WorkerCard[] }) {
  const router = useRouter();

  useEffect(() => {
    for (const worker of workers) {
      router.prefetch(`/planta/maquinas?workerId=${worker.id}`);
    }
  }, [router, workers]);

  return (
    <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
      {workers.map((worker) => (
        <Link
          key={worker.id}
          href={`/planta/maquinas?workerId=${worker.id}`}
          onClick={() => {
            void fetch("/planta/api/worker", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ workerId: worker.id }),
              keepalive: true,
            });
          }}
          className="flex h-[200px] w-full flex-col justify-end border border-[var(--xt-black)] p-6 text-left text-white shadow-[var(--shadow-stamp)] transition-transform duration-200 ease-[var(--ease-snap)] active:translate-y-px active:shadow-none"
          style={{ background: worker.display_color ?? "var(--xt-black)" }}
        >
          <span className="[font-family:var(--font-barlow-condensed)] text-3xl font-bold leading-tight">
            {worker.full_name}
          </span>
          <span className="mt-2 text-lg opacity-90">{worker.role}</span>
        </Link>
      ))}
    </div>
  );
}
