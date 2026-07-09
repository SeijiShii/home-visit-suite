// PDF 判定のテスト（ラスタ化本体は canvas 依存のため jsdom 対象外）。

import { describe, expect, it } from "vitest";
import { isPdf } from "./pdf-raster";

describe("isPdf", () => {
  it("%PDF マジックバイトを PDF と判定する", () => {
    // "%PDF-1.7"
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]).buffer;
    expect(isPdf(bytes)).toBe(true);
  });

  it("PNG は PDF ではない", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    expect(isPdf(png)).toBe(false);
  });

  it("空データは PDF ではない", () => {
    expect(isPdf(new ArrayBuffer(0))).toBe(false);
  });
});
