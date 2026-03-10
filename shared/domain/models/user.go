package models

// Role はLinkSelfグループ内のロールを表す。
// 上位互換: Admin > Editor > Member
type Role string

const (
	RoleAdmin  Role = "admin"  // 管理者スタッフ
	RoleEditor Role = "editor" // 編集スタッフ
	RoleMember Role = "member" // 活動スタッフ
)

// User はシステム利用者を表す。
type User struct {
	ID   string `json:"id"`   // LinkSelf DID
	Name string `json:"name"` // 表示名
	Role Role   `json:"role"`
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
