// 通知・申請・監査ログの永続化インターフェース。
// 参照実装: shared/domain/notification_repository.go

import type { AuditLog } from "../models/audit";
import type { Feedback } from "../models/feedback";
import type { Notification } from "../models/notification";
import type { Request } from "../models/request";

export interface NotificationRepository {
  // Notification
  listNotifications(targetId: string): Promise<Notification[]>;
  saveNotification(n: Notification): Promise<void>;
  markNotificationRead(id: string): Promise<void>;

  // Request
  listRequests(areaId: string): Promise<Request[]>;
  /** 全区域の申請を返す（申請一覧 /requests 用。docs/wants/07「申請一覧」） */
  listAllRequests(): Promise<Request[]>;
  getRequest(id: string): Promise<Request | null>;
  saveRequest(req: Request): Promise<void>;

  // Feedback（管理者宛。docs/wants/07「フィードバック」）
  listFeedback(): Promise<Feedback[]>;
  getFeedback(id: string): Promise<Feedback | null>;
  saveFeedback(f: Feedback): Promise<void>;

  // AuditLog
  listAuditLogs(regionId: string): Promise<AuditLog[]>;
  saveAuditLog(log: AuditLog): Promise<void>;
}
