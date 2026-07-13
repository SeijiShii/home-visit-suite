// CheckoutsPage の移植テスト（サービス層をインメモリ実装で駆動）。

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { setLocale } from "../i18n/i18n-util";
import { DevIdentityService } from "../services/identity-service";
import { CheckoutsPage } from "./CheckoutsPage";

const EDITOR = "did:dev:editor";
const MEMBER = "did:dev:member";

async function seed(services: AppServices) {
  await services.userRepo.saveUser({
    id: EDITOR,
    name: "Eve Editor",
    role: "editor",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  });
  await services.userRepo.saveUser({
    id: MEMBER,
    name: "Mia Member",
    role: "member",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  });

  await services.regionRepo.saveRegion({
    id: "r1",
    name: "成田市",
    symbol: "NRT",
    approved: true,
    geometry: null,
    order: 0,
  });
  await services.regionRepo.saveParentArea({
    id: "pa1",
    regionId: "r1",
    number: "001",
    name: "加良部1丁目",
    geometry: null,
  });
  await services.regionRepo.saveArea({
    id: "a1",
    parentAreaId: "pa1",
    number: "01",
    polygonId: "poly-a1",
    geometry: null,
  });
  await services.regionRepo.saveArea({
    id: "a2",
    parentAreaId: "pa1",
    number: "02",
    polygonId: "poly-a2",
    geometry: null,
  });
}

async function renderCheckouts(
  actor = EDITOR,
  extraSeed?: (services: AppServices) => Promise<void>,
): Promise<AppServices> {
  const services = createInMemoryServices();
  await seed(services);
  await extraSeed?.(services);
  localStorage.setItem("dev.identity.actor", actor);
  const identityService = new DevIdentityService(services.userRepo, actor);
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <CheckoutsPage />
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
  return services;
}

describe("CheckoutsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("チェックアウトを発行すると活動中タブに現れる", async () => {
    await renderCheckouts();
    await userEvent.click(
      await screen.findByRole("button", { name: "+ チェックアウト発行" }),
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText("区域"), "a1");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("担当者"),
      MEMBER,
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "発行" }));

    // 一覧に発行済みチェックアウトが現れる
    expect(await screen.findByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.getByText("Mia Member")).toBeInTheDocument();
  });

  it("詳細から返却でき、返却済みタブへ移動する", async () => {
    await renderCheckouts(EDITOR, async (s) => {
      await s.checkoutService.checkout(EDITOR, "a1", MEMBER);
    });

    // 一覧の項目を選択 → 詳細に返却ボタン
    const listItem = await screen.findByRole("button", { name: /NRT-001-01/ });
    await userEvent.click(listItem);
    await userEvent.click(await screen.findByRole("button", { name: "返却" }));

    // 活動中タブの一覧からは消える（詳細パネルには選択中として残る）
    await screen.findByText("条件に一致するチェックアウトはありません");
    expect(screen.queryByRole("button", { name: /NRT-001-01/ })).toBeNull();

    // 返却済みタブに切替えると一覧に現れる
    await userEvent.click(screen.getByRole("tab", { name: "返却済み" }));
    expect(
      await screen.findByRole("button", { name: /NRT-001-01/ }),
    ).toBeInTheDocument();
  });

  it("検索で担当者名により絞り込める", async () => {
    await renderCheckouts(EDITOR, async (s) => {
      await s.checkoutService.checkout(EDITOR, "a1", MEMBER);
      await s.checkoutService.checkout(EDITOR, "a2", EDITOR);
    });

    await screen.findByText("NRT-001-01");
    await userEvent.type(
      screen.getByPlaceholderText("区域 ID または担当者名で検索"),
      "Mia",
    );
    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.queryByText("NRT-001-02")).toBeNull();
  });
});
