// LocalIdentityService: 初回作成・永続・端末ペアリング（同一 DID コピー）の検証。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryUserRepository } from "../data/inmemory/inmemory-user-repository";
import { registerDeviceDirectory } from "../lib/device-directory";
import {
  generateIdentity as generateLocalIdentity,
  identityFromSeed,
  seedToBase64,
} from "../lib/identity-crypto";
import { createGroupSlot, listGroupSlots, nsKey } from "../lib/group-slots";
import { LocalIdentityService } from "./identity-service";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  registerDeviceDirectory(null);
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

  it("取り込みは payload 拡張（グループの器・兄弟控え）も適用する（貼付経路と URL 経路の共通挙動）", async () => {
    // 既存端末（PC）: グループ所属 + デバイス鍵あり。
    const pc = new LocalIdentityService(new InMemoryUserRepository());
    const pcUser = await pc.createIdentity("佐藤");
    const deviceSeed = new Uint8Array(32);
    crypto.getRandomValues(deviceSeed);
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(deviceSeed));
    const pcDeviceDid = (await identityFromSeed(deviceSeed)).did;
    createGroupSlot({ networkId: "net-1", groupName: "第一" });
    const { url } = await pc.createPairingToken();

    // 新端末: オンボーディングの手入力貼付と同じく service.completePairing
    // だけを呼ぶ（PairPage の追加処理に依存しない）。
    localStorage.clear();
    const phone = new LocalIdentityService(new InMemoryUserRepository());
    await phone.completePairing(url);

    // 所属グループの器（スロット + networkId キー）が作られている。
    const slots = listGroupSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0].networkId).toBe("net-1");
    expect(slots[0].groupName).toBe("第一");
    expect(localStorage.getItem(nsKey(slots[0].slotId, "networkId"))).toBe(
      "net-1",
    );
    // ネットワーク実体が自分のメンバーシップで合成されている（これが無いと
    // listForMember が空になり group catch-up が永遠に要求されない）。
    const networks = JSON.parse(
      localStorage.getItem("hvs.networks") ?? "{}",
    ) as Record<string, { members?: string[] }>;
    expect(networks["net-1"]?.members).toContain(pcUser.id);
    // 発行側デバイスがロスター追加待ちに控えられている。
    const pending = JSON.parse(
      localStorage.getItem("hvs.pendingSiblingDevices") ?? "[]",
    ) as Array<{ u: string; d: string }>;
    expect(pending.map((e) => e.d)).toContain(pcDeviceDid);
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
});

describe("デバイスラベルのロスター同期（docs/wants/01「ラベルの同期」）", () => {
  /** ロスター JSON（marshalRoster 互換の表示対象部分）を localStorage に置く。 */
  function putRoster(
    userDID: string,
    devices: Array<{ deviceDID: string; label: string }>,
  ): void {
    localStorage.setItem(
      "hvs.deviceRoster",
      JSON.stringify({ userDID, devices, rev: 1, sig: "" }),
    );
  }

  it("listDevices はロスターをラベルの SoT にする（自端末・兄弟端末）", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    const user = await svc.createIdentity("木村");
    const myId = await svc.getCurrentDeviceId();
    // ネットワーク配線あり（ロスターへ書ける）状態を模す
    registerDeviceDirectory({
      setLabel: vi.fn().mockResolvedValue(undefined),
      removeDevice: vi.fn().mockResolvedValue(undefined),
    });
    // この端末のデバイス鍵と兄弟端末を持つロスターを模す
    const devKey = await generateLocalIdentity();
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(devKey.seed));
    const sibling = await generateLocalIdentity();
    putRoster(user.id, [
      { deviceDID: devKey.did, label: "リビングPC" },
      { deviceDID: sibling.did, label: "スマホ" },
    ]);

    const devices = await svc.listDevices();
    const self = devices.find((d) => d.id === myId);
    expect(self?.label).toBe("リビングPC"); // ロスター側ラベルが表示に勝つ
    const sib = devices.find((d) => d.id === sibling.did);
    expect(sib?.fromRoster).toBe(true);
    expect(sib?.label).toBe("スマホ");
  });

  it("スタンドアロン（ディレクトリ未登録）では残存ロスターの旧ラベルよりローカル改名を優先する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    const user = await svc.createIdentity("斎藤");
    const myId = await svc.getCurrentDeviceId();
    const devKey = await generateLocalIdentity();
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(devKey.seed));
    putRoster(user.id, [{ deviceDID: devKey.did, label: "旧名" }]);

    await svc.renameDevice(myId, "新名"); // ロスターへは書けない
    const self = (await svc.listDevices()).find((d) => d.id === myId);
    expect(self?.label).toBe("新名"); // 旧ロスターの「旧名」で隠さない
  });

  it("自端末の改名はデバイス DID に解決してディレクトリへ委譲する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("小林");
    const myId = await svc.getCurrentDeviceId();
    const devKey = await generateLocalIdentity();
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(devKey.seed));
    const setLabel = vi.fn().mockResolvedValue(undefined);
    registerDeviceDirectory({
      setLabel,
      removeDevice: vi.fn().mockResolvedValue(undefined),
    });

    await svc.renameDevice(myId, "  仕事PC ");

    expect(setLabel).toHaveBeenCalledWith(devKey.did, "仕事PC");
    // ローカル登録簿にも反映（スタンドアロン時のフォールバック表示）。
    expect((await svc.listDevices()).find((d) => d.id === myId)?.label).toBe(
      "仕事PC",
    );
  });

  it("ロスター行（兄弟端末）の改名は DID をそのままディレクトリへ渡す", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("加藤");
    const sibling = await generateLocalIdentity();
    const setLabel = vi.fn().mockResolvedValue(undefined);
    registerDeviceDirectory({
      setLabel,
      removeDevice: vi.fn().mockResolvedValue(undefined),
    });

    await svc.renameDevice(sibling.did, "倉庫タブレット");

    expect(setLabel).toHaveBeenCalledWith(sibling.did, "倉庫タブレット");
  });

  it("ディレクトリ未登録（スタンドアロン）ならローカル改名のみで例外を出さない", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("吉田");
    const myId = await svc.getCurrentDeviceId();
    await svc.renameDevice(myId, "自宅PC");
    expect((await svc.listDevices()).find((d) => d.id === myId)?.label).toBe(
      "自宅PC",
    );
  });

  it("ロスター行（兄弟端末 DID）の削除はディレクトリの失効へ委譲する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("中村");
    const sibling = await generateLocalIdentity();
    const removeDevice = vi.fn().mockResolvedValue(undefined);
    registerDeviceDirectory({
      setLabel: vi.fn().mockResolvedValue(undefined),
      removeDevice,
    });

    await svc.removeDevice(sibling.did);

    expect(removeDevice).toHaveBeenCalledWith(sibling.did);
  });

  it("ディレクトリ未登録（スタンドアロン）ではロスター行の削除を拒否する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("井上");
    const sibling = await generateLocalIdentity();
    await expect(svc.removeDevice(sibling.did)).rejects.toThrow();
  });

  it("自デバイス DID の削除は拒否する（ロスター行に自分は出ない前提の二重防御）", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("原");
    const devKey = await generateLocalIdentity();
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(devKey.seed));
    registerDeviceDirectory({
      setLabel: vi.fn().mockResolvedValue(undefined),
      removeDevice: vi.fn().mockResolvedValue(undefined),
    });
    await expect(svc.removeDevice(devKey.did)).rejects.toThrow();
  });

  it("ディレクトリの失敗はローカル改名を巻き戻さない（次回接続で収束）", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("山口");
    const myId = await svc.getCurrentDeviceId();
    const devKey = await generateLocalIdentity();
    localStorage.setItem("hvs.deviceKeySeed", seedToBase64(devKey.seed));
    registerDeviceDirectory({
      setLabel: vi.fn().mockRejectedValue(new Error("offline")),
      removeDevice: vi.fn().mockResolvedValue(undefined),
    });

    await expect(svc.renameDevice(myId, "外出用")).resolves.toBeUndefined();
    expect((await svc.listDevices()).find((d) => d.id === myId)?.label).toBe(
      "外出用",
    );
  });
});
