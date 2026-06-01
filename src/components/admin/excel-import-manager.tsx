"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  importQuoteAction,
  parseQuoteExcelAction,
  type ImportQuoteLineInput,
  type QuotePreview,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateEs } from "@/services/schedule";

type CatalogOption = { id: string; code: string; name: string };

const selectCls =
  "h-9 w-full rounded-[2px] border border-[var(--xt-aluminum)] bg-[var(--xt-white)] px-2 text-sm focus-visible:border-[var(--xt-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xt-yellow)]";

const peso = new Intl.NumberFormat("es-CO");

// Resolution select value: "skip", "custom", or a catalog id.
type LineState = {
  resolution: string;
  unidades: number;
};

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
  const [cotiNumber, setCotiNumber] = useState("");
  const [promisedDate, setPromisedDate] = useState(queueEndDate);
  const [lineState, setLineState] = useState<Record<number, LineState>>({});
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [importing, startImport] = useTransition();

  function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startParse(async () => {
      try {
        const result = await parseQuoteExcelAction(formData);
        setPreview(result);
        setClientName(result.clientName ?? "");
        setCotiNumber(result.cotiNumber ? String(result.cotiNumber) : "");
        setLineState(
          Object.fromEntries(
            result.lines.map((line) => [
              line.rowIndex,
              { resolution: line.matchedCatalogId ?? "custom", unidades: line.unidades },
            ]),
          ),
        );
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
      if (!state || state.resolution === "skip") return sum;
      return sum + Math.max(1, Math.round(state.unidades) || 1);
    }, 0);
  }, [preview, lineState]);

  function handleImport() {
    if (!preview) return;
    setError(null);
    const coti = Number(cotiNumber);
    if (!coti || !Number.isFinite(coti)) {
      setError("Ingresa un número de cotización (COTI) válido.");
      return;
    }
    if (!clientName.trim()) {
      setError("Ingresa el nombre del cliente.");
      return;
    }
    if (!promisedDate) {
      setError("Selecciona la fecha ofrecida.");
      return;
    }

    const lines: ImportQuoteLineInput[] = preview.lines.map((line) => {
      const state = lineState[line.rowIndex];
      const resolution = state?.resolution ?? "skip";
      const base = {
        producto: line.producto || line.clave,
        unidades: state?.unidades ?? line.unidades,
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
          cotiNumber: coti,
          clientName: clientName.trim(),
          promisedDate,
          lines,
        });
        router.push(`/admin?imported=${result.created}`);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo importar la cotización.");
      }
    });
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
              <label className="grid gap-2 text-sm font-medium">
                COTI
                <Input value={cotiNumber} onChange={(e) => setCotiNumber(e.target.value)} type="number" />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Cliente
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Fecha ofrecida
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
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Clave</TableHead>
                    <TableHead className="w-20">UNID.</TableHead>
                    <TableHead className="text-right">P.UNIT.</TableHead>
                    <TableHead className="w-72">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.lines.map((line) => {
                    const state = lineState[line.rowIndex];
                    const resolution = state?.resolution ?? "skip";
                    return (
                      <TableRow key={line.rowIndex}>
                        <TableCell>
                          <span className="font-medium">{line.producto || "—"}</span>
                          {!line.matchedCatalogId ? (
                            <span className="ml-2 rounded-[2px] bg-[var(--xt-yellow)] px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                              sin catálogo
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-[var(--xt-steel)]">{line.clave || "—"}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={state?.unidades ?? line.unidades}
                            onChange={(e) =>
                              setLineState((prev) => ({
                                ...prev,
                                [line.rowIndex]: {
                                  resolution: prev[line.rowIndex]?.resolution ?? resolution,
                                  unidades: Number(e.target.value),
                                },
                              }))
                            }
                            className="h-9"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{peso.format(line.pUnitCop)}</TableCell>
                        <TableCell>
                          <select
                            className={selectCls}
                            value={resolution}
                            onChange={(e) =>
                              setLineState((prev) => ({
                                ...prev,
                                [line.rowIndex]: {
                                  resolution: e.target.value,
                                  unidades: prev[line.rowIndex]?.unidades ?? line.unidades,
                                },
                              }))
                            }
                          >
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
