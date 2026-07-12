// ベース地図プロバイダ設定は「サービス提供者」がビルド/デプロイ時の環境変数で一元管理する。
// 全利用者の全地図表示で使う基盤であり、課金も提供者契約であるため、
// 利用者ごとに持ち込む AI 地図取込の API キー（個人設定に保存）とは扱いが異なる。
//   - VITE_MAP_PROVIDER: "gsi"（既定）| "google"
//   - VITE_GOOGLE_MAPS_API_KEY: Google Maps JavaScript API キー（provider=google のとき必須）

import type { BaseMapConfig } from "./map-renderer";

/**
 * 環境変数からベース地図プロバイダ設定を解決する。
 * provider=google でもキー未設定の場合は MapRenderer 側で GSI にフォールバックする。
 */
export function resolveBaseMapConfig(): BaseMapConfig {
  const provider =
    import.meta.env.VITE_MAP_PROVIDER === "google" ? "google" : "gsi";
  const googleApiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";
  return { provider, googleApiKey };
}
