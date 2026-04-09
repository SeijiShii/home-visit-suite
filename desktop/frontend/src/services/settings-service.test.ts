import { describe, it, expect, vi } from "vitest";
import { SettingsService, type SettingsBindingAPI } from "./settings-service";

function createMockApi(): SettingsBindingAPI {
  return {
    GetHiddenTipKeys: vi.fn().mockResolvedValue(null),
    SetTipHidden: vi.fn().mockResolvedValue(undefined),
    ResetHiddenTips: vi.fn().mockResolvedValue(undefined),
    GetLocale: vi.fn().mockResolvedValue(""),
    SetLocale: vi.fn().mockResolvedValue(undefined),
    GetAreaDetailRadiusKm: vi.fn().mockResolvedValue(5),
    SetAreaDetailRadiusKm: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SettingsService", () => {
  it("getHiddenTipKeys: null を空配列に正規化", async () => {
    const api = createMockApi();
    const svc = new SettingsService(api);
    const keys = await svc.getHiddenTipKeys();
    expect(keys).toEqual([]);
  });

  it("getHiddenTipKeys: 配列をそのまま返す", async () => {
    const api = createMockApi();
    api.GetHiddenTipKeys = vi
      .fn()
      .mockResolvedValue(["tips.map.polygon.startDraw"]);
    const svc = new SettingsService(api);
    expect(await svc.getHiddenTipKeys()).toEqual([
      "tips.map.polygon.startDraw",
    ]);
  });

  it("setTipHidden: バインディングに委譲", async () => {
    const api = createMockApi();
    const svc = new SettingsService(api);
    await svc.setTipHidden("tips.map.polygon.startDraw", true);
    expect(api.SetTipHidden).toHaveBeenCalledWith(
      "tips.map.polygon.startDraw",
      true,
    );
  });

  it("resetHiddenTips: バインディングに委譲", async () => {
    const api = createMockApi();
    const svc = new SettingsService(api);
    await svc.resetHiddenTips();
    expect(api.ResetHiddenTips).toHaveBeenCalled();
  });

  it("getLocale / setLocale", async () => {
    const api = createMockApi();
    api.GetLocale = vi.fn().mockResolvedValue("en");
    const svc = new SettingsService(api);
    expect(await svc.getLocale()).toBe("en");
    await svc.setLocale("ja");
    expect(api.SetLocale).toHaveBeenCalledWith("ja");
  });
});
