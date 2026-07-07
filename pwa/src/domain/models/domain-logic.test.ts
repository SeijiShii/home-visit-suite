// 小さなロジック関数（access / region / checkout-invitation / visit）のテスト。
// 参照実装のテスト: shared/domain/models/*_test.go

import { describe, expect, it } from "vitest";
import { combineAccessModes } from "./access";
import {
  type CheckoutInvitation,
  DEFAULT_CHECKOUT_INVITE_TTL_MS,
  checkoutInvitationIsActive,
} from "./checkout-invitation";
import { areaDisplayLabel, areaIdentifier } from "./region";
import { visitResultRequiresApplication } from "./visit";

describe("combineAccessModes", () => {
  it("より制限的な側が勝つ（read_only が優先）", () => {
    expect(combineAccessModes("editable", "editable")).toBe("editable");
    expect(combineAccessModes("editable", "read_only")).toBe("read_only");
    expect(combineAccessModes("read_only", "editable")).toBe("read_only");
    expect(combineAccessModes("read_only", "read_only")).toBe("read_only");
  });
});

describe("areaIdentifier / areaDisplayLabel", () => {
  it("領域-区域親番-区域 形式で組み立てる", () => {
    expect(areaIdentifier("NRT", "001", "05")).toBe("NRT-001-05");
  });

  it("表示ラベルは識別子 + 区域親番名", () => {
    expect(areaDisplayLabel("NRT", "001", "05", "加良部1丁目")).toBe(
      "NRT-001-05 加良部1丁目",
    );
  });
});

describe("checkoutInvitationIsActive", () => {
  function invitation(overrides: Partial<CheckoutInvitation> = {}): CheckoutInvitation {
    return {
      id: "i1",
      checkoutId: "c1",
      inviteeId: "did:example:invitee",
      inviterId: "did:example:inviter",
      expiresAt: "2026-07-08T00:00:00Z",
      revokedAt: null,
      createdAt: "2026-07-07T00:00:00Z",
      ...overrides,
    };
  }

  it("期限内かつ未取消なら有効", () => {
    expect(checkoutInvitationIsActive(invitation(), new Date("2026-07-07T12:00:00Z"))).toBe(
      true,
    );
  });

  it("期限ちょうど・期限後は無効", () => {
    expect(checkoutInvitationIsActive(invitation(), new Date("2026-07-08T00:00:00Z"))).toBe(
      false,
    );
    expect(checkoutInvitationIsActive(invitation(), new Date("2026-07-09T00:00:00Z"))).toBe(
      false,
    );
  });

  it("取り消し済みは期限内でも無効", () => {
    const inv = invitation({ revokedAt: "2026-07-07T06:00:00Z" });
    expect(checkoutInvitationIsActive(inv, new Date("2026-07-07T12:00:00Z"))).toBe(false);
  });

  it("デフォルト TTL は 24 時間", () => {
    expect(DEFAULT_CHECKOUT_INVITE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("visitResultRequiresApplication", () => {
  it("廃屋・更地と訪問拒否は申請を伴う", () => {
    expect(visitResultRequiresApplication("vacant_abandoned")).toBe(true);
    expect(visitResultRequiresApplication("refused")).toBe(true);
  });

  it("それ以外は申請を伴わない", () => {
    expect(visitResultRequiresApplication("met")).toBe(false);
    expect(visitResultRequiresApplication("absent")).toBe(false);
    expect(visitResultRequiresApplication("vacant_possible")).toBe(false);
  });
});
