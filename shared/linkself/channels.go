package linkself

import "time"

// Channel はGroupShareのチャネル定義。
type Channel struct {
	Name      string        // チャネル名
	Retention time.Duration // 保持期間（0=永続）
}

// GroupShareチャネル定義。
// topicはデータモデル設計書に基づく（例: regionId, areaId, targetDID）。
var (
	// --- 領域・区域・場所（マスターデータ、永続） ---
	ChannelRegions    = Channel{Name: "regions", Retention: 0}
	ChannelParentAreas = Channel{Name: "parent_areas", Retention: 0}
	ChannelAreas      = Channel{Name: "areas", Retention: 0}
	ChannelPlaces     = Channel{Name: "places", Retention: 0}

	// --- ポリゴン（同時編集対応、永続） ---
	ChannelMapVertices = Channel{Name: "map_vertices", Retention: 0}
	ChannelMapEdges    = Channel{Name: "map_edges", Retention: 0}
	ChannelMapPolygons = Channel{Name: "map_polygons", Retention: 0}

	// --- メンバー・組織（マスターデータ、永続） ---
	ChannelUsers      = Channel{Name: "users", Retention: 0}
	ChannelOrgGroups  = Channel{Name: "org_groups", Retention: 0}
	ChannelMemberTags = Channel{Name: "member_tags", Retention: 0}

	// --- 訪問活動（管理者設定の保持期間） ---
	ChannelTeams               = Channel{Name: "teams", Retention: 0}
	ChannelActivities          = Channel{Name: "activities", Retention: 0}
	ChannelActivityAssignments = Channel{Name: "activity_assignments", Retention: 0}
	ChannelVisitRecords        = Channel{Name: "visit_records", Retention: 0}
	ChannelVisitRecordEdits    = Channel{Name: "visit_record_edits", Retention: 0}

	// --- 網羅管理（管理者設定の保持期間） ---
	ChannelCoverages         = Channel{Name: "coverages", Retention: 0}
	ChannelCoveragePlans     = Channel{Name: "coverage_plans", Retention: 0}
	ChannelAreaAvailability  = Channel{Name: "area_availability", Retention: 0}

	// --- 申請・通知（期限付き） ---
	ChannelRequests      = Channel{Name: "requests", Retention: 0}
	ChannelInvitations   = Channel{Name: "invitations", Retention: 90 * 24 * time.Hour}
	ChannelNotifications = Channel{Name: "notifications", Retention: 30 * 24 * time.Hour}

	// --- 監査・設定（永続） ---
	ChannelAuditLog  = Channel{Name: "audit_log", Retention: 0}
	ChannelAppConfig = Channel{Name: "app_config", Retention: 0}
)

// AllChannels は全チャネルの一覧を返す。アプリ起動時のチャネル登録に使用。
func AllChannels() []Channel {
	return []Channel{
		ChannelRegions, ChannelParentAreas, ChannelAreas, ChannelPlaces,
		ChannelMapVertices, ChannelMapEdges, ChannelMapPolygons,
		ChannelUsers, ChannelOrgGroups, ChannelMemberTags,
		ChannelTeams, ChannelActivities, ChannelActivityAssignments,
		ChannelVisitRecords, ChannelVisitRecordEdits,
		ChannelCoverages, ChannelCoveragePlans, ChannelAreaAvailability,
		ChannelRequests, ChannelInvitations, ChannelNotifications,
		ChannelAuditLog, ChannelAppConfig,
	}
}
