// MapPage の smoke テスト。
// leaflet の地図描画自体は jsdom では検証できないため、ツールバー等の
// 静的 UI が例外なくレンダリングされることのみ確認する。

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import { TipsProvider } from "../contexts/TipsContext";
import { HashRouter } from "react-router-dom";
import {
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { setLocale } from "../i18n/i18n-util";
import { DevIdentityService, DEV_SEED_USERS } from "../services/identity-service";
import { MapPage } from "./MapPage";

async function renderMap() {
  const services = createInMemoryServices();
  for (const u of DEV_SEED_USERS) await services.userRepo.saveUser(u);
  const identityService = new DevIdentityService(services.userRepo, DEV_SEED_USERS[0].id);
  return render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <TipsProvider service={services.settingsService}>
            <HashRouter>
              <MapPage />
            </HashRouter>
          </TipsProvider>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
}

describe("MapPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("例外なくレンダリングされ、サイドバーのタブが表示される", async () => {
    await renderMap();
    // サイドバーの区域タブ（t.map.tabAreas 相当のラベルが出る）
    expect(await screen.findByText("区域", { exact: false })).toBeInTheDocument();
  });
});
