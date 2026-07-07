// AuthService の移植テスト。
// 参照実装のテスト: shared/service/auth_impl_test.go

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "../data/inmemory/inmemory-user-repository";
import type { User } from "../domain/models/user";
import { AuthServiceImpl } from "./auth-service";
import { isCode } from "./errors";
import { ADMIN, EDITOR, MEMBER1, MEMBER2, NOW } from "./test-fixture";

function user(id: string, role: User["role"]): User {
  return { id, name: id, role, tagIds: [], joinedAt: "2026-01-01T00:00:00Z" };
}

let repo: InMemoryUserRepository;
let svc: AuthServiceImpl;

beforeEach(async () => {
  repo = new InMemoryUserRepository();
  svc = new AuthServiceImpl(repo, () => NOW);
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

describe("inviteToRole / acceptInvitation", () => {
  it("editor+ が招待し、被招待者が受理するとロールが変わる", async () => {
    const inv = await svc.inviteToRole(EDITOR, MEMBER1, "editor");
    expect(inv.status).toBe("pending");
    expect(inv.type).toBe("role_promote");

    await svc.acceptInvitation(MEMBER1, inv.id);

    expect((await repo.getUser(MEMBER1))?.role).toBe("editor");
    const after = await repo.getInvitation(inv.id);
    expect(after?.status).toBe("accepted");
    expect(after?.resolvedAt).toBe(NOW.toISOString());
  });

  it("member は招待を発行できない", async () => {
    await expect(
      svc.inviteToRole(MEMBER1, MEMBER2, "editor"),
    ).rejects.toSatisfy((e) => isCode(e, "permission_denied"));
  });

  it("被招待者以外は受理できない", async () => {
    const inv = await svc.inviteToRole(ADMIN, MEMBER1, "editor");
    await expect(svc.acceptInvitation(MEMBER2, inv.id)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
  });

  it("pending でない招待は受理できない", async () => {
    const inv = await svc.inviteToRole(ADMIN, MEMBER1, "editor");
    await svc.acceptInvitation(MEMBER1, inv.id);
    await expect(svc.acceptInvitation(MEMBER1, inv.id)).rejects.toSatisfy((e) =>
      isCode(e, "invalid_state"),
    );
  });
});

describe("dismissRole", () => {
  it("admin は降格でき、自己罷免は不可", async () => {
    await svc.dismissRole(ADMIN, EDITOR, "member");
    expect((await repo.getUser(EDITOR))?.role).toBe("member");

    await expect(svc.dismissRole(ADMIN, ADMIN, "member")).rejects.toSatisfy(
      (e) => isCode(e, "self_dismissal"),
    );
  });

  it("admin 以外は降格不可", async () => {
    await expect(svc.dismissRole(EDITOR, MEMBER1, "member")).rejects.toSatisfy(
      (e) => isCode(e, "permission_denied"),
    );
  });

  it("admin が 2 名いれば一方を罷免できる", async () => {
    await repo.saveUser(user("did:test:admin2", "admin"));
    await svc.dismissRole(ADMIN, "did:test:admin2", "member");
    expect((await repo.getUser("did:test:admin2"))?.role).toBe("member");
  });

  // 最後の管理者の罷免ガード（last_admin）は、通常フローでは
  // 自己罷免チェックが先に働くため到達しない防御的ガード（Go 参照実装と同様）。
  // 到達可能な唯一の異常系（actor がユーザー一覧に存在しない admin）は
  // getUser の not_found が先に発生するため、直接のユニットテストは置かない。
});

describe("removeMember", () => {
  it("admin のみメンバー削除できる", async () => {
    await expect(svc.removeMember(EDITOR, MEMBER1)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
    await svc.removeMember(ADMIN, MEMBER1);
    expect(await repo.getUser(MEMBER1)).toBeNull();
  });
});
