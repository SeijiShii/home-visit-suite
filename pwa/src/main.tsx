import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import { I18nProvider } from "./contexts/I18nContext";
import { IdentityProvider } from "./contexts/IdentityContext";
import {
  ServicesProvider,
  createInMemoryServices,
  reconcileOnStartup,
} from "./contexts/ServicesContext";
import {
  DevIdentityService,
  DEV_SEED_USERS,
} from "./services/identity-service";
import "leaflet/dist/leaflet.css";
import "./style.css";

// LinkSelf TS アダプタ完成までの暫定配線: インメモリ + 開発用シードユーザー。
// 個人設定（言語・AI プロバイダ/キー/モデル・同意等）は localStorage 永続版で保持し、
// 再読み込みでも失われないようにする。差し替え時は createInMemoryServices の実装を交換する。
async function bootstrap() {
  const services = createInMemoryServices({ persist: true });

  for (const u of DEV_SEED_USERS) {
    await services.userRepo.saveUser(u);
  }
  const identityService = new DevIdentityService(
    services.userRepo,
    DEV_SEED_USERS[0].id,
  );

  // PWA はバックグラウンド常駐がないため、期限系の後始末は起動時に実行する
  await reconcileOnStartup(services);

  const container = document.getElementById("app")!;

  createRoot(container).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <I18nProvider>
          <ServicesProvider services={services}>
            <IdentityProvider service={identityService}>
              <App />
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
