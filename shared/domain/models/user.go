package models

import (
	"fmt"
	"regexp"
	"time"
	"unicode/utf8"
)

// Role はLinkSelfグループ内のロールを表す。
// 上位互換: Admin > Editor > Member
type Role string

const (
	RoleAdmin  Role = "admin"  // 管理者
	RoleEditor Role = "editor" // 編集メンバー
	RoleMember Role = "member" // 活動メンバー
)

var roleLevel = map[Role]int{
	RoleAdmin:  3,
	RoleEditor: 2,
	RoleMember: 1,
}

// IsAtLeast は自ロールが required 以上の権限を持つか判定する。
func (r Role) IsAtLeast(required Role) bool {
	return roleLevel[r] >= roleLevel[required]
}

// User はシステム利用者を表す。
//
// メンバーグループ（旧 OrgGroup）概念は 2026-05-06 に廃止された。
// ロール・メンバータグでメンバー分類を表現する（仕様 04_メンバー管理と権限.md）
type User struct {
	ID       string    `json:"id"`       // LinkSelf DID
	Name     string    `json:"name"`     // 表示名
	Role     Role      `json:"role"`
	TagIDs   []string  `json:"tagIds"`   // メンバータグIDリスト
	JoinedAt time.Time `json:"joinedAt"` // 参加日時
}

// TagColorPalette はタグに自動割り当てするプリセット色（8色）。
var TagColorPalette = [8]string{
	"#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
	"#14b8a6", "#eab308", "#6366f1", "#f43f5e",
}

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// Tag は編集メンバーが他のメンバーに付与するタグ。
type Tag struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// Validate はタグの入力値を検証する。
// - Name が空でないこと
// - Name が 16 ルーン以内であること
// - Color が空か、#rrggbb 形式であること
func (t Tag) Validate() error {
	if utf8.RuneCountInString(t.Name) == 0 {
		return fmt.Errorf("tag name must not be empty")
	}
	if utf8.RuneCountInString(t.Name) > 16 {
		return fmt.Errorf("tag name must be 16 characters or fewer (got %d)", utf8.RuneCountInString(t.Name))
	}
	if t.Color != "" && !hexColorRe.MatchString(t.Color) {
		return fmt.Errorf("tag color must be empty or a valid #rrggbb hex color (got %q)", t.Color)
	}
	return nil
}
