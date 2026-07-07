// AvailablePeriodService の移植テスト。
// 参照実装のテスト: shared/service/available_period_impl_test.go

import { beforeEach, describe, expect, it } from "vitest";
import { isCode } from "./errors";
import {
  EDITOR,
  MEMBER1,
  NOW,
  type Fixture,
  makeFixture,
} from "./test-fixture";

let fx: Fixture;

beforeEach(async () => {
  fx = await makeFixture();
});

describe("createPeriod", () => {
  it("editor+ は期間を作成できる", async () => {
    const p = await fx.apSvc.createPeriod(
      EDITOR,
      "8月期間",
      "2026-08-01T00:00:00Z",
      "2026-08-31T23:59:59Z",
      ["pa1"],
      [],
    );
    expect(p.name).toBe("8月期間");
    expect(await fx.covRepo.getAvailablePeriod(p.id)).not.toBeNull();
  });

  it("member は作成不可", async () => {
    await expect(
      fx.apSvc.createPeriod(MEMBER1, "x", "2026-08-01T00:00:00Z", "2026-08-31T00:00:00Z", [], []),
    ).rejects.toSatisfy((e) => isCode(e, "permission_denied"));
  });

  it("既存期間と重複する期間は作成不可（接する境界も重複扱い）", async () => {
    // ap-active は 07-01〜07-31
    await expect(
      fx.apSvc.createPeriod(
        EDITOR,
        "重複",
        "2026-07-15T00:00:00Z",
        "2026-08-15T00:00:00Z",
        [],
        [],
      ),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_input"));

    await expect(
      fx.apSvc.createPeriod(
        EDITOR,
        "境界接触",
        "2026-07-31T23:59:59Z",
        "2026-08-15T00:00:00Z",
        [],
        [],
      ),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_input"));
  });

  it("バリデーション違反（endDate < startDate）はエラー", async () => {
    await expect(
      fx.apSvc.createPeriod(EDITOR, "逆転", "2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z", [], []),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_input"));
  });
});

describe("updatePeriod の段階的ロック", () => {
  it("開始前（pending）は全項目編集可", async () => {
    const p = await fx.apSvc.createPeriod(
      EDITOR,
      "8月期間",
      "2026-08-01T00:00:00Z",
      "2026-08-31T23:59:59Z",
      ["pa1"],
      [],
    );
    const updated = await fx.apSvc.updatePeriod(EDITOR, p.id, {
      name: "8月期間改",
      startDate: "2026-08-05T00:00:00Z",
      parentAreaIds: ["pa2"],
    });
    expect(updated.name).toBe("8月期間改");
    expect(updated.parentAreaIds).toEqual(["pa2"]);
  });

  it("活動中（active）は名前変更・開始日変更・終了日短縮・親番削除が不可", async () => {
    // ap-active は NOW 時点で活動中
    await expect(
      fx.apSvc.updatePeriod(EDITOR, "ap-active", { name: "改名" }),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_state"));

    await expect(
      fx.apSvc.updatePeriod(EDITOR, "ap-active", { startDate: "2026-07-02T00:00:00Z" }),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_state"));

    await expect(
      fx.apSvc.updatePeriod(EDITOR, "ap-active", { endDate: "2026-07-15T00:00:00Z" }),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_state"));

    await expect(
      fx.apSvc.updatePeriod(EDITOR, "ap-active", { parentAreaIds: [] }),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_state"));
  });

  it("活動中でも終了日の延長・親番の追加・タグ変更は可能", async () => {
    const updated = await fx.apSvc.updatePeriod(EDITOR, "ap-active", {
      endDate: "2026-08-15T00:00:00Z",
      parentAreaIds: ["pa1", "pa2"],
      tagIds: ["tag-x"],
    });
    expect(updated.endDate).toBe("2026-08-15T00:00:00Z");
    expect(updated.parentAreaIds).toEqual(["pa1", "pa2"]);
    expect(updated.tagIds).toEqual(["tag-x"]);
  });

  it("終了後（closed）はタグのみ編集可", async () => {
    await fx.covRepo.saveAvailablePeriod({
      id: "ap-past",
      name: "6月期間",
      startDate: "2026-06-01T00:00:00Z",
      endDate: "2026-06-30T23:59:59Z",
      parentAreaIds: ["pa1"],
      tagIds: [],
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    });

    await expect(
      fx.apSvc.updatePeriod(EDITOR, "ap-past", { endDate: "2026-07-05T00:00:00Z" }),
    ).rejects.toSatisfy((e) => isCode(e, "invalid_state"));

    const updated = await fx.apSvc.updatePeriod(EDITOR, "ap-past", { tagIds: ["tag-y"] });
    expect(updated.tagIds).toEqual(["tag-y"]);
  });
});

describe("deletePeriod", () => {
  it("開始前の期間のみ削除できる", async () => {
    const p = await fx.apSvc.createPeriod(
      EDITOR,
      "8月期間",
      "2026-08-01T00:00:00Z",
      "2026-08-31T23:59:59Z",
      [],
      [],
    );
    await fx.apSvc.deletePeriod(EDITOR, p.id);
    expect(await fx.covRepo.getAvailablePeriod(p.id)).toBeNull();

    // 活動中の期間は削除不可
    await expect(fx.apSvc.deletePeriod(EDITOR, "ap-active")).rejects.toSatisfy((e) =>
      isCode(e, "invalid_state"),
    );
  });
});

describe("getActivePeriod", () => {
  it("アクティブ期間を返し、なければ null", async () => {
    expect((await fx.apSvc.getActivePeriod(NOW))?.id).toBe("ap-active");
    expect(await fx.apSvc.getActivePeriod(new Date("2026-09-15T00:00:00Z"))).toBeNull();
  });
});

describe("forceCloseExpiredCheckouts", () => {
  it("期限切れ期間配下の未完了チェックアウトを強制クローズし招待も失効する", async () => {
    // アクティブ期間中にチェックアウト + 招待を作成
    const c = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await fx.coSvc.invite(MEMBER1, c.id, "did:test:member2", 30 * 24 * 60 * 60 * 1000);

    // 期間終了後の時刻で reconcile 実行
    const after = new Date("2026-08-01T00:00:00Z");
    const closed = await fx.apSvc.forceCloseExpiredCheckouts(after);
    expect(closed).toBe(1);

    const co = await fx.coRepo.getCheckout(c.id);
    expect(co?.status).toBe("force_closed");
    expect(co?.forceClosedAt).toBe(after.toISOString());

    const invs = await fx.coRepo.listCheckoutInvitations(c.id);
    expect(invs[0].revokedAt).toBe(after.toISOString());
  });

  it("返却済みチェックアウトや期間内のものは対象外", async () => {
    const c1 = await fx.coSvc.checkout(MEMBER1, "a1", MEMBER1);
    await fx.coSvc.return(MEMBER1, c1.id);

    // 期間はまだアクティブな時刻 → 何もクローズしない
    expect(await fx.apSvc.forceCloseExpiredCheckouts(NOW)).toBe(0);

    // 期間終了後でも returned は対象外
    expect(await fx.apSvc.forceCloseExpiredCheckouts(new Date("2026-08-01T00:00:00Z"))).toBe(0);
  });
});

describe("タグ CRUD", () => {
  it("作成・更新・削除と同名重複の拒否", async () => {
    const tag = await fx.apSvc.createTag(EDITOR, "春", "#3b82f6");
    expect(tag.id).toBeTruthy();

    await expect(fx.apSvc.createTag(EDITOR, "春", "")).rejects.toSatisfy((e) =>
      isCode(e, "invalid_input"),
    );

    const other = await fx.apSvc.createTag(EDITOR, "夏", "");
    await expect(fx.apSvc.updateTag(EDITOR, other.id, "春", "")).rejects.toSatisfy((e) =>
      isCode(e, "invalid_input"),
    );

    const renamed = await fx.apSvc.updateTag(EDITOR, other.id, "秋", "#f97316");
    expect(renamed.name).toBe("秋");

    await fx.apSvc.deleteTag(EDITOR, tag.id);
    expect(await fx.apSvc.listTags()).toHaveLength(1);
  });

  it("member はタグ操作不可", async () => {
    await expect(fx.apSvc.createTag(MEMBER1, "x", "")).rejects.toSatisfy((e) =>
      isCode(e, "permission_denied"),
    );
  });
});
