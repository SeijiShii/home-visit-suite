// CoveragePage の移植テスト（サービス層をインメモリ実装で駆動）。

import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { CoveragePage } from "./CoveragePage";

const EDITOR = "did:dev:editor";

async function seed(services: AppServices) {
  await services.userRepo.saveUser({
    id: EDITOR,
    name: "Eve Editor",
    role: "editor",
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
}

async function renderCoverage(
  extraSeed?: (services: AppServices) => Promise<void>,
): Promise<AppServices> {
  const services = createInMemoryServices();
  await seed(services);
  await extraSeed?.(services);
  localStorage.setItem("dev.identity.actor", EDITOR);
  const identityService = new DevIdentityService(services.userRepo, EDITOR);
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <CoveragePage />
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
  return services;
}

describe("CoveragePage", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("期間一覧が空の初期表示", async () => {
    await renderCoverage();
    expect(await screen.findByText("登録された期間がありません")).toBeInTheDocument();
  });

  it("期間を作成すると一覧に現れる", async () => {
    const services = await renderCoverage();
    await userEvent.click(await screen.findByRole("button", { name: "+ 期間を作成" }));

    const dialog = await screen.findByRole("dialog");
    // 名前入力（最初の textbox が名前）
    const nameInput = within(dialog).getByDisplayValue("");
    await userEvent.type(nameInput, "8月の活動");
    await userEvent.click(within(dialog).getByLabelText(/加良部1丁目|001/));
    await userEvent.click(within(dialog).getByRole("button", { name: "作成" }));

    expect(await screen.findByText("8月の活動")).toBeInTheDocument();
    const list = await services.availablePeriodService.listPeriods();
    expect(list).toHaveLength(1);
    expect(list[0].parentAreaIds).toEqual(["pa1"]);
  });

  it("アクティブ期間が上部に表示される", async () => {
    const now = Date.now();
    await renderCoverage(async (s) => {
      await s.coverageRepo.saveAvailablePeriod({
        id: "ap-active",
        name: "現行期間",
        startDate: new Date(now - 86400000).toISOString(),
        endDate: new Date(now + 86400000).toISOString(),
        parentAreaIds: ["pa1"],
        tagIds: [],
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      });
    });

    expect(await screen.findByText("現在のアクティブ期間")).toBeInTheDocument();
    // アクティブ期間セクションと一覧の両方に名前が出る
    expect(screen.getAllByText("現行期間").length).toBeGreaterThanOrEqual(1);
  });

  it("開始前の期間は削除でき、確認ダイアログを経る", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const future = Date.now() + 10 * 86400000;
    const services = await renderCoverage(async (s) => {
      await s.coverageRepo.saveAvailablePeriod({
        id: "ap-future",
        name: "来月の期間",
        startDate: new Date(future).toISOString(),
        endDate: new Date(future + 86400000).toISOString(),
        parentAreaIds: [],
        tagIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    await screen.findByText("来月の期間");
    await userEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(await services.availablePeriodService.listPeriods()).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("タグを作成できる", async () => {
    const services = await renderCoverage();
    await userEvent.click(await screen.findByRole("button", { name: "+ タグを作成" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "春の巡回");
    await userEvent.click(within(dialog).getByRole("button", { name: "作成" }));

    expect(await screen.findByText("春の巡回")).toBeInTheDocument();
    expect(await services.availablePeriodService.listTags()).toHaveLength(1);
  });
});
