import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { I18nProvider } from "./contexts/I18nContext";

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("アプリシェルが日本語で表示される", () => {
    renderApp();
    expect(screen.getByText("Home Visit")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ダッシュボード" })).toBeInTheDocument();
  });

  it("ロケール切替で英語表示になり localStorage にミラーされる", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(localStorage.getItem("ui.locale.mirror")).toBe("en");
  });
});
