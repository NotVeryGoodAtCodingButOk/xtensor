import { describe, expect, it } from "vitest";

import { normalizeMachineLine } from "@/lib/machine-lines";

describe("normalizeMachineLine", () => {
  it("maps legacy and accented line names to the machine line schema", () => {
    expect(normalizeMachineLine("Musculación")).toBe("musculacion");
    expect(normalizeMachineLine("Bioparques")).toBe("bioparques");
    expect(normalizeMachineLine("Mantenimiento")).toBe("Mantenimiento");
    expect(normalizeMachineLine("Calistenia")).toBe("otros");
    expect(normalizeMachineLine("Otro")).toBe("otros");
  });

  it("defaults blank and unknown values to otros", () => {
    expect(normalizeMachineLine(null)).toBe("otros");
    expect(normalizeMachineLine("")).toBe("otros");
    expect(normalizeMachineLine("Especial")).toBe("otros");
  });
});
