export const MACHINE_LINE_OPTIONS = [
  { value: "musculacion", label: "musculacion" },
  { value: "bioparques", label: "bioparques" },
  { value: "Mantenimiento", label: "Mantenimiento" },
  { value: "otros", label: "otros" },
] as const;

export type MachineLine = (typeof MACHINE_LINE_OPTIONS)[number]["value"];

export const MACHINE_LINE_VALUES = MACHINE_LINE_OPTIONS.map((option) => option.value);

export function normalizeMachineLine(value: FormDataEntryValue | string | null | undefined): MachineLine {
  const raw = String(value ?? "").trim();
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (key.includes("muscul")) return "musculacion";
  if (key.includes("bio")) return "bioparques";
  if (key.includes("manten")) return "Mantenimiento";
  if (key.includes("cali")) return "otros";
  if (key === "otro" || key === "otros") return "otros";

  return "otros";
}
