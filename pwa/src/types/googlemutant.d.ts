// leaflet.gridlayer.googlemutant は型定義を同梱しないため最小限のアンビエント宣言を与える。
// プラグインは副作用インポートで L.gridLayer.googleMutant を生やす（呼び出し側でキャストして使う）。
// このファイルはトップレベル import/export を持たない「スクリプト」なので宣言はグローバルに効く。

declare module "leaflet.gridlayer.googlemutant";
declare module "leaflet.gridlayer.googlemutant/dist/Leaflet.GoogleMutant.js";

interface Window {
  // Google Maps JS API 読み込み後に生える global。存在確認のみに使う。
  // maps.Map は bootstrap 読了後さらに遅れて生えるため個別に判定する。
  google?: { maps?: { Map?: unknown } };
}
