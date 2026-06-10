"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  importQuoteAction,
  parseQuoteExcelAction,
  type ImportQuoteLineInput,
} from "@/app/admin/actions";
import {
  buildMachineRows,
  collectUsedPlacasForOtherLines,
  findPlacaIssue,
  getLinePlacaNumbers,
  getLineResolution,
  getLineUnitCount,
  initialLineState,
  resizePlacaNumbers,
  type LineState,
} from "@/components/admin/excel-import-state";
import type { QuotePreview } from "@/services/quote-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateEs } from "@/services/schedule";

type CatalogOption = { id: string; code: string; name: string };
type PreviewLine = QuotePreview["lines"][number];

const selectCls =
  "h-9 w-full rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

const peso = new Intl.NumberFormat("es-CO");

export function ExcelImportManager({
  catalog,
  queueEndDate,
}: {
  catalog: CatalogOption[];
  queueEndDate: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<QuotePreview | null>(null);
  const [clientName, setClientName] = useState("");
  const [promisedDate, setPromisedDate] = useState(queueEndDate);
  const [lineState, setLineState] = useState<Record<number, LineState>>({});
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [importing, startImport] = useTransition();

  function handleSessionExpired() {
    setPreview(null);
    setError("Tu sesión expiró. Te llevaremos a iniciar sesión para continuar…");
    router.push("/admin/login?reason=session-expired&next=/admin/importar");
  }

  function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startParse(async () => {
      try {
        const result = await parseQuoteExcelAction(formData);
        if ("sessionExpired" in result) {
          handleSessionExpired();
          return;
        }
        setPreview(result);
        setClientName(result.clientName ?? "");
        setLineState(initialLineState(result));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo leer el archivo.");
        setPreview(null);
      }
    });
  }

  const totalMachines = useMemo(() => {
    if (!preview) return 0;
    return preview.lines.reduce((sum, line) => {
      const state = lineState[line.rowIndex];
      if (getLineResolution(line, state) === "skip") return sum;
      return sum + getLineUnitCount(line, state);
    }, 0);
  }, [preview, lineState]);

  const machineRows = useMemo(() => buildMachineRows(preview, lineState), [preview, lineState]);
  const placaIssue = useMemo(() => findPlacaIssue(preview, lineState), [preview, lineState]);

  function handleImport() {
    if (!preview) return;
    setError(null);
    if (!clientName.trim()) {
      setError("Ingresa el nombre del cliente.");
      return;
    }
    if (!promisedDate) {
      setError("Selecciona la fecha prometida.");
      return;
    }
    if (placaIssue) {
      setError(placaIssue);
      return;
    }

    const lines: ImportQuoteLineInput[] = preview.lines.map((line) => {
      const state = lineState[line.rowIndex];
      const resolution = getLineResolution(line, state);
      const units = getLineUnitCount(line, state);
      const placaNumbers = getLinePlacaNumbers(line, state);
      const base = {
        producto: line.producto || line.clave,
        unidades: units,
        placaNumbers,
        pUnitCop: line.pUnitCop,
        // Leave línea unset: catalog matches keep their own line; custom items have none.
        line: null,
      };
      if (resolution === "skip") return { ...base, resolution: "skip" as const };
      if (resolution === "custom") {
        return { ...base, resolution: "custom" as const, customName: line.producto || line.clave };
      }
      return { ...base, resolution: "catalog" as const, catalogId: resolution };
    });

    startImport(async () => {
      try {
        const result = await importQuoteAction({
          placaMode: "auto",
          clientName: clientName.trim(),
          promisedDate,
          lines,
        });
        if ("sessionExpired" in result) {
          handleSessionExpired();
          return;
        }
        router.push(`/admin/previos?imported=${result.created}`);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo importar la cotización.");
      }
    });
  }

  function updateLineUnits(line: PreviewLine, unidades: number) {
    setLineState((prev) => {
      const state = prev[line.rowIndex];
      return {
        ...prev,
        [line.rowIndex]: {
          resolution: getLineResolution(line, state),
          unidades,
          placaNumbers: resizePlacaNumbers(
            state?.placaNumbers ?? line.placaNumbers,
            unidades,
            collectUsedPlacasForOtherLines(prev, line.rowIndex),
          ),
        },
      };
    });
  }

  function updateLinePlacaNumber(line: PreviewLine, machineIndex: number, placaNumber: number) {
    setLineState((prev) => {
      const state = prev[line.rowIndex];
      const current = getLinePlacaNumbers(line, state);
      current[machineIndex] = placaNumber;
      return {
        ...prev,
        [line.rowIndex]: {
          resolution: getLineResolution(line, state),
          unidades: getLineUnitCount(line, state),
          placaNumbers: current,
        },
      };
    });
  }

  function updateLineResolution(line: PreviewLine, resolution: string) {
    setLineState((prev) => {
      const state = prev[line.rowIndex];
      return {
        ...prev,
        [line.rowIndex]: {
          resolution,
          unidades: getLineUnitCount(line, state),
          placaNumbers: getLinePlacaNumbers(line, state),
        },
      };
    });
  }

  function renderResolutionSelect(line: PreviewLine, resolution: string) {
    return (
      <select className={selectCls} value={resolution} onChange={(e) => updateLineResolution(line, e.target.value)}>
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
        <h1 className="text-3xl font-bold">Importar cotización</h1>
        <p className="text-sm text-[var(--xt-steel)]">
          Sube el Excel de cotización. Las máquinas se agregan al final de la cola.
        </p>
      </div>

      {error ? (
        <div className="rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Archivo de Excel</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {preview ? "Elegir otro archivo" : "Seleccionar archivo"}
          </Button>
          {preview ? (
            <span className="flex items-center gap-2 text-sm text-[var(--xt-steel)]">
              <FileSpreadsheet className="h-4 w-4" />
              {preview.lines.length} líneas leídas
              {preview.reference ? ` · Ref. ${preview.reference}` : ""}
            </span>
          ) : null}
        </CardContent>
      </Card>

      {preview ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Datos de la cotización</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2 text-sm font-medium">
                PLACA
                <div className="rounded-[2px] border border-[var(--xt-cement)] bg-[var(--xt-yellow-soft)] px-3 py-2 text-sm font-normal text-[var(--xt-black)]">
                  Se asignó una PLACA por máquina; edítalas fila por fila en la tabla.
                </div>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Cliente
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Fecha prometida
                <Input value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} type="date" />
                <span className="text-xs font-normal text-[var(--xt-steel)]">
                  Estimación fin de cola actual: {formatDateEs(queueEndDate)}
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Líneas ({totalMachines} máquinas)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {placaIssue ? (
                <div className="rounded-[2px] border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {placaIssue}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead className="w-24">Unidad</TableHead>
                      <TableHead className="w-36">PLACA</TableHead>
                      <TableHead className="text-right">P.UNIT.</TableHead>
                      <TableHead className="w-72">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.lines.flatMap((line) => {
                      const state = lineState[line.rowIndex];
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
                                    onChange={(e) => updateLineUnits(line, Number(e.target.value))}
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
                              value={row.placaNumber}
                              disabled={resolution === "skip"}
                              onChange={(e) => updateLinePlacaNumber(line, row.machineIndex, Number(e.target.value))}
                              className="h-9"
                              aria-label={`PLACA ${row.machineIndex + 1} para ${line.producto || line.clave}`}
                            />
                          </TableCell>
                          {row.machineIndex === 0 ? (
                            <TableCell rowSpan={unitCount} className="align-top text-right tabular-nums">
                              {peso.format(line.pUnitCop)}
                            </TableCell>
                          ) : null}
                          {row.machineIndex === 0 ? (
                            <TableCell rowSpan={unitCount} className="align-top">
                              {renderResolutionSelect(line, resolution)}
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

          <div className="flex items-center gap-3">
            <Button type="button" size="lg" onClick={handleImport} disabled={importing || totalMachines === 0}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Importar {totalMachines} máquina{totalMachines === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
