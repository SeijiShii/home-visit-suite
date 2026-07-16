// 申請管理 /requests のテスト（サービス層をインメモリ実装で駆動）。
// 仕様: docs/wants/07_通知と申請.md「申請一覧」:
// 単一リスト＋ステータスバッジ / 初期表示は未処理のみ / 区域ID・区域名検索 /
// 申請日・処理日の期間絞り込み / 申請者名表示 / 行内ステータス変更。

import { beforeEach, describe, expect, it } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { HashRouter } from "react-router-dom";
import { setLocale } from "../i18n/i18n-util";
import { DevIdentityService } from "../services/identity-service";
import type { Request } from "../domain/models/request";
import type { Place } from "../services/place-service";
import { RequestsPage } from "./RequestsPage";

const ADMIN = "did:dev:admin";
const MEMBER = "did:dev:member";

function makePlace(partial: Partial<Place>): Place {
  return {
    id: "p1",
    areaId: "a1",
    coord: { lat: 35.7, lng: 140.3 },
    type: "house",
    label: "田中宅",
    displayName: "",
    address: "",
    description: "",
    parentId: "",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    restoredFromId: null,
    ...partial,
  };
}

function makeRequest(partial: Partial<Request>): Request {
  return {
    id: "req-1",
    type: "place_delete",
    status: "pending",
    submitterId: MEMBER,
    areaId: "a1",
    placeId: "p1",
    coord: null,
    description: "",
    createdAt: "2026-07-10T09:00:00Z",
    resolvedAt: null,
    resolvedBy: "",
    ...partial,
  };
}

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
    geometry: null,
  });
  await services.regionRepo.saveArea({
    id: "a2",
    parentAreaId: "pa1",
    number: "02",
    geometry: null,
  });

  // 未処理（a1、要削除、Dev Member、7/10）
  await services.notificationRepo.saveRequest(
    makeRequest({ id: "req-1", description: "取り壊し済み" }),
  );
  // 保留（a1、要移動、7/03）
  await services.notificationRepo.saveRequest(
    makeRequest({
      id: "req-2",
      type: "place_move",
      status: "on_hold",
      createdAt: "2026-07-03T09:00:00Z",
      description: "位置ずれ",
    }),
  );
  // 処理済み（a2、その他、7/01 申請 → 7/06 処理）
  await services.notificationRepo.saveRequest(
    makeRequest({
      id: "req-3",
      type: "place_info_modify",
      status: "resolved",
      areaId: "a2",
      submitterId: ADMIN,
      createdAt: "2026-07-01T09:00:00Z",
      resolvedAt: "2026-07-06T09:00:00Z",
      resolvedBy: ADMIN,
      description: "表札修正",
    }),
  );
}

async function renderRequests(services: AppServices) {
  localStorage.setItem("dev.identity.actor", ADMIN);
  const identityService = new DevIdentityService(services.userRepo, ADMIN);
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <HashRouter>
            <RequestsPage />
          </HashRouter>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
}

async function setup(): Promise<AppServices> {
  const services = createInMemoryServices();
  await seed(services);
  await renderRequests(services);
  // 初期ロード完了（未処理 req-1 の表示）を待つ
  await screen.findByText("取り壊し済み");
  return services;
}

function checkStatus(label: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: label }));
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
  setLocale("ja");
});

describe("RequestsPage 申請一覧", () => {
  it("初期表示は未処理のみ（セクション分けなしの単一リスト＋ステータスバッジ）", async () => {
    await setup();
    expect(screen.getAllByTestId("request-row")).toHaveLength(1);
    expect(screen.getByText("取り壊し済み")).toBeInTheDocument();
    expect(screen.queryByText("位置ずれ")).toBeNull();
    expect(screen.queryByText("表札修正")).toBeNull();
    // 行内にステータスバッジ
    expect(screen.getByTestId("request-status-badge").textContent).toBe(
      "未処理",
    );
  });

  it("申請者名が表示される", async () => {
    await setup();
    expect(screen.getByText("Dev Member")).toBeInTheDocument();
  });

  it("ステータス絞り込みを切り替えると保留・処理済みも表示される", async () => {
    await setup();
    checkStatus("保留");
    checkStatus("処理済み");
    expect(screen.getAllByTestId("request-row")).toHaveLength(3);
    // 未処理を外すと req-1 が消える
    checkStatus("未処理");
    expect(screen.getAllByTestId("request-row")).toHaveLength(2);
    expect(screen.queryByText("取り壊し済み")).toBeNull();
  });

  it("区域ID・区域名（親番名）で検索できる", async () => {
    await setup();
    checkStatus("保留");
    checkStatus("処理済み");
    const input = screen.getByPlaceholderText("区域IDまたは区域名で検索");

    // 区域IDで検索（a2 = NRT-001-02）
    await userEvent.type(input, "NRT-001-02");
    expect(screen.getAllByTestId("request-row")).toHaveLength(1);
    expect(screen.getByText("表札修正")).toBeInTheDocument();

    // 区域名（親番名）で検索 → pa1 配下の全申請
    await userEvent.clear(input);
    await userEvent.type(input, "加良部");
    expect(screen.getAllByTestId("request-row")).toHaveLength(3);

    // 一致なし
    await userEvent.clear(input);
    await userEvent.type(input, "zzz");
    expect(screen.queryAllByTestId("request-row")).toHaveLength(0);
    expect(
      screen.getByText("条件に一致する申請はありません"),
    ).toBeInTheDocument();
  });

  it("申請日の期間で絞り込める", async () => {
    await setup();
    checkStatus("保留");
    checkStatus("処理済み");
    fireEvent.change(screen.getByLabelText("申請日（から）"), {
      target: { value: "2026-07-02" },
    });
    fireEvent.change(screen.getByLabelText("申請日（まで）"), {
      target: { value: "2026-07-05" },
    });
    // 7/03 の req-2 のみ
    expect(screen.getAllByTestId("request-row")).toHaveLength(1);
    expect(screen.getByText("位置ずれ")).toBeInTheDocument();
  });

  it("処理日の期間で絞り込める（未処理は処理日なしのため除外）", async () => {
    await setup();
    checkStatus("保留");
    checkStatus("処理済み");
    fireEvent.change(screen.getByLabelText("処理日（から）"), {
      target: { value: "2026-07-06" },
    });
    expect(screen.getAllByTestId("request-row")).toHaveLength(1);
    expect(screen.getByText("表札修正")).toBeInTheDocument();
  });

  it("行内操作でステータスを変更でき、処理済みで処理日・処理者を記録する", async () => {
    const services = await setup();
    await userEvent.click(
      screen.getByRole("button", { name: "処理済みにする" }),
    );
    // 未処理フィルタのみの初期表示から消える
    await waitFor(() => {
      expect(screen.queryAllByTestId("request-row")).toHaveLength(0);
    });
    const saved = await services.notificationRepo.getRequest("req-1");
    expect(saved?.status).toBe("resolved");
    expect(saved?.resolvedAt).toBeTruthy();
    expect(saved?.resolvedBy).toBe(ADMIN);
  });

  it("行の「訪問記録へ」で対象区域の訪問記録画面へ場所指定付きで遷移する", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "訪問記録へ" }));
    await waitFor(() => {
      expect(window.location.hash).toBe("#/visits/a1?place=p1");
    });
  });

  it("部屋を対象とする申請は親の集合住宅を選択対象にして遷移する", async () => {
    const services = createInMemoryServices();
    await seed(services);
    await services.placeService.savePlace(
      makePlace({ id: "b1", type: "building", label: "○○荘" }),
    );
    await services.placeService.savePlace(
      makePlace({
        id: "rm1",
        type: "room",
        parentId: "b1",
        displayName: "101",
      }),
    );
    await services.notificationRepo.saveRequest(
      makeRequest({
        id: "req-room",
        placeId: "rm1",
        description: "部屋の修正",
      }),
    );
    await renderRequests(services);
    const row = (await screen.findByText("部屋の修正")).closest("li")!;
    await userEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "訪問記録へ" }),
    );
    await waitFor(() => {
      expect(window.location.hash).toBe("#/visits/a1?place=b1");
    });
  });

  it("placeId なしは場所指定なしで遷移し、areaId なしには遷移操作が出ない", async () => {
    const services = createInMemoryServices();
    await seed(services);
    await services.notificationRepo.saveRequest(
      makeRequest({
        id: "req-noplace",
        placeId: "",
        description: "場所なし申請",
      }),
    );
    await services.notificationRepo.saveRequest(
      makeRequest({
        id: "req-noarea",
        areaId: "",
        description: "区域なし申請",
      }),
    );
    await renderRequests(services);
    const noAreaRow = (await screen.findByText("区域なし申請")).closest("li")!;
    expect(
      within(noAreaRow as HTMLElement).queryByRole("button", {
        name: "訪問記録へ",
      }),
    ).toBeNull();
    const noPlaceRow = screen.getByText("場所なし申請").closest("li")!;
    await userEvent.click(
      within(noPlaceRow as HTMLElement).getByRole("button", {
        name: "訪問記録へ",
      }),
    );
    await waitFor(() => {
      expect(window.location.hash).toBe("#/visits/a1");
    });
  });

  it("処理済みから未処理に戻すと処理日・処理者が消去される", async () => {
    const services = await setup();
    checkStatus("処理済み");
    checkStatus("未処理");
    await userEvent.click(screen.getByRole("button", { name: "未処理に戻す" }));
    await waitFor(async () => {
      const saved = await services.notificationRepo.getRequest("req-3");
      expect(saved?.status).toBe("pending");
      expect(saved?.resolvedAt).toBeNull();
      expect(saved?.resolvedBy).toBe("");
    });
  });
});
