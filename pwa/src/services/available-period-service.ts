// チェックアウト可能期間（AvailablePeriod）の管理ロジック。
// 仕様: docs/wants/06_網羅管理.md「チェックアウト可能期間（AvailablePeriod）」
// 参照実装: shared/service/available_period.go / available_period_impl.go
//
// Go 版との差分: 時刻取得を nowFn で注入可能にした（テスト・起動時 reconcile 用）。
// 日付入力は ISO 8601 文字列（モデルのフィールド型と統一）。

import {
  type AvailablePeriod,
  type AvailablePeriodTag,
  availablePeriodPhase,
  availablePeriodsOverlap,
  validateAvailablePeriod,
  validateAvailablePeriodTag,
} from "../domain/models/available-period";
import type { CheckoutRepository } from "../domain/repositories/checkout-repository";
import type { CoverageRepository } from "../domain/repositories/coverage-repository";
import type { UserRepository } from "../domain/repositories/user-repository";
import { roleIsAtLeast } from "../domain/models/user";
import { ServiceError } from "./errors";
import { newId } from "./id";

/** UpdatePeriod のパラメータ。undefined フィールドは無変更を意味する。 */
export interface PeriodUpdate {
  name?: string;
  startDate?: string;
  endDate?: string;
  parentAreaIds?: string[];
  tagIds?: string[];
}

export interface AvailablePeriodService {
  /**
   * 新規 AvailablePeriod を作成する（editor+）。
   * - 開始日・終了日のバリデーション（validateAvailablePeriod）
   * - 他の AvailablePeriod と時間的に重複してはいけない（重複不可制約）
   */
  createPeriod(
    actorId: string,
    name: string,
    startDate: string,
    endDate: string,
    parentAreaIds: string[],
    tagIds: string[],
  ): Promise<AvailablePeriod>;

  /**
   * 既存 AvailablePeriod を編集する（editor+、段階的ロック）。
   * - 開始前: 全項目編集可
   * - 活動中: 終了日 **延長** のみ／対象区域親番 **追加** のみ／タグ
   * - 終了後: タグのみ
   */
  updatePeriod(
    actorId: string,
    periodId: string,
    update: PeriodUpdate,
  ): Promise<AvailablePeriod>;

  /** AvailablePeriod を削除する（editor+、開始前のみ可）。 */
  deletePeriod(actorId: string, periodId: string): Promise<void>;

  listPeriods(): Promise<AvailablePeriod[]>;
  getPeriod(id: string): Promise<AvailablePeriod>;
  /** now 時点でアクティブな AvailablePeriod を返す。なければ null。 */
  getActivePeriod(now: Date): Promise<AvailablePeriod | null>;

  /**
   * now 時点で endDate を超えた AvailablePeriod 配下の未完了（pending / active）
   * チェックアウトをすべて強制クローズ状態に遷移させる。
   * 紐づく未失効の招待もすべて失効する。
   * PWA ではアプリ起動時 reconcile として呼び出す（バックグラウンド常駐はない）。
   * 戻り値: クローズしたチェックアウト数
   */
  forceCloseExpiredCheckouts(now: Date): Promise<number>;

  // --- AvailablePeriodTag ---

  createTag(actorId: string, name: string, color: string): Promise<AvailablePeriodTag>;
  updateTag(
    actorId: string,
    tagId: string,
    name: string,
    color: string,
  ): Promise<AvailablePeriodTag>;
  deleteTag(actorId: string, tagId: string): Promise<void>;
  listTags(): Promise<AvailablePeriodTag[]>;
}

export class AvailablePeriodServiceImpl implements AvailablePeriodService {
  constructor(
    private covRepo: CoverageRepository,
    private coRepo: CheckoutRepository,
    private userRepo: UserRepository,
    private nowFn: () => Date = () => new Date(),
  ) {}

  private async requireEditor(actorId: string): Promise<void> {
    const user = await this.userRepo.getUser(actorId);
    if (!user) {
      throw new ServiceError("not_found", `user not found: ${actorId}`);
    }
    if (!roleIsAtLeast(user.role, "editor")) {
      throw new ServiceError(
        "permission_denied",
        "available period operation requires editor or above",
      );
    }
  }

  // --- Period CRUD ---

  async createPeriod(
    actorId: string,
    name: string,
    startDate: string,
    endDate: string,
    parentAreaIds: string[],
    tagIds: string[],
  ): Promise<AvailablePeriod> {
    await this.requireEditor(actorId);

    const now = this.nowFn().toISOString();
    const p: AvailablePeriod = {
      id: newId("ap"),
      name,
      startDate,
      endDate,
      parentAreaIds,
      tagIds,
      createdAt: now,
      updatedAt: now,
    };
    const invalid = validateAvailablePeriod(p);
    if (invalid) {
      throw new ServiceError("invalid_input", `validate: ${invalid}`);
    }

    // 重複チェック
    const all = await this.covRepo.listAvailablePeriods();
    for (const other of all) {
      if (availablePeriodsOverlap(p, other)) {
        throw new ServiceError("invalid_input", `period overlaps existing "${other.name}"`);
      }
    }

    await this.covRepo.saveAvailablePeriod(p);
    return p;
  }

  async updatePeriod(
    actorId: string,
    periodId: string,
    update: PeriodUpdate,
  ): Promise<AvailablePeriod> {
    await this.requireEditor(actorId);

    const current = await this.covRepo.getAvailablePeriod(periodId);
    if (!current) {
      throw new ServiceError("not_found", `period not found: ${periodId}`);
    }

    const now = this.nowFn();
    const phase = availablePeriodPhase(current, now);

    // 段階的ロックの判定
    if (phase === "active") {
      if (update.name !== undefined) {
        throw new ServiceError("invalid_state", "cannot rename active period");
      }
      if (update.startDate !== undefined) {
        throw new ServiceError("invalid_state", "cannot change startDate of active period");
      }
      if (
        update.endDate !== undefined &&
        new Date(update.endDate).getTime() < new Date(current.endDate).getTime()
      ) {
        throw new ServiceError("invalid_state", "cannot shorten endDate of active period");
      }
      if (update.parentAreaIds !== undefined) {
        // 削除されていないか確認（追加のみ許容）
        if (!isSubset(current.parentAreaIds, update.parentAreaIds)) {
          throw new ServiceError(
            "invalid_state",
            "cannot remove parent areas from active period",
          );
        }
      }
    } else if (phase === "closed") {
      if (
        update.name !== undefined ||
        update.startDate !== undefined ||
        update.endDate !== undefined ||
        update.parentAreaIds !== undefined
      ) {
        throw new ServiceError("invalid_state", "closed period: only tags are editable");
      }
    }

    // 適用
    const next: AvailablePeriod = {
      ...current,
      name: update.name ?? current.name,
      startDate: update.startDate ?? current.startDate,
      endDate: update.endDate ?? current.endDate,
      parentAreaIds: update.parentAreaIds ?? current.parentAreaIds,
      tagIds: update.tagIds ?? current.tagIds,
    };

    const invalid = validateAvailablePeriod(next);
    if (invalid) {
      throw new ServiceError("invalid_input", `validate: ${invalid}`);
    }

    // 重複チェック（自分自身を除く）
    const all = await this.covRepo.listAvailablePeriods();
    for (const other of all) {
      if (other.id === next.id) continue;
      if (availablePeriodsOverlap(next, other)) {
        throw new ServiceError("invalid_input", `period overlaps existing "${other.name}"`);
      }
    }

    next.updatedAt = now.toISOString();
    await this.covRepo.saveAvailablePeriod(next);
    return next;
  }

  async deletePeriod(actorId: string, periodId: string): Promise<void> {
    await this.requireEditor(actorId);

    const current = await this.covRepo.getAvailablePeriod(periodId);
    if (!current) {
      throw new ServiceError("not_found", `period not found: ${periodId}`);
    }

    if (availablePeriodPhase(current, this.nowFn()) !== "pending") {
      throw new ServiceError("invalid_state", "can only delete pending periods");
    }

    await this.covRepo.deleteAvailablePeriod(periodId);
  }

  async listPeriods(): Promise<AvailablePeriod[]> {
    return this.covRepo.listAvailablePeriods();
  }

  async getPeriod(id: string): Promise<AvailablePeriod> {
    const p = await this.covRepo.getAvailablePeriod(id);
    if (!p) {
      throw new ServiceError("not_found", `period not found: ${id}`);
    }
    return p;
  }

  async getActivePeriod(now: Date): Promise<AvailablePeriod | null> {
    return this.covRepo.getActiveAvailablePeriod(now);
  }

  // --- ForceCloseExpiredCheckouts ---

  async forceCloseExpiredCheckouts(now: Date): Promise<number> {
    const periods = await this.covRepo.listAvailablePeriods();

    let closed = 0;
    for (const p of periods) {
      if (availablePeriodPhase(p, now) !== "closed") continue;
      // この期間配下の未完了チェックアウトを強制クローズ
      const all = await this.coRepo.listAllCheckouts();
      for (const c of all) {
        if (c.availablePeriodId !== p.id) continue;
        if (c.status !== "pending" && c.status !== "active") continue;
        const closedAt = now.toISOString();
        await this.coRepo.saveCheckout({
          ...c,
          status: "force_closed",
          forceClosedAt: closedAt,
          updatedAt: closedAt,
        });
        // 紐づく招待も連動失効
        const invs = await this.coRepo.listCheckoutInvitations(c.id);
        for (const inv of invs) {
          if (inv.revokedAt !== null) continue;
          await this.coRepo.saveCheckoutInvitation({ ...inv, revokedAt: closedAt });
        }
        closed += 1;
      }
    }
    return closed;
  }

  // --- Tag CRUD ---

  async createTag(actorId: string, name: string, color: string): Promise<AvailablePeriodTag> {
    await this.requireEditor(actorId);

    const tag: AvailablePeriodTag = { id: newId("apt"), name, color };
    const invalid = validateAvailablePeriodTag(tag);
    if (invalid) {
      throw new ServiceError("invalid_input", `validate: ${invalid}`);
    }

    // 重複チェック
    const existing = await this.covRepo.listAvailablePeriodTags();
    if (existing.some((t) => t.name === name)) {
      throw new ServiceError("invalid_input", `tag name "${name}" already exists`);
    }

    await this.covRepo.saveAvailablePeriodTag(tag);
    return tag;
  }

  async updateTag(
    actorId: string,
    tagId: string,
    name: string,
    color: string,
  ): Promise<AvailablePeriodTag> {
    await this.requireEditor(actorId);

    const current = await this.covRepo.getAvailablePeriodTag(tagId);
    if (!current) {
      throw new ServiceError("not_found", `tag not found: ${tagId}`);
    }

    const next: AvailablePeriodTag = { ...current, name, color };
    const invalid = validateAvailablePeriodTag(next);
    if (invalid) {
      throw new ServiceError("invalid_input", `validate: ${invalid}`);
    }

    // 同名他タグがないか
    const existing = await this.covRepo.listAvailablePeriodTags();
    if (existing.some((t) => t.id !== tagId && t.name === name)) {
      throw new ServiceError("invalid_input", `tag name "${name}" already exists`);
    }

    await this.covRepo.saveAvailablePeriodTag(next);
    return next;
  }

  async deleteTag(actorId: string, tagId: string): Promise<void> {
    await this.requireEditor(actorId);
    await this.covRepo.deleteAvailablePeriodTag(tagId);
  }

  async listTags(): Promise<AvailablePeriodTag[]> {
    return this.covRepo.listAvailablePeriodTags();
  }
}

/** a が b の部分集合か（b が a を全て含むか）を返す。 */
function isSubset(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.every((v) => set.has(v));
}
