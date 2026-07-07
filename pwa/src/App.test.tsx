import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { I18nProvider } from "./contexts/I18nContext";
import { IdentityProvider } from "./contexts/IdentityContext";
import { InMemoryUserRepository } from "./data/inmemory/inmemory-user-repository";
import { setLocale } from "./i18n/i18n-util";
import { createDevIdentityService } from "./services/identity-service";

async function renderApp() {
  const repo = new InMemoryUserRepository();
  const service = await createDevIdentityService(repo);
  return render(
    <I18nProvider>
      <IdentityProvider service={service}>
        <App />
      </IdentityProvider>
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
    expect(screen.getByText("Home Visit")).toBeInTheDocument();
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
