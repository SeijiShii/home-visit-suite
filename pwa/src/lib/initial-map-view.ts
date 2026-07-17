/**
 * 地図の初期表示位置の解決（docs/wants/03「地図の初期表示位置」）。
 * 優先順: 前回の表示位置（保存ビュー） > GPS 現在地 > 東京駅周辺フォールバック。
 */

export interface SavedMapView {
  lat: number;
  lng: number;
  zoom: number;
}

/** 保存ビューも GPS もないときのフォールバック表示位置（東京駅周辺）。 */
export const TOKYO_FALLBACK_VIEW: SavedMapView = {
  lat: 35.681236,
  lng: 139.767125,
  zoom: 14,
};

export interface InitialMapViewResolution {
  view: SavedMapView;
  /** true なら非同期で GPS 現在地を取得し、可能なら現在地へ移動する */
  shouldLocate: boolean;
}

export function resolveInitialMapView(
  saved: SavedMapView | null,
): InitialMapViewResolution {
  if (saved) return { view: saved, shouldLocate: false };
  return { view: TOKYO_FALLBACK_VIEW, shouldLocate: true };
}

/** navigator.geolocation の最小サブセット（テストでフェイク差し替え可能に） */
export interface GeolocationLike {
  getCurrentPosition(
    success: (pos: { coords: { latitude: number; longitude: number } }) => void,
    error?: (err: unknown) => void,
    options?: { maximumAge?: number; timeout?: number },
  ): void;
}

/**
 * GPS 現在地を 1 回だけ取得して onLocated に渡す。
 * 非対応・権限拒否・タイムアウト時は何もしない（フォールバック表示のまま）。
 */
export function requestCurrentLocation(
  geolocation: GeolocationLike | undefined,
  onLocated: (lat: number, lng: number) => void,
): void {
  if (!geolocation) return;
  geolocation.getCurrentPosition(
    (pos) => onLocated(pos.coords.latitude, pos.coords.longitude),
    () => {
      // 拒否・失敗時はフォールバック位置のまま
    },
    { maximumAge: 300_000, timeout: 8_000 },
  );
}
