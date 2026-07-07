// AreaDetailEditPageContainer の smoke テスト。
// leaflet の地図描画は jsdom では検証できないため、区域ラベル等の静的 UI が
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
import { AreaDetailEditPageContainer } from "./AreaDetailEditPageContainer";

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

async function renderAreaDetail() {
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
            <MemoryRouter initialEntries={["/map/area/NRT-001-01/detail"]}>
              <Routes>
                <Route
                  path="/map/area/:areaId/detail"
                  element={<AreaDetailEditPageContainer />}
                />
              </Routes>
            </MemoryRouter>
          </TipsProvider>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
}

describe("AreaDetailEditPageContainer", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("例外なくレンダリングされ、戻るボタンが表示される", async () => {
    await renderAreaDetail();
    expect(await screen.findByLabelText("戻る")).toBeInTheDocument();
  });
});
