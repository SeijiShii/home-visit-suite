package domain

import "time"

// AuditAction は監査対象の操作種別。
type AuditAction string

const (
	AuditActionRoleChange   AuditAction = "role_change"
	AuditActionAreaEdit     AuditAction = "area_edit"
	AuditActionApproval     AuditAction = "approval"
	AuditActionDoNotVisit   AuditAction = "do_not_visit"
	AuditActionForceReturn  AuditAction = "force_return"
)

// AuditLog は重要操作の履歴。
type AuditLog struct {
	ID        string      `json:"id"`
	Action    AuditAction `json:"action"`
	ActorID   string      `json:"actorId"`  // 操作者
	TargetID  string      `json:"targetId"` // 操作対象
	Detail    string      `json:"detail"`
	CreatedAt time.Time   `json:"createdAt"`
}
