package linkself

// AccessPolicy はテーブルのアクセス制御をアプリ層で実装するインターフェース。
type AccessPolicy interface {
	// CanRead は指定テーブルの読み取り権限を判定する。
	CanRead(did string, table string) bool

	// CanWrite は指定テーブルへの書き込み権限を判定する。
	CanWrite(did string, table string) bool
}

// SchemaValidator はレコードのバリデーションをアプリ層で実装するインターフェース。
type SchemaValidator interface {
	// Validate はレコードのBodyが有効かを検証する。
	Validate(table string, body []byte) error
}

// RoleBasedAccessPolicy はロールベースのアクセス制御実装。
type RoleBasedAccessPolicy struct {
	// GetRole は指定DIDのロールを返す関数。
	GetRole func(did string) string
}

// CanRead は全メンバーが全テーブルを読み取り可能。
func (p *RoleBasedAccessPolicy) CanRead(did string, table string) bool {
	return true
}

// CanWrite はテーブルごとの書き込み権限をロールで判定する。
func (p *RoleBasedAccessPolicy) CanWrite(did string, table string) bool {
	role := p.GetRole(did)

	switch table {
	// admin only
	case TableRegions, TableUsers, TableOrgGroups:
		return role == "admin"

	// editor+ (admin or editor)
	case TableParentAreas, TableAreas, TablePlaces,
		TableMapNetwork,
		TableMemberTags,
		TableActivityAssignments, TableVisitRecordEdits,
		TableCoverages, TableSchedulePeriods, TableScopes, TableAreaAvailability:
		return role == "admin" || role == "editor"

	// all members
	case TableTeams, TableActivities, TableVisitRecords, TableRequests:
		return role == "admin" || role == "editor" || role == "member"

	// editor+
	case TableInvitations:
		return role == "admin" || role == "editor"

	// system only (audit, notifications): app layer writes
	case TableAuditLog, TableNotifications:
		return false

	// personal tables: owner only (handled by ScopeDevice)
	case TablePersonalNotes, TablePersonalTags, TablePersonalTagAssignments:
		return true

	default:
		return false
	}
}
