// VisitPageContainer の smoke テスト。
// leaflet の地図描画は jsdom では検証できないため、ページ見出し等の静的 UI が
// 例外なくレンダリングされることを確認する。

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import { TipsProvider } from "../contexts/TipsContext";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { setLocale } from "../i18n/i18n-util";
import {
  DevIdentityService,
  DEV_SEED_USERS,
} from "../services/identity-service";
import { VisitPageContainer } from "./VisitPageContainer";

async function seed(services: AppServices) {
  for (const u of DEV_SEED_USERS) await services.userRepo.saveUser(u);
  await services.regionRepo.saveRegion({
    id: "NRT",
    name: "成田市",
    symbol: "NRT",
    approved: true,
    geometry: null,
    order: 0,
  });
  await services.regionRepo.saveParentArea({
    id: "NRT-001",
    regionId: "NRT",
    number: "001",
    name: "加良部1丁目",
    geometry: null,
  });
  await services.regionRepo.saveArea({
    id: "NRT-001-01",
    parentAreaId: "NRT-001",
    number: "01",
    geometry: null,
  });
}

async function renderVisit(entryState?: Record<string, unknown>) {
  const services = createInMemoryServices();
  await seed(services);
  const identityService = new DevIdentityService(
    services.userRepo,
    DEV_SEED_USERS[0].id,
  );
  return render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <TipsProvider service={services.settingsService}>
            <MemoryRouter
              initialEntries={[
                { pathname: "/visits/NRT-001-01", state: entryState ?? null },
              ]}
            >
              <Routes>
                <Route
                  path="/visits/:areaId"
                  element={<VisitPageContainer />}
                />
              </Routes>
            </MemoryRouter>
          </TipsProvider>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
}

describe("VisitPageContainer", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("例外なくレンダリングされ、区域 ID と区域親番名の見出しが表示される", async () => {
    await renderVisit();
    expect(
      await screen.findByText("区域: NRT-001-01 加良部1丁目"),
    ).toBeInTheDocument();
  });

  // 区域編集からの遷移時のみ「区域編集に戻る」ボタンを表示する
  // （docs/wants/03「場所の直接編集」）
  it("区域編集から遷移すると戻るボタンが表示される", async () => {
    await renderVisit({ from: "map-editor" });
    expect(await screen.findByText("← 区域編集に戻る")).toBeInTheDocument();
  });

  it("ダッシュボード起点（state なし）では戻るボタンを表示しない", async () => {
    await renderVisit();
    await screen.findByText("区域: NRT-001-01 加良部1丁目");
    expect(screen.queryByText("← 区域編集に戻る")).toBeNull();
  });
});
