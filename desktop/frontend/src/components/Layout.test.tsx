import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import { Layout } from "./Layout";
import * as IdentityBinding from "../../wailsjs/go/binding/IdentityBinding";
import * as UserBinding from "../../wailsjs/go/binding/UserBinding";

// Wails IdentityBinding / UserBinding のモック。
// テスト内で role を変えるため beforeEach で初期化する。
vi.mock("../../wailsjs/go/binding/IdentityBinding", () => ({
  GetRealDID: vi.fn(async () => "did:test"),
  GetCurrentActor: vi.fn(async () => "did:test"),
  IsDevMode: vi.fn(async () => false),
  ListAvailableIdentities: vi.fn(async () => []),
  SetCurrentActor: vi.fn(async () => {}),
}));
vi.mock("../../wailsjs/go/binding/UserBinding", () => ({
  GetUser: vi.fn(),
}));

async function renderLayout(role: "admin" | "editor" | "member") {
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
          <Layout />
        </I18nProvider>
      </IdentityProvider>
    </MemoryRouter>,
  );
  // IdentityProvider の useEffect (init + role fetch) を完了させる
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

describe("Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("editor では「チェックアウト管理」メニューが含まれる", async () => {
    await renderLayout("editor");
    expect(screen.getByText("チェックアウト管理")).toBeInTheDocument();
  });

  it("admin でも「チェックアウト管理」メニューが含まれる", async () => {
    await renderLayout("admin");
    expect(screen.getByText("チェックアウト管理")).toBeInTheDocument();
  });

  it("member には「チェックアウト管理」メニューが表示されない", async () => {
    await renderLayout("member");
    expect(screen.queryByText("チェックアウト管理")).not.toBeInTheDocument();
  });

  it("「訪問記録」サイドバーメニューは廃止されている", async () => {
    await renderLayout("admin");
    // 仕様 docs/wants/10_画面設計.md: 訪問記録への入口はダッシュボードに統合、
    // サイドバーには独立メニューを設けない。
    expect(screen.queryByText("訪問記録")).not.toBeInTheDocument();
  });

  it("ダッシュボードリンクがアクティブ", async () => {
    await renderLayout("admin");
    const links = screen.getAllByRole("link");
    expect(links[0].className).toContain("active");
  });

  it("サイドバー折りたたみが動作する", async () => {
    const user = userEvent.setup();
    await renderLayout("admin");

    const sidebar = document.querySelector(".sidebar");
    expect(sidebar?.className).not.toContain("collapsed");

    await user.click(screen.getByTitle("Toggle sidebar"));
    expect(sidebar?.className).toContain("collapsed");
  });

  it("設定ナビゲーションが含まれる（全ロール）", async () => {
    await renderLayout("member");
    expect(screen.getByText("設定")).toBeInTheDocument();
  });

  // IdentityBinding は外部の vi.mock で初期化済み（参照だけ）
  void IdentityBinding;
});
