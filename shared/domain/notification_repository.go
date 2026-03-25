package domain

import "github.com/SeijiShii/home-visit-suite/shared/domain/models"

// NotificationRepository は通知・申請・監査ログの永続化インターフェース。
type NotificationRepository interface {
	// Notification
	ListNotifications(targetID string) ([]models.Notification, error)
	SaveNotification(n *models.Notification) error
	MarkNotificationRead(id string) error

	// Request
	ListRequests(areaID string) ([]models.Request, error)
	GetRequest(id string) (*models.Request, error)
	SaveRequest(req *models.Request) error

	// AuditLog
	ListAuditLogs(regionID string) ([]models.AuditLog, error)
	SaveAuditLog(log *models.AuditLog) error
}
