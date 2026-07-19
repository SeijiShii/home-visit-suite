// ============================================================================
// 実機診断オーバーレイ（後日のデバッグ用に残置）。
// **既定では無効**（どこからも呼ばれていない）。実機で地図・同期などを調べたい
// ときだけ、bootstrap（main.tsx）冒頭で initMapDebug() を呼び、各所で
// mapDebugLog(...) を挿すと、画面左下のパネルへ起動段階から可視化される。
// React に依存しない素の DOM パネルとして実装する（bootstrap が React 描画前に
// 詰まるケースでも起動段階のログを可視化するため）。スタイルはインライン。
// ============================================================================

declare const __BUILD_TIME__: string;

export interface MapDebugEntry {
  at: string;
  msg: string;
}

const entries: MapDebugEntry[] = [];
const t0 = Date.now();

let panel: HTMLDivElement | null = null;
let listEl: HTMLDivElement | null = null;

function ensurePanel(): void {
  if (panel || typeof document === "undefined" || !document.body) return;
  panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:99999;" +
    "max-width:min(92vw,480px);max-height:40vh;overflow:auto;" +
    "background:rgba(15,23,42,.88);color:#e2e8f0;" +
    "font:11px/1.5 monospace;padding:6px 8px;border-radius:6px;";

  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:8px;margin-bottom:4px;";
  const title = document.createElement("strong");
  title.textContent = "map debug";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "copy";
  copyBtn.style.font = "inherit";
  copyBtn.onclick = () => {
    const text = entries.map((e) => `${e.at} ${e.msg}`).join("\n");
    const done = () => {
      copyBtn.textContent = "copied!";
      setTimeout(() => (copyBtn.textContent = "copy"), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      done();
    }
  };
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "font:inherit;margin-left:auto;";
  closeBtn.onclick = () => {
    panel?.remove();
    panel = null;
    listEl = null;
  };
  bar.append(title, copyBtn, closeBtn);

  listEl = document.createElement("div");
  panel.append(bar, listEl);
  document.body.appendChild(panel);
}

export function mapDebugLog(msg: string): void {
  const entry = {
    at: `+${((Date.now() - t0) / 1000).toFixed(1)}s`,
    msg,
  };
  entries.push(entry);
  if (entries.length > 100) entries.shift();
  // eslint-disable-next-line no-console
  console.log("[mapdebug]", msg);
  if (listEl) {
    const line = document.createElement("div");
    line.textContent = `${entry.at} ${entry.msg}`;
    listEl.appendChild(line);
    while (listEl.childNodes.length > 100) listEl.firstChild?.remove();
    listEl.scrollTop = listEl.scrollHeight;
  }
}

let initialized = false;

/** パネル生成・環境情報の記録・グローバルエラー捕捉を一度だけ仕込む */
export function initMapDebug(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  ensurePanel();
  const buildTime =
    typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "dev";
  mapDebugLog(`build=${buildTime}`);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const swState = navigator.serviceWorker?.controller ? "controlled" : "none";
  mapDebugLog(
    `standalone=${standalone} online=${navigator.onLine} sw=${swState}`,
  );
  mapDebugLog(`ua=${navigator.userAgent.slice(0, 90)}`);
  window.addEventListener("error", (e) => {
    mapDebugLog(
      `window.error: ${e.message} @${(e.filename ?? "").split("/").pop()}:${e.lineno}`,
    );
  });
  window.addEventListener("unhandledrejection", (e) => {
    mapDebugLog(`unhandledrejection: ${String(e.reason).slice(0, 200)}`);
  });
}
