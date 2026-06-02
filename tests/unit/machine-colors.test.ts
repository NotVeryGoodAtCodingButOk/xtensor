import { describe, expect, it } from "vitest";
import { normalizeMachineColorName, resolveMachineColorHex } from "@/lib/machine-colors";

describe("machine colors", () => {
  it("matches exact spanish color names", () => {
    expect(resolveMachineColorHex("Verde")).toBe("4ade80");
    expect(resolveMachineColorHex("Negro")).toBe("1a1a1a");
  });

  it("matches compound names by token", () => {
    expect(resolveMachineColorHex("Azul oscuro")).toBe("60a5fa");
    expect(resolveMachineColorHex("gris plata")).toBe("9ca3af");
  });

  it("accepts hex colors directly", () => {
    expect(resolveMachineColorHex("#abc")).toBe("aabbcc");
    expect(resolveMachineColorHex("ff6600")).toBe("ff6600");
  });

  it("normalizes accents", () => {
    expect(normalizeMachineColorName("Marrón")).toBe("marron");
  });
});
