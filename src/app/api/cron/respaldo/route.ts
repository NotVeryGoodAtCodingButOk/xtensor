import { buildPreviosWorkbook, buildScheduleWorkbook } from "@/services/excel";
import { listHolidays } from "@/services/catalog";
import { listCalculatedMachines } from "@/services/machines";
import { listMachinePrevioRows } from "@/services/previos";
import { getSettings, mapSettings } from "@/services/settings";

export const dynamic = "force-dynamic";

/**
 * Respaldo diario (Vercel Cron, ver vercel.json): arma el Excel del plan de
 * producción y el de previos y los envía por correo como adjuntos.
 * Variables: CRON_SECRET (Vercel la manda como Bearer), RESEND_API_KEY,
 * BACKUP_EMAIL_TO (uno o varios correos separados por coma).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado.", { status: 401 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.BACKUP_EMAIL_TO ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  if (!apiKey || to.length === 0) {
    return new Response("Falta RESEND_API_KEY o BACKUP_EMAIL_TO.", { status: 500 });
  }

  const settings = mapSettings(await getSettings());
  const holidays = await listHolidays();
  const machines = (await listCalculatedMachines({ settings, holidays })).filter(
    (machine) => machine.status !== "on_hold",
  );
  const previoRows = await listMachinePrevioRows();

  const [plan, previos] = await Promise.all([buildScheduleWorkbook(machines), buildPreviosWorkbook(previoRows)]);
  // Fecha de Colombia (UTC-5), no la del servidor.
  const day = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.BACKUP_EMAIL_FROM ?? "XTENSOR respaldo <onboarding@resend.dev>",
      to,
      subject: `Respaldo XTENSOR ${day}`,
      text: `Respaldo diario de ${day}: plan de producción (${machines.length} máquinas) y previos.`,
      attachments: [
        { filename: `plan-produccion-${day}.xlsx`, content: plan.toString("base64") },
        { filename: `previos-${day}.xlsx`, content: previos.toString("base64") },
      ],
    }),
  });

  if (!response.ok) {
    return new Response(`No se pudo enviar el correo: ${response.status} ${await response.text()}`, { status: 502 });
  }
  return Response.json({ ok: true, day, machines: machines.length });
}
