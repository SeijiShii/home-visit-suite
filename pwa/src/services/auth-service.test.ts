// AuthService の移植テスト。
// 参照実装のテスト: shared/service/auth_impl_test.go

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "../data/inmemory/inmemory-user-repository";
import type { User } from "../domain/models/user";
import { AuthServiceImpl } from "./auth-service";
import { isCode } from "./errors";
import { ADMIN, EDITOR, MEMBER1, MEMBER2 } from "./test-fixture";

function user(id: string, role: User["role"]): User {
  return { id, name: id, role, tagIds: [], joinedAt: "2026-01-01T00:00:00Z" };
}

let repo: InMemoryUserRepository;
let svc: AuthServiceImpl;

beforeEach(async () => {
  repo = new InMemoryUserRepository();
  svc = new AuthServiceImpl(repo);
  for (const u of [
    user(ADMIN, "admin"),
    user(EDITOR, "editor"),
    user(MEMBER1, "member"),
    user(MEMBER2, "member"),
  ]) {
    await repo.saveUser(u);
  }
});

describe("canPerform", () => {
  it("操作ごとの最低ロールで判定する", () => {
    expect(svc.canPerform("admin", "manage_users")).toBe(true);
    expect(svc.canPerform("editor", "manage_users")).toBe(false);
    expect(svc.canPerform("editor", "edit_areas")).toBe(true);
    expect(svc.canPerform("member", "edit_areas")).toBe(false);
    expect(svc.canPerform("member", "checkout")).toBe(true);
    expect(svc.canPerform("member", "visit")).toBe(true);
  });

  it("未定義の操作は常に false", () => {
    expect(svc.canPerform("admin", "unknown_action")).toBe(false);
  });
});

describe("updateMember", () => {
  it("admin は他メンバーの表示名とロールを直接変更できる（昇格・降格とも即時）", async () => {
    await svc.updateMember(ADMIN, MEMBER1, {
      name: "新しい名前",
      role: "editor",
    });
    const after = await repo.getUser(MEMBER1);
    expect(after?.name).toBe("新しい名前");
    expect(after?.role).toBe("editor");

    // 降格も即時（受理フローなし）。
    await svc.updateMember(ADMIN, EDITOR, { role: "member" });
    expect((await repo.getUser(EDITOR))?.role).toBe("member");
  });

  it("admin 以外は変更できない", async () => {
    await expect(
      svc.updateMember(EDITOR, MEMBER1, { name: "x" }),
    ).rejects.toSatisfy((e) => isCode(e, "permission_denied"));
  });

  it("自分自身のロールは変更できない（管理者0人防止）", async () => {
    await expect(
      svc.updateMember(ADMIN, ADMIN, { role: "member" }),
    ).rejects.toSatisfy((e) => isCode(e, "self_dismissal"));
  });

  it("自分自身の表示名は変更できる", async () => {
    await svc.updateMember(ADMIN, ADMIN, { name: "改名した管理者" });
    expect((await repo.getUser(ADMIN))?.name).toBe("改名した管理者");
  });

  it("同値ロールの指定は自分に対しても許容する（no-op）", async () => {
    await svc.updateMember(ADMIN, ADMIN, { name: "n", role: "admin" });
    expect((await repo.getUser(ADMIN))?.role).toBe("admin");
  });

  it("空の表示名は拒否する", async () => {
    await expect(
      svc.updateMember(ADMIN, MEMBER1, { name: "   " }),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_input"));
  });

  it("admin が 2 名いれば一方を降格できる", async () => {
    await repo.saveUser(user("did:test:admin2", "admin"));
    await svc.updateMember(ADMIN, "did:test:admin2", { role: "member" });
    expect((await repo.getUser("did:test:admin2"))?.role).toBe("member");
  });

  it("存在しない対象は not_found", async () => {
    await expect(
      svc.updateMember(ADMIN, "did:test:nobody", { name: "x" }),
    ).rejects.toSatisfy((e) => isCode(e, "not_found"));
  });

  // 最後の管理者の降格ガード（last_admin）は、通常フローでは自己ロール変更
  // チェックが先に働くため到達しない防御的ガード（actor が admin である以上、
  // 別の admin を降格しても管理者は 1 名以上残る）。Go 参照実装と同様に残置。
});

describe("removeMember", () => {
  it("admin のみメンバー削除できる", async () => {
    await expect(svc.removeMember(EDITOR, MEMBER1)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
    await svc.removeMember(ADMIN, MEMBER1);
    expect(await repo.getUser(MEMBER1)).toBeNull();
  });

  it("自分自身は削除できない（自己罷免不可）", async () => {
    await expect(svc.removeMember(ADMIN, ADMIN)).rejects.toSatisfy((e) =>
      isCode(e, "self_dismissal"),
    );
    expect(await repo.getUser(ADMIN)).not.toBeNull();
  });
});
