// 通知・申請・監査ログの永続化インターフェース。
// 参照実装: shared/domain/notification_repository.go

import type { AuditLog } from "../models/audit";
import type { Notification } from "../models/notification";
import type { Request } from "../models/request";

export interface NotificationRepository {
  // Notification
  listNotifications(targetId: string): Promise<Notification[]>;
  saveNotification(n: Notification): Promise<void>;
  markNotificationRead(id: string): Promise<void>;

  // Request
  listRequests(areaId: string): Promise<Request[]>;
  getRequest(id: string): Promise<Request | null>;
  saveRequest(req: Request): Promise<void>;

  // AuditLog
  listAuditLogs(regionId: string): Promise<AuditLog[]>;
  saveAuditLog(log: AuditLog): Promise<void>;
}
