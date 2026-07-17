// 使用許諾・免責事項の同意状態管理のテスト。
// 仕様: docs/wants/01_共通基盤.md「使用許諾と免責事項」

import { beforeEach, describe, expect, it } from "vitest";
import {
  TERMS_ACCEPTED_KEY,
  TERMS_VERSION,
  acceptTerms,
  isTermsAccepted,
} from "./terms";

describe("terms", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("初期状態では未同意", () => {
    expect(isTermsAccepted()).toBe(false);
  });

  it("acceptTerms で現行バージョンに同意した状態になる", () => {
    acceptTerms();
    expect(isTermsAccepted()).toBe(true);
    expect(localStorage.getItem(TERMS_ACCEPTED_KEY)).toBe(TERMS_VERSION);
  });

  it("旧バージョンへの同意は現行では未同意扱い（改定時の再同意）", () => {
    localStorage.setItem(TERMS_ACCEPTED_KEY, "2000-01-01");
    expect(isTermsAccepted()).toBe(false);
  });
});
