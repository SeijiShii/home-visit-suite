// Google Maps JavaScript API の読み込み。
// loading=async では <script> の load イベントは bootstrap 読了のタイミングで発火し、
// その時点では google.maps.Map はまだ存在しない（残りは追加読み込みされる）。
// GoogleMutant プラグインは google.maps.Map を最大 10 秒しかポーリングせず、
// 超過すると throw して以後復帰しないため、公式の callback パラメータで
// 「API が完全に使える時点」まで resolve を遅らせる。

/** Google が API 完全読了時に呼ぶ global callback 名 */
const READY_CALLBACK = "__hvsGoogleMapsReady";

/**
 * callback が来ないまま諦めるまでの時間。bootstrap 読了後の本体チャンク取得だけが
 * 失敗する（onerror が捕まえられない）ケースで Promise が永久 pending になり
 * セッション中リトライ不能になるのを防ぐ。低速回線を考慮して長めにとる。
 */
export const LOAD_TIMEOUT_MS = 30_000;

// 1 度だけ読み込む。読み込み中/完了の Promise を使い回す（single-flight）。
let googleMapsLoader: Promise<void> | null = null;

function isApiReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.google?.maps?.Map !== "undefined"
  );
}

/**
 * Google Maps JavaScript API を <script> 動的挿入で読み込み、
 * google.maps.Map が使用可能になった時点で resolve する。
 * 失敗時は reject し、次回呼び出しで再試行できる。
 */
export function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if (isApiReady()) return Promise.resolve();
  if (googleMapsLoader) return googleMapsLoader;
  googleMapsLoader = new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      delete w[READY_CALLBACK];
    };
    // 失敗時は loader をリセットして次回呼び出しでリトライできるようにする
    const fail = (message: string) => {
      googleMapsLoader = null;
      cleanup();
      reject(new Error(message));
    };
    w[READY_CALLBACK] = () => {
      cleanup();
      resolve();
    };
    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(apiKey) +
      "&loading=async&callback=" +
      READY_CALLBACK;
    script.async = true;
    script.defer = true;
    script.onerror = () => fail("Google Maps API の読み込みに失敗しました");
    timer = setTimeout(
      () => fail("Google Maps API の読み込みがタイムアウトしました"),
      LOAD_TIMEOUT_MS,
    );
    document.head.appendChild(script);
  });
  return googleMapsLoader;
}
