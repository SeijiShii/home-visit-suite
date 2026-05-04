package models

// AccessMode は訪問記録画面における編集可否を表す。
// 仕様 docs/wants/05_チェックアウト.md「アクセスモード（読み取り／編集の二層モデル）」
type AccessMode string

const (
	AccessModeEditable AccessMode = "editable"
	AccessModeReadOnly AccessMode = "read_only"
)

// Combine は二つのアクセスモードを合成（親子関係: より制限的な側が勝つ）して返す。
// 仕様の親子関係表に従う：いずれか一方が read_only なら結果は read_only。
// 区域レベル ∩ 場所レベルの「有効モード」を求めるときに使う。
func (a AccessMode) Combine(other AccessMode) AccessMode {
	if a == AccessModeReadOnly || other == AccessModeReadOnly {
		return AccessModeReadOnly
	}
	return AccessModeEditable
}
