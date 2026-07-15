// 区域一覧 /areas のテスト（サービス層をインメモリ実装で駆動）。
// 仕様: docs/wants/10_画面設計.md「区域一覧 /areas」

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
import { AreasPage } from "./AreasPage";

const ADMIN = "did:dev:admin";
const MEMBER = "did:dev:member";

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
  await services.regionRepo.saveParentArea({
    id: "pa2",
    regionId: "r1",
    number: "002",
    name: "囲護台",
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
    geometry: null, // ポリゴン未紐付け
  });
}

async function renderAreas(services: AppServices, actor: string) {
  localStorage.setItem("dev.identity.actor", actor);
  const identityService = new DevIdentityService(services.userRepo, ADMIN);
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <HashRouter>
            <AreasPage />
          </HashRouter>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
}

describe("AreasPage", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
    setLocale("ja");
  });

  it("区域親番が一覧され、ID・名称で絞り込める", async () => {
    const services = createInMemoryServices();
    await seed(services);
    await renderAreas(services, ADMIN);

    expect(await screen.findByText("NRT-001")).toBeInTheDocument();
    expect(screen.getByText("NRT-002")).toBeInTheDocument();

    // 名称で絞り込み
    const input = screen.getByPlaceholderText("親番 ID または名称で絞り込み");
    await userEvent.type(input, "囲護台");
    expect(screen.queryByText("NRT-001")).toBeNull();
    expect(screen.getByText("NRT-002")).toBeInTheDocument();

    // ID で絞り込み
    await userEvent.clear(input);
    await userEvent.type(input, "NRT-001");
    expect(screen.getByText("NRT-001")).toBeInTheDocument();
    expect(screen.queryByText("NRT-002")).toBeNull();
  });

  it("親番行を展開すると区域が見え、チェックアウト中の担当者名と日付が出る", async () => {
    const services = createInMemoryServices();
    await seed(services);
    await services.checkoutService.checkout(MEMBER, "a1", MEMBER);
    await renderAreas(services, ADMIN);

    await userEvent.click(await screen.findByText("NRT-001"));

    // 区域行: a1 はチェックアウト中（担当者名を含む表示）
    expect(await screen.findByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.getByText(/Dev Member（.+〜）/)).toBeInTheDocument();
    // a2 はポリゴン未紐付け → チェックアウト不可の旨
    expect(screen.getByText("NRT-001-02")).toBeInTheDocument();
    expect(screen.getByText("ポリゴン未紐付け")).toBeInTheDocument();
    // チェックアウト中/未紐付けの行にはチェックアウトボタンが無い
    expect(screen.queryByRole("button", { name: "チェックアウト" })).toBeNull();
  });

  it("チェックアウト可能な区域行のボタンから担当者を割り当てられる", async () => {
    const services = createInMemoryServices();
    await seed(services);
    await renderAreas(services, ADMIN);

    await userEvent.click(await screen.findByText("NRT-001"));

    // a1 は未チェックアウト × ポリゴン紐付け済み → ボタンあり
    await userEvent.click(
      await screen.findByRole("button", { name: "チェックアウト" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("NRT-001-01")).toBeInTheDocument();

    // 担当者に Dev Member を選択して割り当て
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox"),
      MEMBER,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "割り当て" }),
    );

    // 行が更新されチェックアウト中表示になる
    await waitFor(() =>
      expect(screen.getByText(/Dev Member（.+〜）/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "チェックアウト" })).toBeNull();

    // サービス層にも反映されている
    const active = await services.checkoutRepo.getActiveCheckout("a1");
    expect(active?.personInChargeId).toBe(MEMBER);
    expect(active?.checkedOutById).toBe(ADMIN);
  });
});
