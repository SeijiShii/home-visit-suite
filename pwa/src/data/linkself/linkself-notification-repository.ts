// NotificationRepository の LinkSelf(MyDB SQL) 実装。
// 通知/申請/監査ログを JSON 行テーブル（notifications/requests/audit_log）に保存する。
// ネットワーク配線時は ScopeNetwork で全メンバーへ伝播する（docs/wants/01「同期スコープ」）。

import type { MyDB } from "@linkself/core";
import type { AuditLog } from "../../domain/models/audit";
import type { Notification } from "../../domain/models/notification";
import type { Request } from "../../domain/models/request";
import type { NotificationRepository } from "../../domain/repositories/notification-repository";
import { getRow, listRows, putRow } from "./group-schema";

export class LinkSelfNotificationRepository implements NotificationRepository {
  constructor(private readonly db: MyDB) {}

  async listNotifications(targetId: string): Promise<Notification[]> {
    return (await listRows<Notification>(this.db, "notifications")).filter(
      (n) => n.targetId === targetId,
    );
  }

  saveNotification(n: Notification): Promise<void> {
    return putRow(this.db, "notifications", n.id, n);
  }

  async markNotificationRead(id: string): Promise<void> {
    const n = await getRow<Notification>(this.db, "notifications", id);
    if (n) {
      n.read = true;
      await putRow(this.db, "notifications", id, n);
    }
  }

  async listRequests(areaId: string): Promise<Request[]> {
    return (await listRows<Request>(this.db, "requests")).filter(
      (r) => r.areaId === areaId,
    );
  }

  listAllRequests(): Promise<Request[]> {
    return listRows<Request>(this.db, "requests");
  }

  getRequest(id: string): Promise<Request | null> {
    return getRow<Request>(this.db, "requests", id);
  }

  saveRequest(req: Request): Promise<void> {
    return putRow(this.db, "requests", req.id, req);
  }

  async listAuditLogs(regionId: string): Promise<AuditLog[]> {
    return (await listRows<AuditLog>(this.db, "audit_log")).filter(
      (l) => l.regionId === regionId,
    );
  }

  saveAuditLog(log: AuditLog): Promise<void> {
    return putRow(this.db, "audit_log", log.id, log);
  }
}
