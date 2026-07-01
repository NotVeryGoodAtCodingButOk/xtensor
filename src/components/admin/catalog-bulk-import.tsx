"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import {
  applyCatalogImportAction,
  previewCatalogImportAction,
  type CatalogImportSummary,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

const ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function CatalogBulkImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [applying, startApply] = useTransition();

  function reset() {
    setFileName(null);
    setPreview(null);
    setError(null);
    setSuccess(null);
  }

  function close() {
    if (parsing || applying) return;
    setOpen(false);
    reset();
  }

  function handleFile(file: File) {
    setError(null);
    setSuccess(null);
    setPreview(null);
    setFileName(file.name);
    startParse(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await previewCatalogImportAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPreview(result);
    });
  }

  function handleConfirm() {
    if (!preview || preview.newRows.length === 0) return;
    setError(null);
    startApply(async () => {
      const result = await applyCatalogImportAction({ rows: preview.newRows });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPreview(null);
      setSuccess(
        `Se crearon ${result.created} equipo(s) nuevo(s)` +
          (result.masterPreviosCreated > 0 ? ` y ${result.masterPreviosCreated} previo(s) maestro(s)` : "") +
          "." +
          (result.skipped > 0 ? ` Se omitieron ${result.skipped}.` : ""),
      );
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Cargar Excel
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="w-full max-w-2xl border border-[var(--xt-black)] bg-[var(--xt-white)] shadow-[var(--shadow-md)]">
            <div className="flex items-start justify-between border-b border-[var(--xt-cement)] px-5 py-4">
              <div>
                <p className="xt-eyebrow">Catálogo</p>
                <h2 className="text-lg font-bold">Cargar equipos desde Excel</h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                disabled={parsing || applying}
                className="rounded-[2px] border border-[var(--xt-aluminum)] p-1 text-[var(--xt-steel)] hover:border-[var(--xt-black)] hover:text-[var(--xt-black)] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 px-5 py-4">
              <p className="text-sm text-[var(--xt-steel)]">
                Descarga el catálogo, agrega las filas nuevas y vuelve a subir el archivo. Solo se crearán equipos con un
                <strong> código nuevo</strong>. Los códigos que ya existen se omiten y nada existente se modifica ni se
                elimina.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                  event.target.value = "";
                }}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing || applying}
                >
                  {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  {fileName ? "Elegir otro archivo" : "Seleccionar archivo"}
                </Button>
                {fileName ? (
                  <span className="flex items-center gap-2 text-sm text-[var(--xt-steel)]">
                    <FileSpreadsheet className="h-4 w-4" />
                    {fileName}
                  </span>
                ) : null}
              </div>

              {error ? (
                <div className="rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              ) : null}

              {success ? (
                <div className="rounded-[2px] border border-[var(--xt-cement)] bg-[var(--xt-yellow-soft)] px-4 py-3 text-sm text-[var(--xt-black)]">
                  {success}
                </div>
              ) : null}

              {preview ? <PreviewSummary preview={preview} /> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--xt-cement)] px-5 py-4">
              {preview ? (
                <>
                  <Button type="button" variant="ghost" onClick={close} disabled={applying}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleConfirm} disabled={applying || preview.counts.new === 0}>
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirmar y crear {preview.counts.new}
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" onClick={close} disabled={parsing || applying}>
                  {success ? "Cerrar" : "Cancelar"}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PreviewSummary({ preview }: { preview: CatalogImportSummary }) {
  const { counts } = preview;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Nuevos" value={counts.new} highlight />
        <Stat label="Ya existen" value={counts.existing} />
        <Stat label="Duplicados" value={counts.duplicate} />
        <Stat label="Inválidos" value={counts.invalid} />
      </div>

      {counts.new === 0 ? (
        <p className="text-sm text-[var(--xt-steel)]">
          No hay equipos nuevos para crear en este archivo.
        </p>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">
            Se crearán {counts.new} equipo{counts.new === 1 ? "" : "s"} nuevo{counts.new === 1 ? "" : "s"}:
          </p>
          <ul className="max-h-48 overflow-y-auto border border-[var(--xt-cement)] bg-[var(--xt-paper)] text-sm">
            {preview.newRows.map((row) => (
              <li
                key={row.code}
                className="flex items-baseline gap-2 border-b border-[var(--xt-cement)] px-3 py-1.5 last:border-b-0"
              >
                <span className="font-medium">{row.code}</span>
                <span className="text-[var(--xt-steel)]">{row.name}</span>
                {row.previos.length > 0 ? (
                  <span className="ml-auto shrink-0 text-xs text-[var(--xt-aluminum)]">
                    {row.previos.length} previo{row.previos.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.newMasterPrevios.length > 0 ? (
        <p className="text-sm text-[var(--xt-steel)]">
          <span className="font-semibold text-[var(--xt-black)]">
            Se crearán {preview.newMasterPrevios.length} previo{preview.newMasterPrevios.length === 1 ? "" : "s"} maestro
            {preview.newMasterPrevios.length === 1 ? "" : "s"}:
          </span>{" "}
          {preview.newMasterPrevios.join(", ")}
        </p>
      ) : null}

      {preview.invalidRows.length > 0 ? (
        <div className="grid gap-1 rounded-[2px] border border-[var(--xt-cement)] bg-[var(--xt-paper)] px-3 py-2 text-sm">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 text-[var(--xt-yellow-deep)]" />
            Filas inválidas (se omiten)
          </p>
          <ul className="grid gap-0.5 text-[var(--xt-steel)]">
            {preview.invalidRows.map((row) => (
              <li key={row.rowIndex}>
                Fila {row.rowIndex}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={
        highlight
          ? "border border-[var(--xt-black)] bg-[var(--xt-yellow-soft)] px-3 py-2"
          : "border border-[var(--xt-cement)] bg-[var(--xt-paper)] px-3 py-2"
      }
    >
      <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.1em] text-[var(--xt-steel)]">{label}</p>
    </div>
  );
}
