import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { join } from "node:path";

export async function GET() {
  const filePath = join(process.cwd(), "6878 (1).xlsx");
  const buffer = await readFile(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-cotizacion-xtensor.xlsx"',
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
