import { describe, expect, it, vi } from "vitest";
import {
  TOKYO_FALLBACK_VIEW,
  requestCurrentLocation,
  resolveInitialMapView,
} from "./initial-map-view";

describe("resolveInitialMapView", () => {
  it("保存ビューがあればそれを使い、GPS 取得は要求しない", () => {
    const saved = { lat: 34.7, lng: 135.5, zoom: 16 };
    const result = resolveInitialMapView(saved);
    expect(result.view).toEqual(saved);
    expect(result.shouldLocate).toBe(false);
  });

  it("保存ビューがなければ東京フォールバックを使い、GPS 取得を要求する", () => {
    const result = resolveInitialMapView(null);
    expect(result.view).toEqual(TOKYO_FALLBACK_VIEW);
    expect(result.shouldLocate).toBe(true);
  });
});

describe("requestCurrentLocation", () => {
  it("取得成功で onLocated に緯度経度を渡す", () => {
    const onLocated = vi.fn();
    const geolocation = {
      getCurrentPosition: (
        success: (pos: {
          coords: { latitude: number; longitude: number };
        }) => void,
      ) => {
        success({ coords: { latitude: 35.1, longitude: 136.9 } });
      },
    };
    requestCurrentLocation(geolocation, onLocated);
    expect(onLocated).toHaveBeenCalledWith(35.1, 136.9);
  });

  it("取得失敗では onLocated を呼ばない", () => {
    const onLocated = vi.fn();
    const geolocation = {
      getCurrentPosition: (
        _success: unknown,
        error?: (err: unknown) => void,
      ) => {
        error?.({ code: 1 });
      },
    };
    requestCurrentLocation(geolocation, onLocated);
    expect(onLocated).not.toHaveBeenCalled();
  });

  it("geolocation 非対応（undefined）では何もしない", () => {
    const onLocated = vi.fn();
    expect(() => requestCurrentLocation(undefined, onLocated)).not.toThrow();
    expect(onLocated).not.toHaveBeenCalled();
  });
});
