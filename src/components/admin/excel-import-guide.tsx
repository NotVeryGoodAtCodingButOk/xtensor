import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ExcelImportGuide({ templateHref }: { templateHref: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Plantilla y formato del Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1.25fr_0.85fr]">
        <div className="grid gap-3 text-sm text-[var(--xt-steel)]">
          <p>
            Usa la plantilla incluida para que el loader reconozca la cotización sin ajustes manuales. El archivo se lee
            desde la primera hoja y el importador toma solo estas áreas:
          </p>
          <div className="grid gap-2">
            <p className="font-medium text-[var(--xt-black)]">Bloque superior</p>
            <ul className="grid gap-1">
              <li>
                <span className="font-medium text-[var(--xt-black)]">A3/B3:</span> Referencia
              </li>
              <li>
                <span className="font-medium text-[var(--xt-black)]">A4/B4:</span> Fecha
              </li>
              <li>
                <span className="font-medium text-[var(--xt-black)]">A5/B5:</span> Cliente
              </li>
              <li>
                <span className="font-medium text-[var(--xt-black)]">A6/B6:</span> Email
              </li>
              <li>
                <span className="font-medium text-[var(--xt-black)]">A7/B7:</span> Teléfono
              </li>
            </ul>
          </div>
          <div className="grid gap-2">
            <p className="font-medium text-[var(--xt-black)]">Tabla de líneas</p>
            <p>
              La fila 11 debe contener los encabezados y las filas de datos empiezan debajo. El loader usa:
            </p>
            <div className="overflow-x-auto border border-[var(--xt-cement)] bg-[var(--xt-white)]">
              <table className="min-w-[640px] text-left text-xs">
                <thead className="bg-[var(--xt-yellow-soft)] text-[var(--xt-black)]">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Clave</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2">UNID.</th>
                    <th className="px-3 py-2">P.UNIT.</th>
                    <th className="px-3 py-2">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--xt-cement)]">
                    <td className="px-3 py-2">Flexo Extensor</td>
                    <td className="px-3 py-2">XM120</td>
                    <td className="px-3 py-2">XM120 - Tren Inferior</td>
                    <td className="px-3 py-2">1</td>
                    <td className="px-3 py-2">4748100</td>
                    <td className="px-3 py-2">4748100</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>La columna `Clave` debe coincidir con el catálogo para hacer match automático.</p>
            <p>El importador se detiene cuando encuentra una fila de totales con `Suma` o `Total`.</p>
            <p>`UNID.` crea una máquina por cada unidad redondeada a entero.</p>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <div className="border border-[var(--xt-black)] bg-[var(--xt-white)] p-3 font-mono text-[11px] leading-5 text-[var(--xt-black)]">
            <div>Referencia  6878</div>
            <div>Fecha       2026-03-16</div>
            <div>Cliente     Xtensor S.AS</div>
            <div>Email       ventas@xtensor.co</div>
            <div>Teléfono    3233437444</div>
            <div className="mt-2 border-t border-[var(--xt-cement)] pt-2">
              Producto | Clave | Descripción | UNID. | P.UNIT. | Importe
            </div>
            <div>Flexo Extensor | XM120 | XM120 - Tren Inferior | 1 | 4748100 | 4748100</div>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href={templateHref}>
              <Download className="h-4 w-4" />
              Descargar plantilla
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
