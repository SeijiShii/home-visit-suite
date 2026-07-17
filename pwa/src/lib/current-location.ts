/**
 * 現在地のリアルタイム購読（docs/wants/03「現在地マーカーと現在地への移動」)。
 * watchPosition の薄いラッパ。権限拒否・非対応時は黙って何もしない。
 */

/** navigator.geolocation の watch 系最小サブセット（テストでフェイク差し替え可能に） */
export interface GeolocationWatchLike {
  watchPosition(
    success: (pos: {
      coords: { latitude: number; longitude: number; accuracy: number };
    }) => void,
    error?: (err: unknown) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number },
  ): number;
  clearWatch(id: number): void;
}

/** navigator.permissions の最小サブセット（テストでフェイク差し替え可能に） */
export interface PermissionsLike {
  query(descriptor: { name: string }): Promise<{ state: string }>;
}

export type GeolocationPermissionState =
  "granted" | "prompt" | "denied" | "unknown";

/**
 * geolocation の権限状態を返す。Permissions API 非対応・照会失敗は "unknown"。
 * 「許可済みのときだけ画面表示で自動購読する」判定に使う
 * （未決定のユーザーに画面を開いただけで許可プロンプトを出さないため）。
 */
export async function queryGeolocationPermission(
  permissions: PermissionsLike | undefined,
): Promise<GeolocationPermissionState> {
  if (!permissions) return "unknown";
  try {
    const status = await permissions.query({ name: "geolocation" });
    if (
      status.state === "granted" ||
      status.state === "prompt" ||
      status.state === "denied"
    ) {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * 現在地の変化を購読し onUpdate(lat, lng, accuracyMeters) を呼ぶ。
 * 返り値の stop() で購読解除する（画面を離れるとき必ず呼ぶ）。
 */
export function watchCurrentLocation(
  geolocation: GeolocationWatchLike | undefined,
  onUpdate: (lat: number, lng: number, accuracyMeters: number) => void,
): () => void {
  if (!geolocation) return () => {};
  const id = geolocation.watchPosition(
    (pos) =>
      onUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    () => {
      // 拒否・失敗時はマーカーを出さないだけ（エラー表示しない）
    },
    { enableHighAccuracy: true, maximumAge: 5_000 },
  );
  return () => geolocation.clearWatch(id);
}
