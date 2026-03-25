package linkself

// AccessPolicy はGroupShareのアクセス制御をアプリ層で実装するインターフェース。
// LinkSelfのgroupshare.AccessPolicyに対応する。
type AccessPolicy interface {
	// CanRead は指定チャネルの読み取り権限を判定する。
	CanRead(did string, channel string) bool

	// CanWrite は指定チャネルへの書き込み権限を判定する。
	CanWrite(did string, channel string) bool
}

// SchemaValidator はGroupShareのレコードバリデーションをアプリ層で実装するインターフェース。
// LinkSelfのgroupshare.SchemaValidatorに対応する。
type SchemaValidator interface {
	// Validate はレコードのBodyが有効かを検証する。
	Validate(channel string, body []byte) error
}

// RoleBasedAccessPolicy はロールベースのアクセス制御実装。
// データモデル設計書のWrite権限定義に基づく。
type RoleBasedAccessPolicy struct {
	// GetRole は指定DIDのロールを返す関数。
	GetRole func(did string) string
}

// CanRead は全メンバーが全チャネルを読み取り可能。
// データ分離はtopicベースのSubscriptionで行う。
func (p *RoleBasedAccessPolicy) CanRead(did string, channel string) bool {
	return true
}

// CanWrite はチャネルごとの書き込み権限をロールで判定する。
func (p *RoleBasedAccessPolicy) CanWrite(did string, channel string) bool {
	role := p.GetRole(did)

	switch channel {
	// admin only
	case ChannelRegions.Name, ChannelUsers.Name, ChannelOrgGroups.Name, ChannelAppConfig.Name:
		return role == "admin"

	// editor+ (admin or editor)
	case ChannelParentAreas.Name, ChannelAreas.Name, ChannelPlaces.Name,
		ChannelMapVertices.Name, ChannelMapEdges.Name, ChannelMapPolygons.Name,
		ChannelMemberTags.Name,
		ChannelActivityAssignments.Name, ChannelVisitRecordEdits.Name,
		ChannelCoverages.Name, ChannelCoveragePlans.Name, ChannelAreaAvailability.Name:
		return role == "admin" || role == "editor"

	// editor+ and activity staff
	case ChannelTeams.Name, ChannelActivities.Name, ChannelVisitRecords.Name, ChannelRequests.Name:
		return role == "admin" || role == "editor" || role == "member"

	// invitation: admin/editor+
	case ChannelInvitations.Name:
		return role == "admin" || role == "editor"

	// system channels (audit, notifications): app layer writes only
	case ChannelAuditLog.Name, ChannelNotifications.Name:
		return false // Written by system, not directly by users

	default:
		return false
	}
}
