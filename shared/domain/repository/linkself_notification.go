package repository

import (
	"database/sql"
	"fmt"

	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
)

// LinkSelfNotificationRepo はLinkSelf MyDBを使ったNotificationRepository実装。
type LinkSelfNotificationRepo struct{ *LinkSelfRepository }

// --- Notification ---

func (r *LinkSelfNotificationRepo) ListNotifications(targetID string) ([]models.Notification, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, type, target_id, reference_id, message, read, created_at, expires_at
		 FROM notifications WHERE target_id = ? ORDER BY created_at DESC`, targetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Notification
	for rows.Next() {
		n, err := scanNotification(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, n)
	}
	return result, nil
}

func (r *LinkSelfNotificationRepo) SaveNotification(n *models.Notification) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO notifications
		 (id, type, target_id, reference_id, message, read, created_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		n.ID, string(n.Type), n.TargetID, n.ReferenceID, n.Message,
		boolToInt(n.Read), formatTime(n.CreatedAt), formatTimePtr(n.ExpiresAt))
	return err
}

func (r *LinkSelfNotificationRepo) MarkNotificationRead(id string) error {
	_, err := r.db.Exec(r.ctx,
		`UPDATE notifications SET read = 1 WHERE id = ?`, id)
	return err
}

// --- Request ---

func (r *LinkSelfNotificationRepo) ListRequests(areaID string) ([]models.Request, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, type, status, submitter_id, area_id, coord_lat, coord_lng,
		        description, created_at, resolved_at, resolved_by
		 FROM requests WHERE area_id = ? ORDER BY created_at DESC`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Request
	for rows.Next() {
		req, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, req)
	}
	return result, nil
}

func (r *LinkSelfNotificationRepo) GetRequest(id string) (*models.Request, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, type, status, submitter_id, area_id, coord_lat, coord_lng,
		        description, created_at, resolved_at, resolved_by
		 FROM requests WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("request not found: %s", id)
	}
	req, err := scanRequest(rows)
	if err != nil {
		return nil, err
	}
	return &req, nil
}

func (r *LinkSelfNotificationRepo) SaveRequest(req *models.Request) error {
	var lat, lng sql.NullFloat64
	if req.Coord != nil {
		lat = sql.NullFloat64{Float64: req.Coord.Lat, Valid: true}
		lng = sql.NullFloat64{Float64: req.Coord.Lng, Valid: true}
	}
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO requests
		 (id, type, status, submitter_id, area_id, coord_lat, coord_lng,
		  description, created_at, resolved_at, resolved_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		req.ID, string(req.Type), string(req.Status), req.SubmitterID, req.AreaID,
		lat, lng, req.Description, formatTime(req.CreatedAt),
		formatTimePtr(req.ResolvedAt), req.ResolvedBy)
	return err
}

// --- AuditLog ---

func (r *LinkSelfNotificationRepo) ListAuditLogs(regionID string) ([]models.AuditLog, error) {
	rows, err := r.db.Query(r.ctx,
		`SELECT id, region_id, action, actor_id, target_id, detail, timestamp, created_at
		 FROM audit_log WHERE region_id = ? ORDER BY timestamp DESC`, regionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.AuditLog
	for rows.Next() {
		var log models.AuditLog
		var action, ts, createdAt string
		if err := rows.Scan(&log.ID, &log.RegionID, &action, &log.ActorID,
			&log.TargetID, &log.Detail, &ts, &createdAt); err != nil {
			return nil, err
		}
		log.Action = models.AuditAction(action)
		log.Timestamp = parseTime(ts)
		log.CreatedAt = parseTime(createdAt)
		result = append(result, log)
	}
	return result, nil
}

func (r *LinkSelfNotificationRepo) SaveAuditLog(log *models.AuditLog) error {
	_, err := r.db.Exec(r.ctx,
		`INSERT OR REPLACE INTO audit_log
		 (id, region_id, action, actor_id, target_id, detail, timestamp, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		log.ID, log.RegionID, string(log.Action), log.ActorID,
		log.TargetID, log.Detail, formatTime(log.Timestamp), formatTime(log.CreatedAt))
	return err
}

// --- scan helpers ---

func scanNotification(row scannable) (models.Notification, error) {
	var n models.Notification
	var typeStr, createdAt string
	var readInt int
	var expiresAt sql.NullString
	err := row.Scan(&n.ID, &typeStr, &n.TargetID, &n.ReferenceID, &n.Message,
		&readInt, &createdAt, &expiresAt)
	if err != nil {
		return n, err
	}
	n.Type = models.NotificationType(typeStr)
	n.Read = readInt != 0
	n.CreatedAt = parseTime(createdAt)
	n.ExpiresAt = parseTimePtr(expiresAt)
	return n, nil
}

func scanRequest(row scannable) (models.Request, error) {
	var req models.Request
	var typeStr, statusStr string
	var coordLat, coordLng sql.NullFloat64
	var createdAt string
	var resolvedAt sql.NullString
	err := row.Scan(&req.ID, &typeStr, &statusStr, &req.SubmitterID, &req.AreaID,
		&coordLat, &coordLng, &req.Description, &createdAt, &resolvedAt, &req.ResolvedBy)
	if err != nil {
		return req, err
	}
	req.Type = models.RequestType(typeStr)
	req.Status = models.RequestStatus(statusStr)
	if coordLat.Valid && coordLng.Valid {
		req.Coord = &models.Coordinate{Lat: coordLat.Float64, Lng: coordLng.Float64}
	}
	req.CreatedAt = parseTime(createdAt)
	req.ResolvedAt = parseTimePtr(resolvedAt)
	return req, nil
}
