import { describe, expect, it } from "vitest";
import { roleIsAtLeast, validateTag } from "./user";

describe("roleIsAtLeast", () => {
  it("上位ロールは下位を包含する", () => {
    expect(roleIsAtLeast("admin", "member")).toBe(true);
    expect(roleIsAtLeast("admin", "editor")).toBe(true);
    expect(roleIsAtLeast("editor", "member")).toBe(true);
  });

  it("下位ロールは上位の権限を持たない", () => {
    expect(roleIsAtLeast("member", "editor")).toBe(false);
    expect(roleIsAtLeast("member", "admin")).toBe(false);
    expect(roleIsAtLeast("editor", "admin")).toBe(false);
  });

  it("同位ロールは自分自身以上", () => {
    expect(roleIsAtLeast("member", "member")).toBe(true);
    expect(roleIsAtLeast("admin", "admin")).toBe(true);
  });
});

describe("validateTag", () => {
  it("正常なタグは null を返す", () => {
    expect(validateTag({ id: "t1", name: "Aチーム", color: "#3b82f6" })).toBeNull();
    expect(validateTag({ id: "t2", name: "外国語", color: "" })).toBeNull();
  });

  it("名前が空ならエラー", () => {
    expect(validateTag({ id: "t1", name: "", color: "" })).toMatch(/empty/);
  });

  it("名前が 16 文字を超えたらエラー", () => {
    expect(validateTag({ id: "t1", name: "あ".repeat(17), color: "" })).toMatch(/16/);
    expect(validateTag({ id: "t1", name: "あ".repeat(16), color: "" })).toBeNull();
  });

  it("色形式が不正ならエラー", () => {
    expect(validateTag({ id: "t1", name: "x", color: "red" })).toMatch(/hex/);
    expect(validateTag({ id: "t1", name: "x", color: "#fff" })).toMatch(/hex/);
  });
});
