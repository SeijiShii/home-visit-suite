import { describe, expect, it, vi } from "vitest";
import {
  queryGeolocationPermission,
  watchCurrentLocation,
} from "./current-location";

describe("watchCurrentLocation", () => {
  it("位置更新のたびに onUpdate へ緯度経度と精度を渡す", () => {
    const onUpdate = vi.fn();
    let successCb:
      | ((pos: {
          coords: { latitude: number; longitude: number; accuracy: number };
        }) => void)
      | null = null;
    const geolocation = {
      watchPosition: (
        success: (pos: {
          coords: { latitude: number; longitude: number; accuracy: number };
        }) => void,
      ) => {
        successCb = success;
        return 42;
      },
      clearWatch: vi.fn(),
    };
    watchCurrentLocation(geolocation, onUpdate);
    successCb!({ coords: { latitude: 35.1, longitude: 136.9, accuracy: 12 } });
    successCb!({ coords: { latitude: 35.2, longitude: 137.0, accuracy: 8 } });
    expect(onUpdate).toHaveBeenNthCalledWith(1, 35.1, 136.9, 12);
    expect(onUpdate).toHaveBeenNthCalledWith(2, 35.2, 137.0, 8);
  });

  it("stop を呼ぶと clearWatch に watch ID を渡して解除する", () => {
    const clearWatch = vi.fn();
    const geolocation = {
      watchPosition: () => 7,
      clearWatch,
    };
    const stop = watchCurrentLocation(geolocation, vi.fn());
    stop();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it("取得失敗では onUpdate を呼ばない", () => {
    const onUpdate = vi.fn();
    const geolocation = {
      watchPosition: (
        _success: unknown,
        error?: (err: unknown) => void,
      ): number => {
        error?.({ code: 1 });
        return 1;
      },
      clearWatch: vi.fn(),
    };
    watchCurrentLocation(geolocation, onUpdate);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("geolocation 非対応（undefined）では no-op の stop を返す", () => {
    const onUpdate = vi.fn();
    const stop = watchCurrentLocation(undefined, onUpdate);
    expect(() => stop()).not.toThrow();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("queryGeolocationPermission", () => {
  it("granted / prompt / denied をそのまま返す", async () => {
    for (const state of ["granted", "prompt", "denied"] as const) {
      const permissions = {
        query: async () => ({ state }),
      };
      await expect(queryGeolocationPermission(permissions)).resolves.toBe(
        state,
      );
    }
  });

  it("Permissions API 非対応（undefined）は unknown を返す", async () => {
    await expect(queryGeolocationPermission(undefined)).resolves.toBe(
      "unknown",
    );
  });

  it("query が例外を投げたら unknown を返す", async () => {
    const permissions = {
      query: async () => {
        throw new Error("unsupported");
      },
    };
    await expect(queryGeolocationPermission(permissions)).resolves.toBe(
      "unknown",
    );
  });
});
