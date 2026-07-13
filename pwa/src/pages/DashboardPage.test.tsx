// DashboardPage の移植テスト（サービス層をインメモリ実装で駆動）。
// 参照: desktop/frontend/src/pages/DashboardPage.test.tsx（Wails モック版）

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter } from "react-router-dom";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { setLocale } from "../i18n/i18n-util";
import { DevIdentityService } from "../services/identity-service";
import { DashboardPage } from "./DashboardPage";

const ADMIN = "did:dev:admin";
const MEMBER = "did:dev:member";

/** 実時刻を挟むアクティブ期間（対象: pa1）と region ツリーをシードする。 */
async function seed(services: AppServices) {
  await services.userRepo.saveUser({
    id: ADMIN,
    name: "Dev Admin",
    role: "admin",
    tagIds: [],
    joinedAt: "2026-01-01T00:00:00Z",
  });
  await services.userRepo.saveUser({
    id: MEMBER,
    name: "Dev Member",
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

async function renderDashboard(actor: string) {
  const services = createInMemoryServices();
  await seed(services);
  localStorage.setItem("dev.identity.actor", actor);
  const identityService = new DevIdentityService(services.userRepo, ADMIN);
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <HashRouter>
            <DashboardPage />
          </HashRouter>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
  return services;
}

describe("DashboardPage", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
    setLocale("ja");
  });

  it("チェックアウト可能な区域が全区域から列挙される（他者チェックアウトなし）", async () => {
    await renderDashboard(MEMBER);
    expect(await screen.findByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.getByText("NRT-001-02")).toBeInTheDocument();
  });

  it("ポリゴン未紐付けの区域はチェックアウト可能な区域に出ない", async () => {
    const services = createInMemoryServices();
    await seed(services);
    // a3 はポリゴン未紐付けで追加（チェックアウト可能一覧に出ないことの検証）
    await services.regionRepo.saveArea({
      id: "a3",
      parentAreaId: "pa1",
      number: "03",
      geometry: null,
    });
    localStorage.setItem("dev.identity.actor", MEMBER);
    const identityService = new DevIdentityService(services.userRepo, MEMBER);
    render(
      <I18nProvider>
        <ServicesProvider services={services}>
          <IdentityProvider service={identityService}>
            <HashRouter>
              <DashboardPage />
            </HashRouter>
          </IdentityProvider>
        </ServicesProvider>
      </I18nProvider>,
    );

    // a1/a2（紐付け済み）は出るが、a3（未紐付け）の NRT-001-03 は出ない
    await screen.findByText("NRT-001-01");
    expect(screen.getByText("NRT-001-02")).toBeInTheDocument();
    expect(screen.queryByText("NRT-001-03")).not.toBeInTheDocument();
  });

  it("チェックアウトするとアクセス可能な区域に担当者として現れる", async () => {
    await renderDashboard(MEMBER);
    const buttons = await screen.findAllByRole("button", {
      name: "チェックアウト",
    });
    await userEvent.click(buttons[0]);

    // アクセス可能な区域テーブルに担当者行が現れる
    const row = (await screen.findByText("担当者")).closest("tr")!;
    expect(within(row).getByText("NRT-001-01")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "訪問記録 →" }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "招待" }),
    ).toBeInTheDocument();

    // チェックアウト可能一覧からは消える
    const remaining = screen.getAllByRole("button", { name: "チェックアウト" });
    expect(remaining).toHaveLength(1);
  });

  it("担当者は行内の返却ボタンで区域を返却でき、チェックアウト可能一覧へ戻る", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderDashboard(MEMBER);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "チェックアウト" }))[0],
    );

    // 担当者行の返却ボタンを押す
    const row = (await screen.findByText("担当者")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "返却" }));

    // アクセス可能な区域から外れ、チェックアウト可能一覧へ戻る（a1/a2 の 2 件）
    expect(screen.queryByText("担当者")).toBeNull();
    const checkoutButtons = await screen.findAllByRole("button", {
      name: "チェックアウト",
    });
    expect(checkoutButtons).toHaveLength(2);
    confirmSpy.mockRestore();
  });

  it("返却の確認ダイアログでキャンセルすると返却されない", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderDashboard(MEMBER);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "チェックアウト" }))[0],
    );
    const row = (await screen.findByText("担当者")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "返却" }));

    // 担当者行は残ったまま
    expect(screen.getByText("担当者")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("member には全ての区域一覧セクションが表示されない", async () => {
    await renderDashboard(MEMBER);
    await screen.findByText("NRT-001-01");
    expect(screen.queryByText("全ての区域一覧")).toBeNull();
  });

  it("editor+ には全ての区域一覧が表示され担当者名が出る", async () => {
    // member が a1 をチェックアウトした状態を admin 視点で見る
    const services = createInMemoryServices();
    await seed(services);
    await services.checkoutService.checkout(MEMBER, "a1", MEMBER);

    localStorage.setItem("dev.identity.actor", ADMIN);
    const identityService = new DevIdentityService(services.userRepo, ADMIN);
    render(
      <I18nProvider>
        <ServicesProvider services={services}>
          <IdentityProvider service={identityService}>
            <HashRouter>
              <DashboardPage />
            </HashRouter>
          </IdentityProvider>
        </ServicesProvider>
      </I18nProvider>,
    );

    expect(await screen.findByText("全ての区域一覧")).toBeInTheDocument();
    expect(await screen.findByText("Dev Member（担当）")).toBeInTheDocument();
    expect(screen.getByText("未チェックアウト")).toBeInTheDocument();
  });

  it("担当者行の招待ボタンで招待ダイアログが開き member を招待できる", async () => {
    await renderDashboard(ADMIN);
    const buttons = await screen.findAllByRole("button", {
      name: "チェックアウト",
    });
    await userEvent.click(buttons[0]);

    await userEvent.click(await screen.findByRole("button", { name: "招待" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("radio", { name: /Dev Member/ }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "発行" }));

    // ダイアログが閉じる（onIssued）
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
