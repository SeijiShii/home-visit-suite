import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { I18nProvider } from "./contexts/I18nContext";
import { IdentityProvider } from "./contexts/IdentityContext";
import {
  ServicesProvider,
  createInMemoryServices,
} from "./contexts/ServicesContext";
import { setLocale } from "./i18n/i18n-util";
import {
  DEV_SEED_USERS,
  DevIdentityService,
} from "./services/identity-service";
import { TERMS_ACCEPTED_KEY, TERMS_VERSION, acceptTerms } from "./lib/terms";

async function renderApp(opts: { termsAccepted?: boolean } = {}) {
  // 大半のテストは同意ゲートの先の画面を対象とするため、既定で同意済みにする
  if (opts.termsAccepted !== false) acceptTerms();
  const services = createInMemoryServices();
  for (const u of DEV_SEED_USERS) {
    await services.userRepo.saveUser(u);
  }
  const identityService = new DevIdentityService(
    services.userRepo,
    DEV_SEED_USERS[0].id,
  );
  return render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={identityService}>
          <App />
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
    // i18n-util はモジュールレベルでロケールを保持するためテスト間でリセットする
    setLocale("ja");
  });

  it("アプリシェルとダッシュボードが表示される", async () => {
    await renderApp();
    // identity ゲート（初回判定）完了後にシェルが描画される
    expect(await screen.findByText("Home Visit")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "ダッシュボード" }),
    ).toBeInTheDocument();
  });

  it("既定アクター（admin）は管理者向けメニューが見える", async () => {
    await renderApp();
    expect(
      await screen.findByRole("link", { name: /メンバー管理/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /領域管理/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /区域編集/ })).toBeInTheDocument();
  });

  it("member アクターには editor 以上のメニューが見えない", async () => {
    localStorage.setItem("dev.identity.actor", "did:dev:member");
    await renderApp();
    // ロール取得完了を待つ（全ロール共通の設定リンクは常に表示される）
    expect(
      await screen.findByRole("link", { name: /設定/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /メンバー管理/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /区域編集/ })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /チェックアウト管理/ }),
    ).toBeNull();
  });

  it("設定画面でロケールを英語に切替できる", async () => {
    await renderApp();
    await userEvent.click(await screen.findByRole("link", { name: /設定/ }));
    await userEvent.click(
      await screen.findByRole("radio", { name: "English" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("ui.locale.mirror")).toBe("en");
  });

  it("未同意の初回起動では同意ゲートが表示され、同意すると通常画面へ進む", async () => {
    await renderApp({ termsAccepted: false });
    expect(
      await screen.findByRole("heading", { name: "使用許諾および免責事項" }),
    ).toBeInTheDocument();
    // 同意前は通常画面（サイドバー等）を描画しない
    expect(screen.queryByText("Home Visit")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "同意して利用を開始" }),
    );
    expect(
      await screen.findByRole("heading", { name: "ダッシュボード" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(TERMS_ACCEPTED_KEY)).toBe(TERMS_VERSION);
  });

  it("旧バージョンにのみ同意済みの場合は再同意を求める", async () => {
    localStorage.setItem(TERMS_ACCEPTED_KEY, "2000-01-01");
    await renderApp({ termsAccepted: false });
    expect(
      await screen.findByRole("heading", { name: "使用許諾および免責事項" }),
    ).toBeInTheDocument();
  });

  it("設定画面に使用許諾・免責事項の閲覧セクションがある", async () => {
    await renderApp();
    await userEvent.click(await screen.findByRole("link", { name: /設定/ }));
    expect(
      await screen.findByRole("heading", { name: "使用許諾・免責事項" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "全文を表示" }));
    expect(
      screen.getByRole("heading", { name: "4. 免責事項" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SeijiShii/)).toBeInTheDocument();
  });

  it("設定画面でアイデンティティを member に切替えるとメニューが絞られる", async () => {
    await renderApp();
    await userEvent.click(await screen.findByRole("link", { name: /設定/ }));
    await userEvent.click(
      await screen.findByRole("radio", { name: /Dev Member/ }),
    );
    expect(screen.queryByRole("link", { name: /メンバー管理/ })).toBeNull();
    expect(localStorage.getItem("dev.identity.actor")).toBe("did:dev:member");
  });
});
