import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./contexts/I18nContext";
import { IdentityProvider } from "./contexts/IdentityContext";
import {
  ServicesProvider,
  createInMemoryServices,
  reconcileOnStartup,
} from "./contexts/ServicesContext";
import { DevIdentityService, DEV_SEED_USERS } from "./services/identity-service";
import "./style.css";

// LinkSelf TS アダプタ完成までの暫定配線: インメモリ + 開発用シードユーザー。
// 差し替え時は createInMemoryServices の実装を交換する。
async function bootstrap() {
  const services = createInMemoryServices();

  for (const u of DEV_SEED_USERS) {
    await services.userRepo.saveUser(u);
  }
  const identityService = new DevIdentityService(services.userRepo, DEV_SEED_USERS[0].id);

  // PWA はバックグラウンド常駐がないため、期限系の後始末は起動時に実行する
  await reconcileOnStartup(services);

  const container = document.getElementById("app")!;

  createRoot(container).render(
    <React.StrictMode>
      <I18nProvider>
        <ServicesProvider services={services}>
          <IdentityProvider service={identityService}>
            <App />
          </IdentityProvider>
        </ServicesProvider>
      </I18nProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
