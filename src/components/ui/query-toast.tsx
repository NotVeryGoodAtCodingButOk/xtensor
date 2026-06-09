"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ToastState = {
  message: string;
  description?: string | null;
};

export function QueryToast({
  message,
  description,
  clearKeys = [],
}: {
  message?: string | null;
  description?: string | null;
  clearKeys?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastState | null>(
    message ? { message, description } : null,
  );
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!message) return;
    setToast({ message, description });
    clearedRef.current = false;
  }, [message, description]);

  useEffect(() => {
    if (!message || clearKeys.length === 0 || clearedRef.current) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    let changed = false;

    for (const key of clearKeys) {
      if (nextParams.has(key)) {
        nextParams.delete(key);
        changed = true;
      }
    }

    if (!changed) {
      clearedRef.current = true;
      return;
    }

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
    clearedRef.current = true;
  }, [clearKeys, message, pathname, router, searchParams]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 max-w-sm">
      <div className="pointer-events-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-lg">
        <div className="xt-hazard h-1.5" />
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--xt-black)]">{toast.message}</p>
            {toast.description ? (
              <p className="mt-1 text-xs text-[var(--xt-steel)]">{toast.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-transparent text-[var(--xt-steel)] transition-colors hover:border-[var(--xt-aluminum)] hover:text-[var(--xt-black)]"
            aria-label="Cerrar notificación"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
