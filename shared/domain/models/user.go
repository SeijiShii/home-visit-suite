package models

import "time"

// Role はLinkSelfグループ内のロールを表す。
// 上位互換: Admin > Editor > Member
type Role string

const (
	RoleAdmin  Role = "admin"  // 管理者スタッフ
	RoleEditor Role = "editor" // 編集スタッフ
	RoleMember Role = "member" // 活動スタッフ
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
type User struct {
	ID         string    `json:"id"`         // LinkSelf DID
	Name       string    `json:"name"`       // 表示名
	Role       Role      `json:"role"`
	OrgGroupID string    `json:"orgGroupId"` // 組織グループ（排他的所属、未所属は空文字）
	TagIDs     []string  `json:"tagIds"`     // メンバータグIDリスト
	JoinedAt   time.Time `json:"joinedAt"`   // 参加日時
}

// Group は管理者が作成するメンバーグループを表す。
// メンバーは排他的に1つのグループにのみ所属する。
type Group struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Tag は編集スタッフがメンバーに付与するタグ。
type Tag struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
