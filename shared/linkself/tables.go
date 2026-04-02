package linkself

// テーブル名定数。旧channels.goのチャネル定義を置き換える。
// MyDB + SetSyncScope により同期制御を行う。
const (
	// マスターデータ（ScopeNetwork）
	TableRegions     = "regions"
	TableParentAreas = "parent_areas"
	TableAreas       = "areas"
	TablePlaces      = "places"

	// 地図（ScopeNetwork）
	TableMapNetwork = "map_network"

	// メンバー（ScopeNetwork）
	TableUsers      = "users"
	TableOrgGroups  = "org_groups"
	TableMemberTags = "member_tags"

	// 訪問活動（ScopeNetwork）
	TableTeams               = "teams"
	TableActivities          = "activities"
	TableActivityAssignments = "activity_assignments"
	TableVisitRecords        = "visit_records"
	TableVisitRecordEdits    = "visit_record_edits"

	// 網羅管理（ScopeNetwork）
	TableCoverages        = "coverages"
	TableSchedulePeriods  = "schedule_periods"
	TableScopes           = "scopes"
	TableAreaAvailability = "area_availability"

	// 申請・通知（ScopeNetwork）
	TableRequests      = "requests"
	TableInvitations   = "invitations"
	TableNotifications = "notifications"

	// 監査（ScopeNetwork）
	TableAuditLog = "audit_log"

	// 個人データ（ScopeDevice — 自デバイス間のみ同期）
	TablePersonalNotes          = "personal_notes"
	TablePersonalTags           = "personal_tags"
	TablePersonalTagAssignments = "personal_tag_assignments"
)

// NetworkTables はScopeNetworkで同期するテーブル一覧。
var NetworkTables = []string{
	TableRegions, TableParentAreas, TableAreas, TablePlaces,
	TableMapNetwork,
	TableUsers, TableOrgGroups, TableMemberTags,
	TableTeams, TableActivities, TableActivityAssignments,
	TableVisitRecords, TableVisitRecordEdits,
	TableCoverages, TableSchedulePeriods, TableScopes, TableAreaAvailability,
	TableRequests, TableInvitations, TableNotifications,
	TableAuditLog,
}

// DeviceTables はScopeDeviceで同期するテーブル一覧。
var DeviceTables = []string{
	TablePersonalNotes, TablePersonalTags, TablePersonalTagAssignments,
}
