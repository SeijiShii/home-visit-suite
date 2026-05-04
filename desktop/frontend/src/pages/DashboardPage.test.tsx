import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import { DashboardPage } from "./DashboardPage";
import * as CheckoutBinding from "../../wailsjs/go/binding/CheckoutBinding";
import * as RegionBinding from "../../wailsjs/go/binding/RegionBinding";
import * as IdentityBinding from "../../wailsjs/go/binding/IdentityBinding";
import * as UserBinding from "../../wailsjs/go/binding/UserBinding";

// Wails binding のモック
vi.mock("../../wailsjs/go/binding/CheckoutBinding", () => ({
  ListAccessibleAreas: vi.fn(),
  GetActiveCheckout: vi.fn(async () => null),
}));
vi.mock("../../wailsjs/go/binding/RegionBinding", () => ({
  ListRegions: vi.fn(),
  ListParentAreas: vi.fn(),
  ListAreas: vi.fn(),
}));
vi.mock("../../wailsjs/go/binding/IdentityBinding", () => ({
  GetRealDID: vi.fn(async () => "did:test"),
  GetCurrentActor: vi.fn(async () => "did:test"),
  IsDevMode: vi.fn(async () => false),
  ListAvailableIdentities: vi.fn(async () => []),
  SetCurrentActor: vi.fn(async () => {}),
}));
vi.mock("../../wailsjs/go/binding/UserBinding", () => ({
  GetUser: vi.fn(),
  ListUsers: vi.fn(async () => []),
}));

function setupRegionTree() {
  vi.mocked(RegionBinding.ListRegions).mockResolvedValue([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "reg-nrt", name: "成田市", symbol: "NRT", approved: true } as any,
  ]);
  vi.mocked(RegionBinding.ListParentAreas).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (rid: string) =>
      rid === "reg-nrt"
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [
            {
              id: "pa-001",
              regionId: "reg-nrt",
              number: "001",
              name: "",
            } as any,
          ]
        : [],
  );
  vi.mocked(RegionBinding.ListAreas).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (paid: string) =>
      paid === "pa-001"
        ? [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { id: "area-1", parentAreaId: "pa-001", number: "01" } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { id: "area-2", parentAreaId: "pa-001", number: "02" } as any,
          ]
        : [],
  );
}

async function renderDashboard(role: "admin" | "editor" | "member" = "admin") {
  vi.mocked(UserBinding.GetUser).mockResolvedValue({
    id: "did:test",
    name: "テスト",
    role,
    orgGroupId: "",
    tagIds: [],
    joinedAt: "2025-04-01T00:00:00Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const result = render(
    <MemoryRouter initialEntries={["/"]}>
      <IdentityProvider>
        <I18nProvider>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/visits/:areaId"
              element={<div data-testid="visit-page">visit</div>}
            />
          </Routes>
        </I18nProvider>
      </IdentityProvider>
    </MemoryRouter>,
  );
  // IdentityProvider の init + ロール fetch + DashboardPage の useEffect 連鎖
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  return result;
}

describe("DashboardPage - アクセス可能な区域", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupRegionTree();
  });

  it("アクセス可能な区域がない場合は空メッセージが表示される", async () => {
    vi.mocked(CheckoutBinding.ListAccessibleAreas).mockResolvedValue([]);
    await renderDashboard("member");
    expect(
      screen.getByText(/アクセス可能な区域はありません/),
    ).toBeInTheDocument();
  });

  it("担当者の区域は鍵アイコン＋『担当者』ラベルで表示される", async () => {
    vi.mocked(CheckoutBinding.ListAccessibleAreas).mockResolvedValue([
      {
        areaId: "area-1",
        checkoutId: "co-1",
        role: "owner",
        inviteExpiresAt: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    await renderDashboard("member");
    // 表示名は領域記号-区域親番-区域番号
    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.getByText("担当者")).toBeInTheDocument();
    // 担当者行には「招待」ボタンが出る
    expect(screen.getByRole("button", { name: "招待" })).toBeInTheDocument();
  });

  it("被招待者の区域は人＋時計アイコン＋残時間で表示される", async () => {
    const expiresAt = new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString();
    vi.mocked(CheckoutBinding.ListAccessibleAreas).mockResolvedValue([
      {
        areaId: "area-2",
        checkoutId: "co-2",
        role: "invitee",
        inviteExpiresAt: expiresAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    await renderDashboard("member");
    expect(screen.getByText("NRT-001-02")).toBeInTheDocument();
    // 残時間 22 h（境界の floor で 21〜22）
    expect(screen.getByText(/招待 \(残2[12]h\)/)).toBeInTheDocument();
    // 被招待者行には「招待」ボタンが出ない
    expect(
      screen.queryByRole("button", { name: "招待" }),
    ).not.toBeInTheDocument();
  });

  it("「訪問記録 →」クリックで /visits/:areaId へ遷移する", async () => {
    vi.mocked(CheckoutBinding.ListAccessibleAreas).mockResolvedValue([
      {
        areaId: "area-1",
        checkoutId: "co-1",
        role: "owner",
        inviteExpiresAt: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    const user = userEvent.setup();
    await renderDashboard("member");

    await user.click(screen.getByRole("button", { name: "訪問記録 →" }));
    expect(await screen.findByTestId("visit-page")).toBeInTheDocument();
  });

  it("「招待」ボタンクリックで Phase G6 のプレースホルダ alert が表示される", async () => {
    vi.mocked(CheckoutBinding.ListAccessibleAreas).mockResolvedValue([
      {
        areaId: "area-1",
        checkoutId: "co-1",
        role: "owner",
        inviteExpiresAt: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();
    await renderDashboard("member");

    await user.click(screen.getByRole("button", { name: "招待" }));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("Phase G6"));
    alertSpy.mockRestore();
  });

  // IdentityBinding は外部 vi.mock で初期化済み（参照だけ）
  void IdentityBinding;
});

describe("DashboardPage - タイトル", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupRegionTree();
    vi.mocked(CheckoutBinding.ListAccessibleAreas).mockResolvedValue([]);
  });

  it("タイトルが表示される", async () => {
    await renderDashboard();
    expect(
      screen.getByRole("heading", { level: 1, name: "ダッシュボード" }),
    ).toBeInTheDocument();
  });
});

describe("DashboardPage - 全ての区域一覧（editor+ のみ）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupRegionTree();
    vi.mocked(CheckoutBinding.ListAccessibleAreas).mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(CheckoutBinding.GetActiveCheckout).mockResolvedValue(null as any);
    vi.mocked(UserBinding.ListUsers).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        id: "u1",
        name: "田中太郎",
        role: "member",
        orgGroupId: "",
        tagIds: [],
        joinedAt: "2025-04-01T00:00:00Z",
      } as any,
    ]);
  });

  it("admin では「全ての区域一覧」セクションが表示される", async () => {
    await renderDashboard("admin");
    expect(
      screen.getByRole("heading", { name: "全ての区域一覧" }),
    ).toBeInTheDocument();
  });

  it("editor でも「全ての区域一覧」セクションが表示される", async () => {
    await renderDashboard("editor");
    expect(
      screen.getByRole("heading", { name: "全ての区域一覧" }),
    ).toBeInTheDocument();
  });

  it("member には「全ての区域一覧」セクションは表示されない", async () => {
    await renderDashboard("member");
    expect(
      screen.queryByRole("heading", { name: "全ての区域一覧" }),
    ).not.toBeInTheDocument();
  });

  it("未チェックアウト区域は「未チェックアウト」と表示される", async () => {
    await renderDashboard("admin");
    // 全 2 区域とも未チェックアウト
    const cells = screen.getAllByText("未チェックアウト");
    expect(cells.length).toBe(2);
  });

  it("active チェックアウトがある区域は担当者名（担当）が表示される", async () => {
    vi.mocked(CheckoutBinding.GetActiveCheckout).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (areaId: string) =>
        areaId === "area-1"
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({
              id: "co-1",
              areaId: "area-1",
              ownerId: "u1",
              status: "active",
            } as any)
          : null,
    );
    await renderDashboard("admin");
    expect(screen.getByText("田中太郎（担当）")).toBeInTheDocument();
  });

  it("インクリメンタルサーチで絞り込まれる", async () => {
    const user = userEvent.setup();
    await renderDashboard("admin");
    // 検索前は 2 区域
    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.getByText("NRT-001-02")).toBeInTheDocument();

    // 「-01」は NRT-001-01 末尾にしかマッチしない（NRT-001-02 末尾は -02）
    await user.type(
      screen.getByPlaceholderText("区域 ID または担当者名で検索"),
      "-01",
    );
    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.queryByText("NRT-001-02")).not.toBeInTheDocument();
  });

  it("領域フィルタで絞り込まれる", async () => {
    const user = userEvent.setup();
    await renderDashboard("admin");
    const regionSelect = screen.getByLabelText("すべての領域");
    await user.selectOptions(regionSelect, "reg-nrt");
    // 同領域内なので両区域は残る
    expect(screen.getByText("NRT-001-01")).toBeInTheDocument();
    expect(screen.getByText("NRT-001-02")).toBeInTheDocument();
  });
});
