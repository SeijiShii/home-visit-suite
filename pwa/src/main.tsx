import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./contexts/I18nContext";
import { IdentityProvider } from "./contexts/IdentityContext";
import { InMemoryUserRepository } from "./data/inmemory/inmemory-user-repository";
import { createDevIdentityService } from "./services/identity-service";
import "./style.css";

// LinkSelf TS アダプタ完成までの暫定配線: インメモリ + 開発用シードユーザー。
// 差し替え時はここでリポジトリ／サービスの実装を交換する。
async function bootstrap() {
  const userRepo = new InMemoryUserRepository();
  const identityService = await createDevIdentityService(userRepo);

  const container = document.getElementById("app")!;

  createRoot(container).render(
    <React.StrictMode>
      <I18nProvider>
        <IdentityProvider service={identityService}>
          <App />
        </IdentityProvider>
      </I18nProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
