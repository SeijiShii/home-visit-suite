// CheckoutService の移植テスト。
// 参照実装のテスト: shared/service/checkout_impl_test.go

import { beforeEach, describe, expect, it } from "vitest";
import { isCode } from "./errors";
import {
  ADMIN,
  EDITOR,
  MEMBER1,
  MEMBER2,
  NOW,
  type Fixture,
  makeFixture,
} from "./test-fixture";

let fx: Fixture;

beforeEach(async () => {
  fx = await makeFixture();
});

describe("checkout", () => {
  it("活動メンバーは自分を担当者にしてチェックアウトできる", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    expect(c.status).toBe("active");
    expect(c.personInChargeId).toBe(MEMBER1);
    expect(c.checkedOutById).toBe(MEMBER1);
    expect(c.availablePeriodId).toBe("ap-active");
  });

  it("personInChargeId 省略（空文字）は自分が担当者になる", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", "");
    expect(c.personInChargeId).toBe(MEMBER1);
  });

  it("活動メンバーは他人を担当者にできない", async () => {
    await expect(fx.coSvc.checkout(MEMBER1, "a1", MEMBER2)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
  });

  it("編集メンバーは他人を担当者にできる", async () => {
    const c = await fx.coSvc.checkout(EDITOR, "a1", MEMBER1);
    expect(c.personInChargeId).toBe(MEMBER1);
    expect(c.checkedOutById).toBe(EDITOR);
  });

  it("アクティブな期間がなければ発行不可（クールダウン）", async () => {
    await fx.covRepo.deleteAvailablePeriod("ap-active");
    await expect(fx.coSvc.checkout(EDITOR, "a1", EDITOR)).rejects.toSatisfy((e) =>
      isCode(e, "invalid_state"),
    );
  });

  it("期間の対象外親番の区域は編集メンバーもバイパス不可", async () => {
    // a3 は pa2 配下で、期間の対象は pa1 のみ
    await expect(fx.coSvc.checkout(EDITOR, "a3", EDITOR)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
  });

  it("同一区域の排他的チェックアウト", async () => {
    await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await expect(fx.coSvc.checkout(MEMBER2, "a1", MEMBER2)).rejects.toSatisfy((e) =>
      isCode(e, "exclusive_checkout"),
    );
  });

  it("存在しない区域はエラー", async () => {
    await expect(fx.coSvc.checkout(MEMBER1, "nope", MEMBER1)).rejects.toSatisfy((e) =>
      isCode(e, "not_found"),
    );
  });
});

describe("return / forceReturn", () => {
  it("返却でステータスが returned になり招待が連動失効する", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await fx.coSvc.invite(MEMBER1, c.id, MEMBER2, 0);

    await fx.coSvc.return(MEMBER1, c.id);

    const after = await fx.coRepo.getCheckout(c.id);
    expect(after?.status).toBe("returned");
    expect(after?.returnedAt).not.toBeNull();

    const invs = await fx.coSvc.listInvitations(c.id);
    expect(invs).toHaveLength(1);
    expect(invs[0].revokedAt).not.toBeNull();
  });

  it("active でないチェックアウトは返却不可", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await fx.coSvc.return(MEMBER1, c.id);
    await expect(fx.coSvc.return(MEMBER1, c.id)).rejects.toSatisfy((e) =>
      isCode(e, "invalid_state"),
    );
  });

  it("強制回収は editor+ のみ", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await expect(fx.coSvc.forceReturn(MEMBER2, c.id)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
    await fx.coSvc.forceReturn(EDITOR, c.id);
    expect((await fx.coRepo.getCheckout(c.id))?.status).toBe("returned");
  });
});

describe("reassignPersonInCharge", () => {
  it("editor+ は担当者を変更でき、checkedOutById と招待は維持される", async () => {
    const c = await fx.coSvc.checkout(EDITOR, "a1", MEMBER1);
    await fx.coSvc.invite(EDITOR, c.id, MEMBER2, 0);

    await fx.coSvc.reassignPersonInCharge(ADMIN, c.id, MEMBER2);

    const after = await fx.coRepo.getCheckout(c.id);
    expect(after?.personInChargeId).toBe(MEMBER2);
    expect(after?.checkedOutById).toBe(EDITOR);
    const invs = await fx.coSvc.listInvitations(c.id);
    expect(invs[0].revokedAt).toBeNull();
  });

  it("member は担当者変更不可", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await expect(
      fx.coSvc.reassignPersonInCharge(MEMBER1, c.id, MEMBER2),
    ).rejects.toSatisfy((e) => isCode(e, "permission_denied"));
  });

  it("同一担当者への再任命は冪等な成功", async () => {
    const c = await fx.coSvc.checkout(EDITOR, "a1", MEMBER1);
    await expect(
      fx.coSvc.reassignPersonInCharge(EDITOR, c.id, MEMBER1),
    ).resolves.toBeUndefined();
  });

  it("存在しない新担当者はエラー", async () => {
    const c = await fx.coSvc.checkout(EDITOR, "a1", MEMBER1);
    await expect(
      fx.coSvc.reassignPersonInCharge(EDITOR, c.id, "did:test:nobody"),
    ).rejects.toSatisfy((e) => isCode(e, "not_found"));
  });
});

describe("recordVisit", () => {
  it("通常の訪問記録を保存できる", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    const vr = await fx.coSvc.recordVisit(
      MEMBER1,
      c.id,
      "place-1",
      "met",
      NOW.toISOString(),
      "",
    );
    expect(vr.areaId).toBe("a1");
    expect(vr.checkoutId).toBe(c.id);
    expect(vr.appliedRequestId).toBeNull();
  });

  it("申請を伴うステータスはテキスト必須で Request が同時作成される", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);

    await expect(
      fx.coSvc.recordVisit(MEMBER1, c.id, "place-1", "vacant_abandoned", NOW.toISOString(), ""),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_input"));

    const vr = await fx.coSvc.recordVisit(
      MEMBER1,
      c.id,
      "place-1",
      "refused",
      NOW.toISOString(),
      "訪問を望まないとのこと",
    );
    expect(vr.appliedRequestId).not.toBeNull();
    const req = await fx.notifRepo.getRequest(vr.appliedRequestId!);
    expect(req?.type).toBe("do_not_visit");
    expect(req?.status).toBe("pending");
    expect(req?.submitterId).toBe(MEMBER1);
  });

  it("active でないチェックアウトには記録できない", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await fx.coSvc.return(MEMBER1, c.id);
    await expect(
      fx.coSvc.recordVisit(MEMBER1, c.id, "place-1", "met", NOW.toISOString(), ""),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_state"));
  });

  it("recordVisitAdHoc は areaID 必須・チェックアウト不要（Phase 1 暫定）", async () => {
    await expect(
      fx.coSvc.recordVisitAdHoc(MEMBER1, "", "place-1", "met", NOW.toISOString(), ""),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_input"));

    const vr = await fx.coSvc.recordVisitAdHoc(
      MEMBER1,
      "a1",
      "place-1",
      "vacant_abandoned",
      NOW.toISOString(),
      "更地になっていた",
    );
    expect(vr.checkoutId).toBe("");
    const req = await fx.notifRepo.getRequest(vr.appliedRequestId!);
    expect(req?.type).toBe("map_update");
  });
});

describe("invite / revokeInvite", () => {
  it("担当者は member を招待でき、デフォルト TTL は 24 時間、通知が飛ぶ", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    const inv = await fx.coSvc.invite(MEMBER1, c.id, MEMBER2, 0);

    expect(new Date(inv.expiresAt).getTime()).toBe(NOW.getTime() + 24 * 60 * 60 * 1000);

    const notifs = await fx.notifRepo.listNotifications(MEMBER2);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("area_invite");
    expect(notifs[0].referenceId).toBe(inv.id);
  });

  it("担当者でも editor+ でもない者は招待不可", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await expect(fx.coSvc.invite(MEMBER2, c.id, MEMBER2, 0)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
  });

  it("担当者本人・editor は招待対象にできない", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await expect(fx.coSvc.invite(MEMBER1, c.id, MEMBER1, 0)).rejects.toSatisfy((e) =>
      isCode(e, "invalid_input"),
    );
    await expect(fx.coSvc.invite(MEMBER1, c.id, EDITOR, 0)).rejects.toSatisfy((e) =>
      isCode(e, "invalid_input"),
    );
  });

  it("負の TTL はエラー", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await expect(fx.coSvc.invite(MEMBER1, c.id, MEMBER2, -1)).rejects.toSatisfy((e) =>
      isCode(e, "invalid_input"),
    );
  });

  it("既存の有効招待は期限を上書き延長し重複レコードを作らない", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    const first = await fx.coSvc.invite(MEMBER1, c.id, MEMBER2, 60 * 60 * 1000);
    const second = await fx.coSvc.invite(MEMBER1, c.id, MEMBER2, 48 * 60 * 60 * 1000);

    expect(second.id).toBe(first.id);
    expect(new Date(second.expiresAt).getTime()).toBe(
      NOW.getTime() + 48 * 60 * 60 * 1000,
    );
    expect(await fx.coSvc.listInvitations(c.id)).toHaveLength(1);
  });

  it("取消は招待者本人・担当者・editor+ が可能で二重取消はエラー", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    const inv = await fx.coSvc.invite(MEMBER1, c.id, MEMBER2, 0);

    // 被招待者本人（member2）は取消権限を持たない
    await expect(fx.coSvc.revokeInvite(MEMBER2, inv.id)).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );

    await fx.coSvc.revokeInvite(EDITOR, inv.id);
    await expect(fx.coSvc.revokeInvite(EDITOR, inv.id)).rejects.toSatisfy((e) =>
      isCode(e, "invalid_state"),
    );
  });
});

describe("areaAccessMode / listAccessibleAreas", () => {
  it("担当者は editable、無関係者は read_only", async () => {
    await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    expect(await fx.coSvc.areaAccessMode(MEMBER1, "a1")).toBe("editable");
    expect(await fx.coSvc.areaAccessMode(MEMBER2, "a1")).toBe("read_only");
    expect(await fx.coSvc.areaAccessMode(EDITOR, "a1")).toBe("read_only");
  });

  it("有効な招待保有者は editable、返却後は read_only に戻る", async () => {
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await fx.coSvc.invite(MEMBER1, c.id, MEMBER2, 0);
    expect(await fx.coSvc.areaAccessMode(MEMBER2, "a1")).toBe("editable");

    await fx.coSvc.return(MEMBER1, c.id);
    expect(await fx.coSvc.areaAccessMode(MEMBER2, "a1")).toBe("read_only");
  });

  it("placeAccessMode は現フェーズでは常に editable", async () => {
    expect(await fx.coSvc.placeAccessMode(MEMBER1, "place-1")).toBe("editable");
  });

  it("listAccessibleAreas は担当区域と被招待区域を返す", async () => {
    const own = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    const other = await fx.coSvc.checkout(MEMBER2, "a2", MEMBER2);
    await fx.coSvc.invite(MEMBER2, other.id, MEMBER1, 0);

    const areas = await fx.coSvc.listAccessibleAreas(MEMBER1);
    expect(areas).toHaveLength(2);

    const asOwner = areas.find((a) => a.role === "person_in_charge");
    expect(asOwner?.areaId).toBe("a1");
    expect(asOwner?.checkoutId).toBe(own.id);
    expect(asOwner?.inviteExpiresAt).toBeNull();

    const asInvitee = areas.find((a) => a.role === "invitee");
    expect(asInvitee?.areaId).toBe("a2");
    expect(asInvitee?.inviteExpiresAt).not.toBeNull();
  });
});
