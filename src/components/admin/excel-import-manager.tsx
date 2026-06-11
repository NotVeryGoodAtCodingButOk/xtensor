"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import {
  importQuoteAction,
  parseQuoteExcelAction,
  type ImportQuoteLineInput,
} from "@/app/admin/actions";
import {
  buildMachineRows,
  collectSerialsFromEntries,
  collectUsedSerialsForOtherLines,
  countEntryMachines,
  getLineSerialNumbers,
  getLineResolution,
  getLineUnitCount,
  initialLineState,
  resizeSerialNumbers,
  validateEntries,
  type ImportFileEntry,
} from "@/components/admin/excel-import-state";
import type { QuotePreview } from "@/services/quote-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateEs } from "@/services/schedule";

type CatalogOption = { id: string; code: string; name: string };
type ColorOption = { id: string; name: string };
type PreviewLine = QuotePreview["lines"][number];

const selectCls =
  "h-9 w-full rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

const peso = new Intl.NumberFormat("es-CO");

function buildImportLines(preview: QuotePreview, lineState: ImportFileEntry["lineState"]): ImportQuoteLineInput[] {
  return preview.lines.map((line) => {
    const state = lineState[line.rowIndex];
    const resolution = getLineResolution(line, state);
    const base = {
      producto: line.producto || line.clave,
      unidades: getLineUnitCount(line, state),
      serialNumbers: getLineSerialNumbers(line, state),
      pUnitCop: line.pUnitCop,
      colorId: state?.colorId ?? null,
      // Leave línea unset: catalog matches keep their own line; custom items have none.
      line: null,
    };
    if (resolution === "skip") return { ...base, resolution: "skip" as const };
    if (resolution === "custom") {
      return { ...base, resolution: "custom" as const, customName: line.producto || line.clave };
    }
    return { ...base, resolution: "catalog" as const, catalogId: resolution };
  });
}

export function ExcelImportManager({
  catalog,
  colors = [],
  queueEndDate,
}: {
  catalog: CatalogOption[];
  colors?: ColorOption[];
  queueEndDate: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<ImportFileEntry[]>([]);
  const defaultPromisedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return d.toISOString().slice(0, 10);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [importing, startImport] = useTransition();

  const validations = useMemo(() => validateEntries(entries), [entries]);
  const totalMachines = useMemo(
    () => entries.reduce((sum, entry) => sum + countEntryMachines(entry), 0),
    [entries],
  );
  const validCount = useMemo(
    () => entries.filter((entry) => validations[entry.id]?.valid).length,
    [entries, validations],
  );

  function handleSessionExpired() {
    setEntries([]);
    setError("Tu sesión expiró. Te llevaremos a iniciar sesión para continuar…");
    router.push("/admin/login?reason=session-expired&next=/admin/importar");
  }

  function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setNotice(null);
    startParse(async () => {
      try {
        const parsed: { fileName: string; preview: QuotePreview }[] = [];
        for (const file of files) {
          const formData = new FormData();
          formData.set("file", file);
          const result = await parseQuoteExcelAction(formData);
          if ("sessionExpired" in result) {
            handleSessionExpired();
            return;
          }
          parsed.push({ fileName: file.name, preview: result });
        }

        setEntries((prev) => {
          const next = [...prev];
          for (const { fileName, preview } of parsed) {
            const seedUsed = collectSerialsFromEntries(next);
            next.push({
              id: crypto.randomUUID(),
              fileName,
              preview,
              clientName: preview.clientName ?? "",
              promisedDate: defaultPromisedDate,
              lineState: initialLineState(preview, seedUsed),
            });
          }
          return next;
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo leer el archivo.");
      }
    });
  }

  function removeEntry(entryId: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
  }

  function updateEntryField(entryId: string, field: "clientName" | "promisedDate", value: string) {
    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, [field]: value } : entry)));
  }

  function updateLineUnits(entryId: string, line: PreviewLine, unidades: number) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const state = entry.lineState[line.rowIndex];
        const usedElsewhere = new Set([
          ...collectUsedSerialsForOtherLines(entry.lineState, line.rowIndex),
          ...collectSerialsFromEntries(prev, entry.id),
        ]);
        return {
          ...entry,
          lineState: {
            ...entry.lineState,
            [line.rowIndex]: {
              resolution: getLineResolution(line, state),
              unidades,
              serialNumbers: resizeSerialNumbers(state?.serialNumbers ?? line.serialNumbers, unidades, usedElsewhere),
            },
          },
        };
      }),
    );
  }

  function updateLineSerialNumber(entryId: string, line: PreviewLine, machineIndex: number, serialNumber: number) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const state = entry.lineState[line.rowIndex];
        const current = getLineSerialNumbers(line, state);
        current[machineIndex] = serialNumber;
        return {
          ...entry,
          lineState: {
            ...entry.lineState,
            [line.rowIndex]: {
              resolution: getLineResolution(line, state),
              unidades: getLineUnitCount(line, state),
              serialNumbers: current,
            },
          },
        };
      }),
    );
  }

  function updateLineColor(entryId: string, line: PreviewLine, colorId: string) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const state = entry.lineState[line.rowIndex];
        return {
          ...entry,
          lineState: {
            ...entry.lineState,
            [line.rowIndex]: {
              resolution: getLineResolution(line, state),
              unidades: getLineUnitCount(line, state),
              serialNumbers: getLineSerialNumbers(line, state),
              colorId: colorId || null,
            },
          },
        };
      }),
    );
  }

  function updateLineResolution(entryId: string, line: PreviewLine, resolution: string) {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const state = entry.lineState[line.rowIndex];
        return {
          ...entry,
          lineState: {
            ...entry.lineState,
            [line.rowIndex]: {
              resolution,
              unidades: getLineUnitCount(line, state),
              serialNumbers: getLineSerialNumbers(line, state),
            },
          },
        };
      }),
    );
  }

  function handleImport() {
    setError(null);
    setNotice(null);
    const importable = entries.filter((entry) => validations[entry.id]?.valid);
    if (importable.length === 0) {
      setError("No hay archivos válidos para importar. Revisa los datos marcados.");
      return;
    }

    startImport(async () => {
      const importedIds = new Set<string>();
      const failures: string[] = [];
      let totalCreated = 0;

      for (const entry of importable) {
        try {
          const result = await importQuoteAction({
            serialMode: "auto",
            clientName: entry.clientName.trim(),
            promisedDate: entry.promisedDate,
            lines: buildImportLines(entry.preview, entry.lineState),
          });
          if ("sessionExpired" in result) {
            handleSessionExpired();
            return;
          }
          totalCreated += result.created;
          importedIds.add(entry.id);
        } catch (caught) {
          const label = entry.clientName.trim() || entry.fileName;
          failures.push(`${label}: ${caught instanceof Error ? caught.message : "error al importar"}`);
        }
      }

      const remaining = entries.filter((entry) => !importedIds.has(entry.id));
      if (remaining.length === 0) {
        router.push(`/admin/previos?imported=${totalCreated}`);
        router.refresh();
        return;
      }

      setEntries(remaining);
      if (failures.length > 0) {
        setError(`Se importaron ${totalCreated} máquina(s). Fallaron: ${failures.join(" · ")}`);
      } else {
        setNotice(
          `Se importaron ${totalCreated} máquina(s). Quedan ${remaining.length} archivo(s) por corregir.`,
        );
      }
    });
  }

  function renderResolutionSelect(entryId: string, line: PreviewLine, resolution: string) {
    return (
      <select className={selectCls} value={resolution} onChange={(e) => updateLineResolution(entryId, line, e.target.value)}>
        <option value="custom">Crear nueva (personalizada)</option>
        <option value="skip">Omitir línea</option>
        <optgroup label="Catálogo">
          {catalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.name}
            </option>
          ))}
        </optgroup>
      </select>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <p className="xt-eyebrow">Administración</p>
        <h1 className="text-3xl font-bold">Importar cotizaciones</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          Sube uno o varios Excel de cotización. Cada archivo lleva su propio cliente y fecha prometida; las máquinas se
          agregan al final de la cola.
        </p>
      </div>

      {error ? (
        <div className="rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-[2px] border border-[var(--xt-cement)] bg-[var(--xt-yellow-soft)] px-4 py-3 text-sm text-[var(--xt-black)]">
          {notice}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Archivos de Excel</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) handleFiles(files);
              event.target.value = "";
            }}
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {entries.length > 0 ? "Agregar más archivos" : "Seleccionar archivos"}
          </Button>
          {entries.length > 0 ? (
            <span className="flex items-center gap-2 text-sm text-[var(--xt-steel)]">
              <FileSpreadsheet className="h-4 w-4" />
              {entries.length} archivo{entries.length === 1 ? "" : "s"} · {totalMachines} máquina
              {totalMachines === 1 ? "" : "s"}
            </span>
          ) : null}
        </CardContent>
      </Card>

      {entries.map((entry) => {
        const validation = validations[entry.id];
        const machineRows = buildMachineRows(entry.preview, entry.lineState);
        const entryMachines = countEntryMachines(entry);

        return (
          <Card key={entry.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>{entry.clientName.trim() || "Cliente sin nombre"}</CardTitle>
                <span className="flex items-center gap-2 text-xs text-[var(--xt-steel)]">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {entry.fileName} · {entry.preview.lines.length} líneas · {entryMachines} máquina
                  {entryMachines === 1 ? "" : "s"}
                  {entry.preview.reference ? ` · Ref. ${entry.preview.reference}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="flex items-center gap-1 rounded-[2px] border border-[var(--xt-aluminum)] px-2 py-1 text-xs text-[var(--xt-steel)] hover:border-[var(--xt-black)] hover:text-[var(--xt-black)]"
                aria-label={`Quitar ${entry.fileName}`}
              >
                <X className="h-3.5 w-3.5" />
                Quitar
              </button>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2 text-sm font-medium">
                  SERIAL
                  <div className="rounded-[2px] border border-[var(--xt-cement)] bg-[var(--xt-yellow-soft)] px-3 py-2 text-sm font-normal text-[var(--xt-black)]">
                    Se asignó una SERIAL por máquina; edítalas fila por fila en la tabla.
                  </div>
                </div>
                <label className="grid gap-2 text-sm font-medium">
                  Cliente
                  <Input
                    value={entry.clientName}
                    onChange={(e) => updateEntryField(entry.id, "clientName", e.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Fecha prometida
                  <Input
                    value={entry.promisedDate}
                    onChange={(e) => updateEntryField(entry.id, "promisedDate", e.target.value)}
                    type="date"
                  />
                  <span className="text-xs font-normal text-[var(--xt-steel)]">
                    Estimación fin de cola actual: {formatDateEs(queueEndDate)}
                  </span>
                </label>
              </div>

              {validation && !validation.valid ? (
                <div className="rounded-[2px] border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {validation.reason}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <Table className="min-w-[1060px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead className="w-24">Unidad</TableHead>
                      <TableHead className="w-36">SERIAL</TableHead>
                      <TableHead className="text-right">P.UNIT.</TableHead>
                      <TableHead className="w-36">Color</TableHead>
                      <TableHead className="w-72">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entry.preview.lines.flatMap((line) => {
                      const state = entry.lineState[line.rowIndex];
                      const resolution = getLineResolution(line, state);
                      const unitCount = getLineUnitCount(line, state);
                      const rows = machineRows.filter((row) => row.rowIndex === line.rowIndex);

                      return rows.map((row) => (
                        <TableRow
                          key={`${line.rowIndex}-${row.machineIndex}`}
                          className={resolution === "skip" ? "opacity-60" : undefined}
                        >
                          {row.machineIndex === 0 ? (
                            <TableCell rowSpan={unitCount} className="min-w-[240px] align-top">
                              <div className="grid gap-2">
                                <div>
                                  <span className="font-medium">{line.producto || "—"}</span>
                                  {!line.matchedCatalogId ? (
                                    <span className="ml-2 rounded-[2px] bg-[var(--xt-yellow)] px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                                      sin catálogo
                                    </span>
                                  ) : null}
                                </div>
                                <label className="flex items-center gap-2 text-xs font-medium text-[var(--xt-steel)]">
                                  UNID.
                                  <Input
                                    type="number"
                                    min="1"
                                    value={state?.unidades ?? line.unidades}
                                    onChange={(e) => updateLineUnits(entry.id, line, Number(e.target.value))}
                                    className="h-8 w-20"
                                  />
                                </label>
                              </div>
                            </TableCell>
                          ) : null}
                          {row.machineIndex === 0 ? (
                            <TableCell rowSpan={unitCount} className="align-top text-[var(--xt-steel)]">
                              {line.clave || "—"}
                            </TableCell>
                          ) : null}
                          <TableCell className="tabular-nums">
                            {row.machineIndex + 1} / {unitCount}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              max="999"
                              value={row.serialNumber}
                              disabled={resolution === "skip"}
                              onChange={(e) =>
                                updateLineSerialNumber(entry.id, line, row.machineIndex, Number(e.target.value))
                              }
                              className="h-9"
                              aria-label={`SERIAL ${row.machineIndex + 1} para ${line.producto || line.clave}`}
                            />
                          </TableCell>
                          {row.machineIndex === 0 ? (
                            <TableCell rowSpan={unitCount} className="align-top text-right tabular-nums">
                              {peso.format(line.pUnitCop)}
                            </TableCell>
                          ) : null}
                          {row.machineIndex === 0 ? (
                            <TableCell rowSpan={unitCount} className="align-top">
                              <select
                                className={selectCls}
                                value={state?.colorId ?? ""}
                                disabled={resolution === "skip"}
                                onChange={(e) => updateLineColor(entry.id, line, e.target.value)}
                              >
                                <option value="">Sin color</option>
                                {colors.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </TableCell>
                          ) : null}
                          {row.machineIndex === 0 ? (
                            <TableCell rowSpan={unitCount} className="align-top">
                              {renderResolutionSelect(entry.id, line, resolution)}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ));
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {entries.length > 0 ? (
        <div className="flex items-center gap-3">
          <Button type="button" size="lg" onClick={handleImport} disabled={importing || validCount === 0}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Importar {validCount} archivo{validCount === 1 ? "" : "s"}
          </Button>
          {validCount < entries.length ? (
            <span className="text-sm text-[var(--xt-steel)]">
              {entries.length - validCount} archivo(s) con datos por corregir
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
