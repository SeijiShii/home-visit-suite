// 使用許諾・免責事項の同意状態。
// identity 作成前（オンボーディング前）でも動く必要があるため、LinkSelf 個人設定
// ではなく localStorage 直（デバイススコープ。コンテナごとに同意を取る）。
// 仕様: docs/wants/01_共通基盤.md「使用許諾と免責事項」

/** 現行の文書バージョン。文書を改定したらこの日付を更新する（→次回起動時に再同意）。 */
export const TERMS_VERSION = "2026-07-17";

export const TERMS_ACCEPTED_KEY = "hvs.termsAcceptedVersion";

/** 現行バージョンの文書に同意済みか。旧バージョンへの同意は未同意扱い。 */
export function isTermsAccepted(): boolean {
  try {
    return localStorage.getItem(TERMS_ACCEPTED_KEY) === TERMS_VERSION;
  } catch {
    return false;
  }
}

/**
 * 現行バージョンの文書への同意を記録する。
 * ストレージが使えない環境（全サイトデータブロック等）でも throw せず戻る
 * （同意はそのセッション限りとなり、次回起動時に再度ゲートが出る）。
 */
export function acceptTerms(): void {
  try {
    localStorage.setItem(TERMS_ACCEPTED_KEY, TERMS_VERSION);
  } catch {
    // 永続化できなくても同意フロー自体は進める
  }
}
