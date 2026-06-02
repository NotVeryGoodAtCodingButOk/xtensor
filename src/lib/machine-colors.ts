const COLOR_HEX_BY_TOKEN: Record<string, string> = {
  amarillo: "facc15",
  azul: "60a5fa",
  beige: "d6c2a1",
  blanco: "e5e7eb",
  cafe: "b45309",
  crema: "e7d7b1",
  dorado: "eab308",
  fucsia: "ec4899",
  gris: "9ca3af",
  marron: "b45309",
  morado: "a78bfa",
  naranja: "fb923c",
  negro: "1a1a1a",
  plateado: "cbd5e1",
  plata: "cbd5e1",
  rojo: "f87171",
  rosado: "f9a8d4",
  rosa: "f9a8d4",
  verde: "4ade80",
  violeta: "a78bfa",
};

export function resolveMachineColorHex(colorName: string | null): string | null {
  if (!colorName) return null;

  const normalized = normalizeMachineColorName(colorName);
  const directHex = extractHexColor(normalized);
  if (directHex) return directHex;

  if (COLOR_HEX_BY_TOKEN[normalized]) {
    return COLOR_HEX_BY_TOKEN[normalized];
  }

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const hex = COLOR_HEX_BY_TOKEN[token];
    if (hex) return hex;
  }

  return null;
}

export function normalizeMachineColorName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function extractHexColor(value: string) {
  const match = value.match(/#?([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (!match) return null;

  const hex = match[1].toLowerCase();
  if (hex.length === 3) {
    return hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }

  return hex;
}
