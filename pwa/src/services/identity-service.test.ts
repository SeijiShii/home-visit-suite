// LocalIdentityService: 初回作成・永続・端末ペアリング（同一 DID コピー）の検証。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryUserRepository } from "../data/inmemory/inmemory-user-repository";
import { LocalIdentityService } from "./identity-service";

beforeEach(() => {
  localStorage.clear();
});

describe("LocalIdentityService の初回 ID 作成", () => {
  it("作成前は identity なし、作成後は管理者ユーザーが保存される", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    expect(await svc.hasIdentity()).toBe(false);

    const user = await svc.createIdentity("山田太郎");
    expect(user.role).toBe("admin");
    expect(user.name).toBe("山田太郎");
    expect(user.id.startsWith("did:key:z")).toBe(true);

    expect(await svc.hasIdentity()).toBe(true);
    expect(await svc.getRealDID()).toBe(user.id);
    expect(await svc.getCurrentActor()).toBe(user.id);
  });

  it("空の名前は拒否する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await expect(svc.createIdentity("   ")).rejects.toThrow();
  });

  it("別インスタンスでも localStorage から復元できる（loadIdentity）", async () => {
    const created = await new LocalIdentityService(
      new InMemoryUserRepository(),
    ).createIdentity("田中");

    // 別起動を模す: 新しい repo + サービスで復元
    const repo2 = new InMemoryUserRepository();
    const svc2 = new LocalIdentityService(repo2);
    const restored = await svc2.loadIdentity();
    expect(restored?.id).toBe(created.id);
    expect(await repo2.getUser(created.id)).not.toBeNull();
  });
});

describe("端末ペアリング（同一 DID の別端末追加）", () => {
  it("既存端末のペアリング URL を新端末が取り込むと同一 DID・同一ロールになる", async () => {
    // 既存端末（PC）
    const pc = new LocalIdentityService(new InMemoryUserRepository());
    const pcUser = await pc.createIdentity("佐藤");
    const { url } = await pc.createPairingToken();
    expect(url).toContain("#/pair?d=");

    // 新端末（スマホ）: 別 localStorage を模すため一旦クリア
    localStorage.clear();
    const phoneRepo = new InMemoryUserRepository();
    const phone = new LocalIdentityService(phoneRepo);
    expect(await phone.hasIdentity()).toBe(false);

    // URL 全体を渡しても取り込める（フラグメントの d= を抽出）
    const phoneUser = await phone.completePairing(url);
    expect(phoneUser.id).toBe(pcUser.id); // 同一 DID
    expect(phoneUser.role).toBe("admin");
    expect(phoneUser.name).toBe("佐藤");
    expect(await phone.hasIdentity()).toBe(true);
    expect(await phoneRepo.getUser(pcUser.id)).not.toBeNull();
  });

  it("壊れた入力は拒否する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("鈴木");
    await expect(svc.completePairing("garbage")).rejects.toThrow();
  });

  it("VITE_PAIRING_BASE_URL があればペアリング URL のベースを上書きする", async () => {
    vi.stubEnv("VITE_PAIRING_BASE_URL", "https://app.example.com/");
    try {
      const svc = new LocalIdentityService(new InMemoryUserRepository());
      await svc.createIdentity("岡田");
      const { url } = await svc.createPairingToken();
      expect(url.startsWith("https://app.example.com/#/pair?d=")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("デバイス登録簿", () => {
  it("ID 作成時に自端末が登録され、ラベル編集できる", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    const user = await svc.createIdentity("高橋");
    const devices = await svc.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].userId).toBe(user.id);
    const currentId = await svc.getCurrentDeviceId();
    expect(devices[0].id).toBe(currentId);

    await svc.renameDevice(currentId, "  自宅PC  ");
    expect((await svc.listDevices())[0].label).toBe("自宅PC");
  });

  it("当該デバイス自身は removeDevice で消せない", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("伊藤");
    const currentId = await svc.getCurrentDeviceId();
    await expect(svc.removeDevice(currentId)).rejects.toThrow();
  });

  it("他デバイスは removeDevice で削除できる", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("渡辺");
    const currentId = await svc.getCurrentDeviceId();
    // 別端末が同期で現れた状況を模して登録簿へ直接追加
    const did = await svc.getRealDID();
    localStorage.setItem(
      "hvs.devices",
      JSON.stringify([
        {
          id: currentId,
          userId: did,
          label: "PC",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "dev-other",
          userId: did,
          label: "旧スマホ",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]),
    );
    await svc.removeDevice("dev-other");
    const devices = await svc.listDevices();
    expect(devices.map((d) => d.id)).toEqual([currentId]);
  });

  it("再登録(upsert)は同一ユーザーの他端末エントリと自端末ラベルを温存する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    const user = await svc.createIdentity("松本");
    const myId = await svc.getCurrentDeviceId();
    await svc.renameDevice(myId, "自宅PC");
    // 同一ユーザーの別端末が同期で現れた状況を模して登録簿へ直接追加
    localStorage.setItem(
      "hvs.devices",
      JSON.stringify([
        {
          id: myId,
          userId: user.id,
          label: "自宅PC",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "dev-phone",
          userId: user.id,
          label: "スマホ",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]),
    );
    // 同一 ID を再取り込み（registerThisDevice を通る）しても他端末は消えない
    const { url } = await svc.createPairingToken();
    await svc.completePairing(url);
    const devices = await svc.listDevices();
    expect(devices.map((d) => d.id).sort()).toEqual(["dev-phone", myId].sort());
    expect(devices.find((d) => d.id === myId)?.label).toBe("自宅PC");
  });

  it("unregisterThisDevice で identity とデバイスが消えオンボーディングへ戻る", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("中村");
    await svc.unregisterThisDevice();
    expect(await svc.hasIdentity()).toBe(false);
    expect(await svc.listDevices()).toEqual([]);
  });
});
