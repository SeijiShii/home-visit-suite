// アクセスモード（読み取り／編集の二層モデル）。
// 仕様: docs/wants/05_チェックアウト.md「アクセスモード（読み取り／編集の二層モデル）」
// 参照実装: shared/domain/models/access.go

/** 訪問記録画面における編集可否。 */
export type AccessMode = "editable" | "read_only";

/**
 * 二つのアクセスモードを合成（親子関係: より制限的な側が勝つ）して返す。
 * いずれか一方が read_only なら結果は read_only。
 * 区域レベル ∩ 場所レベルの「有効モード」を求めるときに使う。
 */
export function combineAccessModes(a: AccessMode, b: AccessMode): AccessMode {
  if (a === "read_only" || b === "read_only") {
    return "read_only";
  }
  return "editable";
}
