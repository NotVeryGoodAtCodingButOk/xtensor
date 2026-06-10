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
    <div className="xt-toast pointer-events-none fixed bottom-5 right-5 z-50 w-full max-w-[26rem] px-3 sm:px-0">
      <div className="xt-toast-panel pointer-events-auto border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-xl">
        <div className="xt-hazard h-2" />
        <div className="xt-toast-body flex items-start gap-4 px-5 py-4">
          <div className="xt-toast-content min-w-0 flex-1">
            <p className="xt-toast-message text-base font-semibold text-[var(--xt-black)]">{toast.message}</p>
            {toast.description ? (
              <p className="xt-toast-description mt-1.5 text-sm text-[var(--xt-steel)]">{toast.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="xt-toast-close inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-transparent text-[var(--xt-steel)] transition-colors hover:border-[var(--xt-aluminum)] hover:text-[var(--xt-black)]"
            aria-label="Cerrar notificación"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
