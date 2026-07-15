// PairPage（端末ペアリング取り込み）の分岐テスト。
// docs/wants/01_共通基盤.md「端末ペアリング」（冪等性と DID 照合）参照。
// - 未登録端末: QR から同一 identity を復元して登録し、再読み込みする
// - 登録済み・同一 DID: 冪等スルー（onConsumed）
// - 登録済み・別 DID: 確認のうえ切り替え、旧グループ状態と旧自己レコードを破棄する
// - 失敗時（期限切れ）: 再発行の案内を出し、オンボーディングへ自動誘導しない

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "../contexts/I18nContext";
import { IdentityProvider, useIdentity } from "../contexts/IdentityContext";
import {
  type AppServices,
  ServicesProvider,
  createInMemoryServices,
} from "../contexts/ServicesContext";
import { generateIdentity, seedToBase64 } from "../lib/identity-crypto";
import { encodePairingPayload, type PairingPayload } from "../lib/pairing";
import { LocalIdentityService } from "../services/identity-service";
import { setLocale } from "../i18n/i18n-util";
import { PairPage } from "./PairPage";

/** 既存端末（PC）側が発行するペイロード相当を作る。 */
async function makePayload(
  name: string,
  overrides: Partial<PairingPayload> = {},
): Promise<PairingPayload> {
  const id = await generateIdentity();
  return {
    v: 1,
    secret: "0123456789abcdef0123456789abcdef",
    expiresAt: Date.now() + 60_000,
    seedB64: seedToBase64(id.seed),
    name,
    role: "admin",
    did: id.did,
    ...overrides,
  };
}

function setPairHash(payload: PairingPayload): void {
  window.location.hash = `#/pair?d=${encodePairingPayload(payload)}`;
}

/** App 同様、identity 判定完了までは描画しない（分岐材料の確定を保証する）。 */
function IdentityReadyGate({ children }: { children: ReactNode }) {
  const { identityReady } = useIdentity();
  return identityReady ? <>{children}</> : null;
}

interface Harness {
  services: AppServices;
  onConsumed: ReturnType<typeof vi.fn>;
  reloadApp: ReturnType<typeof vi.fn>;
}

function renderPair(services: AppServices): Harness {
  const onConsumed = vi.fn();
  const reloadApp = vi.fn();
  render(
    <I18nProvider>
      <ServicesProvider services={services}>
        <IdentityProvider service={new LocalIdentityService(services.userRepo)}>
          <IdentityReadyGate>
            <PairPage onConsumed={onConsumed} reloadApp={reloadApp} />
          </IdentityReadyGate>
        </IdentityProvider>
      </ServicesProvider>
    </I18nProvider>,
  );
  return { services, onConsumed, reloadApp };
}

function storedDid(): string | null {
  const raw = localStorage.getItem("hvs.identity");
  return raw ? (JSON.parse(raw) as { did: string }).did : null;
}

describe("PairPage 端末ペアリング取り込み", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
    setLocale("ja");
  });

  it("未登録端末は QR の identity を復元して登録し、再読み込みする", async () => {
    const payload = await makePayload("PC太郎", {
      deviceDid: "did:key:zPcDevice",
      groups: [{ networkId: "net-pc", groupName: "PCグループ" }],
    });
    setPairHash(payload);
    const { reloadApp, onConsumed } = renderPair(createInMemoryServices());

    await waitFor(() => expect(reloadApp).toHaveBeenCalled());
    expect(storedDid()).toBe(payload.did);
    expect(onConsumed).not.toHaveBeenCalled();
    // 発行側の所属グループの器と、兄弟デバイスの追加待ちを引き継ぐ
    // （docs/wants/01 payload 拡張 = 鍵とポインタのみ）。
    const slots = JSON.parse(localStorage.getItem("hvs.groups") ?? "[]") as {
      networkId: string | null;
      groupName: string | null;
    }[];
    expect(slots).toHaveLength(1);
    expect(slots[0].networkId).toBe("net-pc");
    expect(slots[0].groupName).toBe("PCグループ");
    expect(
      JSON.parse(localStorage.getItem("hvs.pendingSiblingDevices") ?? "[]"),
    ).toEqual([{ u: payload.did, d: "did:key:zPcDevice" }]);
  });

  it("登録済み・同一 DID は追加登録せず冪等スルーする", async () => {
    const services = createInMemoryServices();
    const payload = await makePayload("PC太郎");
    setPairHash(payload);
    // 事前に同じペイロードで登録済みにしておく（同一 DID）。
    await new LocalIdentityService(services.userRepo).completePairing(
      window.location.hash,
    );
    setPairHash(payload);
    const { onConsumed, reloadApp } = renderPair(services);

    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    expect(reloadApp).not.toHaveBeenCalled();
    expect(storedDid()).toBe(payload.did);
  });

  it("登録済み・別 DID は確認のうえ切り替え、旧グループ状態を破棄する", async () => {
    const services = createInMemoryServices();
    // この端末で誤って独立 ID（創設グループ）を作ってしまった状態を再現する。
    const svc = new LocalIdentityService(services.userRepo);
    await svc.createIdentity("スマホ独立");
    const oldDid = storedDid()!;
    localStorage.setItem("hvs.networkId", "net-old");
    localStorage.setItem("hvs.groupName", "独立グループ");

    const payload = await makePayload("PC太郎");
    setPairHash(payload);
    const { reloadApp } = renderPair(services);

    // 無条件スルーせず、切替確認が出る。
    const relinkBtn = await screen.findByRole("button", {
      name: "この ID に切り替えて紐づける",
    });
    expect(
      screen.getByText(/別の ID「スマホ独立」で使われています/),
    ).toBeTruthy();
    await userEvent.click(relinkBtn);

    await waitFor(() => expect(reloadApp).toHaveBeenCalled());
    expect(storedDid()).toBe(payload.did);
    // 旧グループ状態（networkId・グループ名・旧自己レコード）は破棄される。
    expect(localStorage.getItem("hvs.networkId")).toBeNull();
    expect(localStorage.getItem("hvs.groupName")).toBeNull();
    expect(await services.userRepo.getUser(oldDid)).toBeNull();
    expect(await services.userRepo.getUser(payload.did)).not.toBeNull();
  });

  it("期限切れは QR 再発行を案内し、オンボーディングへ自動誘導しない", async () => {
    const payload = await makePayload("PC太郎", {
      expiresAt: Date.now() - 1_000,
    });
    setPairHash(payload);
    const { reloadApp, onConsumed } = renderPair(createInMemoryServices());

    await screen.findByText(/引き継ぎに失敗しました/);
    expect(screen.getByText(/新しい QR を発行し/)).toBeTruthy();
    // 退避導線は「別グループになる」ことを明示した新規作成のみ（自動遷移はしない）。
    expect(
      screen.getByRole("button", { name: /新しい ID を作成する/ }),
    ).toBeTruthy();
    expect(onConsumed).not.toHaveBeenCalled();
    expect(reloadApp).not.toHaveBeenCalled();
    expect(storedDid()).toBeNull();
  });
});
