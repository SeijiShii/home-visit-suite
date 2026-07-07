// NotificationRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。

import type { AuditLog } from "../../domain/models/audit";
import type { Notification } from "../../domain/models/notification";
import type { Request } from "../../domain/models/request";
import type { NotificationRepository } from "../../domain/repositories/notification-repository";

export class InMemoryNotificationRepository implements NotificationRepository {
  private notifications = new Map<string, Notification>();
  private requests = new Map<string, Request>();
  private auditLogs = new Map<string, AuditLog>();

  async listNotifications(targetId: string): Promise<Notification[]> {
    return [...this.notifications.values()]
      .filter((n) => n.targetId === targetId)
      .map((n) => ({ ...n }));
  }

  async saveNotification(n: Notification): Promise<void> {
    this.notifications.set(n.id, { ...n });
  }

  async markNotificationRead(id: string): Promise<void> {
    const n = this.notifications.get(id);
    if (n) {
      n.read = true;
    }
  }

  async listRequests(areaId: string): Promise<Request[]> {
    return [...this.requests.values()]
      .filter((r) => r.areaId === areaId)
      .map(cloneRequest);
  }

  async getRequest(id: string): Promise<Request | null> {
    const r = this.requests.get(id);
    return r ? cloneRequest(r) : null;
  }

  async saveRequest(req: Request): Promise<void> {
    this.requests.set(req.id, cloneRequest(req));
  }

  async listAuditLogs(regionId: string): Promise<AuditLog[]> {
    return [...this.auditLogs.values()]
      .filter((l) => l.regionId === regionId)
      .map((l) => ({ ...l }));
  }

  async saveAuditLog(log: AuditLog): Promise<void> {
    this.auditLogs.set(log.id, { ...log });
  }
}

function cloneRequest(r: Request): Request {
  return { ...r, coord: r.coord ? { ...r.coord } : null };
}
