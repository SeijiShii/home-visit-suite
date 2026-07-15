// Layout の狭幅サイドバー挙動テスト。
// docs/wants/10_画面設計.md 共通レイアウト注記（狭幅は初期折りたたみ・
// 展開はオーバーレイ・背面タップ/遷移で閉じる）参照。

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider } from "../contexts/IdentityContext";
import type { IdentityService } from "../services/identity-service";
import { NARROW_VIEWPORT_QUERY } from "../hooks/useMediaQuery";
import { setLocale } from "../i18n/i18n-util";
import { Layout } from "./Layout";

/** matchMedia を差し替え、狭幅クエリだけ narrow を返す。 */
function mockMatchMedia(narrow: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === NARROW_VIEWPORT_QUERY ? narrow : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function fakeIdentityService(): IdentityService {
  return {
    getRealDID: async () => "did:test:self",
    getCurrentActor: async () => "did:test:self",
    setCurrentActor: async () => {},
    isDevMode: async () => false,
    listAvailableIdentities: async () => [],
    getUser: async () => ({
      id: "did:test:self",
      name: "テスト太郎",
      role: "member",
      tagIds: [],
      joinedAt: "2026-01-01T00:00:00Z",
    }),
    hasIdentity: async () => true,
    loadIdentity: async () => null,
    createIdentity: async () => {
      throw new Error("not supported");
    },
    createPairingToken: async () => ({ url: "", expiresAt: 0 }),
    completePairing: async () => {
      throw new Error("not supported");
    },
    getCurrentDeviceId: async () => "dev-test",
    listDevices: async () => [],
    renameDevice: async () => {},
    removeDevice: async () => {},
    setRole: async () => {
      throw new Error("not used");
    },
    setName: async () => {
      throw new Error("not used");
    },
  };
}

function renderLayout(): void {
  render(
    <I18nProvider>
      <IdentityProvider service={fakeIdentityService()}>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<div>home-content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </IdentityProvider>
    </I18nProvider>,
  );
}

describe("Layout 狭幅サイドバー", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale("ja");
  });

  it("狭幅では初期折りたたみ・レイアウトに狭幅クラスが付く", () => {
    mockMatchMedia(true);
    renderLayout();
    const sidebar = document.querySelector("nav.sidebar")!;
    expect(sidebar.className).toContain("collapsed");
    expect(sidebar.className).toContain("sidebar-overlay");
    expect(document.querySelector(".layout")!.className).toContain(
      "layout-narrow",
    );
    expect(document.querySelector(".sidebar-backdrop")).toBeNull();
  });

  it("狭幅で展開すると backdrop が出て、backdrop タップで閉じる", async () => {
    mockMatchMedia(true);
    renderLayout();
    await userEvent.click(screen.getByTitle("Toggle sidebar"));
    const backdrop = document.querySelector(".sidebar-backdrop");
    expect(backdrop).not.toBeNull();
    expect(
      document.querySelector("nav.sidebar")!.className,
    ).not.toContain("collapsed");

    await userEvent.click(backdrop as Element);
    expect(document.querySelector("nav.sidebar")!.className).toContain(
      "collapsed",
    );
    expect(document.querySelector(".sidebar-backdrop")).toBeNull();
  });

  it("広幅では従来どおり初期展開・オーバーレイ化しない", () => {
    mockMatchMedia(false);
    renderLayout();
    const sidebar = document.querySelector("nav.sidebar")!;
    expect(sidebar.className).not.toContain("collapsed");
    expect(sidebar.className).not.toContain("sidebar-overlay");
    expect(document.querySelector(".layout")!.className).not.toContain(
      "layout-narrow",
    );
  });
});
