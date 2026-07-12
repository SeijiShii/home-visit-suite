// LocalIdentityService: 初回作成・永続・端末ペアリング（同一 DID コピー）の検証。

import { beforeEach, describe, expect, it } from "vitest";
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
  it("既存端末の QR を新端末が取り込むと同一 DID・同一ロールになる", async () => {
    // 既存端末（PC）
    const pc = new LocalIdentityService(new InMemoryUserRepository());
    const pcUser = await pc.createIdentity("佐藤");
    const { text } = await pc.createPairingToken();

    // 新端末（スマホ）: 別 localStorage を模すため一旦クリア
    localStorage.clear();
    const phoneRepo = new InMemoryUserRepository();
    const phone = new LocalIdentityService(phoneRepo);
    expect(await phone.hasIdentity()).toBe(false);

    const phoneUser = await phone.completePairing(text);
    expect(phoneUser.id).toBe(pcUser.id); // 同一 DID
    expect(phoneUser.role).toBe("admin");
    expect(phoneUser.name).toBe("佐藤");
    expect(await phone.hasIdentity()).toBe(true);
    expect(await phoneRepo.getUser(pcUser.id)).not.toBeNull();
  });

  it("壊れた QR テキストは拒否する", async () => {
    const svc = new LocalIdentityService(new InMemoryUserRepository());
    await svc.createIdentity("鈴木");
    await expect(svc.completePairing("garbage")).rejects.toThrow();
  });
});
