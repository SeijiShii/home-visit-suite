import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import { GroupNetworkProvider } from "./contexts/GroupNetworkContext";
import { I18nProvider } from "./contexts/I18nContext";
import { IdentityProvider } from "./contexts/IdentityContext";
import type { GroupNetworkService } from "./lib/linkself/group-network";
import {
  ServicesProvider,
  createInMemoryServices,
} from "./contexts/ServicesContext";
import {
  LocalIdentityService,
  DEV_SEED_USERS,
  loadStoredSeed,
} from "./services/identity-service";
import type { AppServices } from "./contexts/ServicesContext";
import "leaflet/dist/leaflet.css";
import "./style.css";

// データ配線の切替:
// - 既定（暫定）: インメモリ + localStorage 永続。個人設定は localStorage 永続版で保持する。
// - VITE_LINKSELF 有効時（ScopeDevice 先行スライス）: 個人設定を LinkSelf MyDB の
//   SQL 面（ブラウザは OPFS SQLite）に永続する。残りは暫定実装のまま。
//   sqlite-wasm 資産を含むため、有効時のみ動的 import して読み込む。
//   さらに VITE_LINKSELF_RELAYS（既知ピア）と実 identity がそろえば LinkSelfClient を
//   起動し devicesync に乗せる。リレー未設定ならローカル永続のみ（libp2p 起動なし）。
// 自分の identity は LocalIdentityService が localStorage(`hvs.identity`) に永続する。
function linkSelfEnabled(): boolean {
  const v = String(import.meta.env.VITE_LINKSELF ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

function allowLocalDial(): boolean {
  const v = String(
    import.meta.env.VITE_LINKSELF_ALLOW_LOCAL_DIAL ?? "",
  ).toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

// 開発用のロール切替（3 種のシードユーザーを選べる identity 切替 UI）は
// 既定で無効。VITE_DEV_IDENTITY を明示的に有効化したときのみ使う。
// 通常の `npm run dev` では実 identity（オンボーディング）フローで動作する。
function devIdentityEnabled(): boolean {
  const v = String(import.meta.env.VITE_DEV_IDENTITY ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

async function bootstrap() {
  let services: AppServices;
  // ネットワーク配線を有効化したときの graceful stop（既定は no-op）。
  let stopLinkSelf = async (): Promise<void> => {};
  // グループ招待/参加ファサード（ネットワーク配線時のみ）。
  let groupNetwork: GroupNetworkService | null = null;

  if (linkSelfEnabled()) {
    const mod = await import("./contexts/linkself-services");
    const seed = loadStoredSeed() ?? undefined;
    const relays = mod.parseRelays(import.meta.env.VITE_LINKSELF_RELAYS);
    const bundle = await mod.createLinkSelfServices({
      persist: true,
      seed,
      relays,
      allowLocalDial: allowLocalDial(),
    });
    services = bundle.services;
    stopLinkSelf = bundle.stop;
    groupNetwork = bundle.groupNetwork ?? null;
    // 前景→非表示 / アンロードで libp2p を graceful に停止する（docs/wants/11 §2）。
    globalThis.addEventListener?.("pagehide", () => void stopLinkSelf());
    globalThis.addEventListener?.("visibilitychange", () => {
      if (document.visibilityState === "hidden") void stopLinkSelf();
    });
  } else {
    services = createInMemoryServices({ persist: true });
  }

  // 開発用の identity 切替（ロール別 UI 確認用のシードユーザー + 切替 UI）は
  // 既定で無効。VITE_DEV_IDENTITY を明示的に有効化したときのみ投入・有効化する。
  const devMode = devIdentityEnabled();
  if (devMode) {
    for (const u of DEV_SEED_USERS) {
      await services.userRepo.saveUser(u);
    }
  }
  // 実 identity は IdentityProvider 初期化時に loadIdentity() で復元される。
  const identityService = new LocalIdentityService(services.userRepo, devMode);

  const container = document.getElementById("app")!;

  createRoot(container).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <I18nProvider>
          <ServicesProvider services={services}>
            <IdentityProvider service={identityService}>
              <GroupNetworkProvider service={groupNetwork}>
                <App />
              </GroupNetworkProvider>
            </IdentityProvider>
          </ServicesProvider>
        </I18nProvider>
      </RootErrorBoundary>
    </React.StrictMode>,
  );
}

// 起動時例外を画面に可視化する（真っ白のまま無反応になるのを防ぐ）。
void bootstrap().catch((err) => {
  console.error("[bootstrap] failed", err);
  const container = document.getElementById("app");
  if (container) {
    container.innerHTML =
      '<pre style="padding:16px;white-space:pre-wrap;color:#b91c1c;font-family:monospace;">' +
      "起動に失敗しました:\n\n" +
      String(err instanceof Error ? (err.stack ?? err.message) : err) +
      "</pre>";
  }
});
