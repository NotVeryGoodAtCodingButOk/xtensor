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
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
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
          className="flex min-h-[180px] w-full flex-col justify-end border border-[var(--xt-black)] p-5 text-left text-white shadow-[var(--shadow-stamp)] transition-transform duration-200 ease-[var(--ease-snap)] active:translate-y-px active:shadow-none md:min-h-[180px] md:p-6 xl:min-h-[200px]"
          style={{ background: worker.display_color ?? "var(--xt-black)" }}
        >
          <span className="[font-family:var(--font-barlow-condensed)] text-2xl font-bold leading-tight break-words lg:text-3xl">
            {worker.full_name}
          </span>
          <span className="mt-2 text-lg leading-snug opacity-90">{worker.role}</span>
        </Link>
      ))}
    </div>
  );
}
