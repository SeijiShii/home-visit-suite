import { models } from "../../wailsjs/go/models";

// ScheduleBinding API（Wails自動生成の関数群に対応）
export interface ScheduleBindingAPI {
  ListSchedulePeriods(): Promise<models.SchedulePeriod[]>;
  GetSchedulePeriod(id: string): Promise<models.SchedulePeriod>;
  CreateSchedulePeriod(sp: models.SchedulePeriod): Promise<void>;
  UpdateSchedulePeriod(sp: models.SchedulePeriod): Promise<void>;
  DeleteSchedulePeriod(id: string): Promise<void>;
  ApproveSchedulePeriod(actorId: string, id: string): Promise<void>;
  RevokeSchedulePeriodApproval(actorId: string, id: string): Promise<void>;

  ListScopes(schedulePeriodId: string): Promise<models.Scope[]>;
  GetScope(id: string): Promise<models.Scope>;
  CreateScope(sc: models.Scope): Promise<void>;
  UpdateScope(sc: models.Scope): Promise<void>;
  DeleteScope(id: string): Promise<void>;
  CreateScopesFromGroups(schedulePeriodId: string, groupIds: string[]): Promise<models.Scope[]>;

  ListAreaAvailabilities(scopeId: string): Promise<models.AreaAvailability[]>;
  CreateAreaAvailability(aa: models.AreaAvailability): Promise<void>;
  UpdateAreaAvailability(aa: models.AreaAvailability): Promise<void>;
  DeleteAreaAvailability(id: string): Promise<void>;
}

// 予定機能のフロントエンド向けサービス
export class ScheduleService {
  constructor(private readonly api: ScheduleBindingAPI) {}

  // --- SchedulePeriod ---

  async listPeriods(): Promise<models.SchedulePeriod[]> {
    return (await this.api.ListSchedulePeriods()) ?? [];
  }

  getPeriod(id: string): Promise<models.SchedulePeriod> {
    return this.api.GetSchedulePeriod(id);
  }

  createPeriod(sp: models.SchedulePeriod): Promise<void> {
    return this.api.CreateSchedulePeriod(sp);
  }

  updatePeriod(sp: models.SchedulePeriod): Promise<void> {
    return this.api.UpdateSchedulePeriod(sp);
  }

  deletePeriod(id: string): Promise<void> {
    return this.api.DeleteSchedulePeriod(id);
  }

  approve(actorId: string, id: string): Promise<void> {
    return this.api.ApproveSchedulePeriod(actorId, id);
  }

  revoke(actorId: string, id: string): Promise<void> {
    return this.api.RevokeSchedulePeriodApproval(actorId, id);
  }

  // --- Scope ---

  async listScopes(schedulePeriodId: string): Promise<models.Scope[]> {
    return (await this.api.ListScopes(schedulePeriodId)) ?? [];
  }

  getScope(id: string): Promise<models.Scope> {
    return this.api.GetScope(id);
  }

  createScope(sc: models.Scope): Promise<void> {
    return this.api.CreateScope(sc);
  }

  updateScope(sc: models.Scope): Promise<void> {
    return this.api.UpdateScope(sc);
  }

  deleteScope(id: string): Promise<void> {
    return this.api.DeleteScope(id);
  }

  createScopesFromGroups(schedulePeriodId: string, groupIds: string[]): Promise<models.Scope[]> {
    return this.api.CreateScopesFromGroups(schedulePeriodId, groupIds);
  }

  // --- AreaAvailability ---

  async listAvailabilities(scopeId: string): Promise<models.AreaAvailability[]> {
    return (await this.api.ListAreaAvailabilities(scopeId)) ?? [];
  }

  createAvailability(aa: models.AreaAvailability): Promise<void> {
    return this.api.CreateAreaAvailability(aa);
  }

  updateAvailability(aa: models.AreaAvailability): Promise<void> {
    return this.api.UpdateAreaAvailability(aa);
  }

  deleteAvailability(id: string): Promise<void> {
    return this.api.DeleteAreaAvailability(id);
  }
}
