// チェックアウトの管理ロジック。
// 「貸し出し」「持ち出し」の操作経路区別は廃止済み（2026-05-06 仕様改訂）。
// 統一して「チェックアウト」と呼称し、誰がチェックアウト操作したか・誰が担当するかを記録するのみ。
// 仕様: docs/wants/05_チェックアウト.md
// 参照実装: shared/service/checkout.go / checkout_impl.go
//
// Go 版との差分: 時刻取得を nowFn で注入可能にした。ttl はミリ秒指定。
// 日付入力は ISO 8601 文字列（モデルのフィールド型と統一）。

import type { AccessMode } from "../domain/models/access";
import { areaPolygonIds } from "../domain/models/region";
import { DEFAULT_CHECKOUT_INVITE_TTL_MS } from "../domain/models/checkout-invitation";
import {
  type CheckoutInvitation,
  checkoutInvitationIsActive,
} from "../domain/models/checkout-invitation";
import type { Notification } from "../domain/models/notification";
import type { Request, RequestType } from "../domain/models/request";
import { roleIsAtLeast } from "../domain/models/user";
import {
  type Checkout,
  type VisitRecord,
  type VisitResult,
  visitResultRequiresApplication,
} from "../domain/models/visit";
import type { CheckoutRepository } from "../domain/repositories/checkout-repository";
import type { NotificationRepository } from "../domain/repositories/notification-repository";
import type { RegionRepository } from "../domain/repositories/region-repository";
import type { UserRepository } from "../domain/repositories/user-repository";
import { ServiceError } from "./errors";
import { newId } from "./id";

/** ListAccessibleAreas が返す区域への自分の関与種別。 */
export type AccessibleAreaRole =
  | "person_in_charge" // 自分が担当者
  | "invitee"; // 自分が被招待者

/**
 * listAccessibleAreas のレスポンス DTO。
 * 各エントリは1つのチェックアウトとそれに対する自分の関与を表す。
 */
export interface AccessibleArea {
  areaId: string;
  checkoutId: string;
  role: AccessibleAreaRole;
  /** role === "invitee" のとき、招待の期限（ISO 8601） */
  inviteExpiresAt: string | null;
}

export interface CheckoutService {
  /**
   * 区域をチェックアウトする。
   * 排他的取得: 同一区域に他者を含むアクティブなチェックアウトがあればエラー。
   * 他者のアクティブなチェックアウトが無い区域は誰でもチェックアウトできる（期間ゲートは廃止）。
   * - ポリゴン未紐付けの区域（紐付けポリゴンが 0 件）はチェックアウト不可
   * - 活動メンバー: 自分自身を担当者にしたチェックアウトのみ発行可能（personInChargeId === actorId）
   * - 編集メンバー以上: 任意のメンバー（自分含む）を担当者にしたチェックアウトを発行可能
   * checkedOutById には actorId が記録される（操作履歴）。
   */
  checkout(
    actorId: string,
    areaId: string,
    personInChargeId: string,
  ): Promise<Checkout>;

  /**
   * 区域を返却する。担当者または編集メンバー以上が実行可能。
   * 紐づく未失効の区域招待は連動失効する。
   */
  return(actorId: string, checkoutId: string): Promise<void>;

  /**
   * 編集メンバーが強制回収する。editor+ のみ。
   * 紐づく未失効の区域招待は連動失効する。
   */
  forceReturn(actorId: string, checkoutId: string): Promise<void>;

  /**
   * チェックアウトの担当者を別メンバーへ任命変更する。editor+ のみ。
   * active 状態のチェックアウトでのみ実行可能。
   * 紐づく未失効の区域招待・checkedOutById は維持される。
   * newPersonInChargeId が現担当者と同じ場合は冪等な成功を返す（no-op）。
   */
  reassignPersonInCharge(
    actorId: string,
    checkoutId: string,
    newPersonInChargeId: string,
  ): Promise<void>;

  /**
   * 訪問記録を作成する。チェックアウトの担当者または有効な招待保有者が実行。
   * applicationText: 申請を伴うステータス（vacant_abandoned / refused）の場合は必須。
   * 申請が必要なステータスでは Request も同時に作成し、appliedRequestId で紐付ける。
   */
  recordVisit(
    actorId: string,
    checkoutId: string,
    placeId: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord>;

  /**
   * チェックアウトに紐付かない訪問記録を作成する（Phase 1 暫定 API）。
   * 本番モデル（チェックアウト → 訪問記録 → 返却）配線完了時に削除する。
   */
  recordVisitAdHoc(
    actorId: string,
    areaId: string,
    placeId: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord>;

  /**
   * 区域招待を発行する。
   * - actorId は editor+ または当該チェックアウトの現担当者
   * - チェックアウトは active 状態であること
   * - inviteeId は活動メンバー（member）かつ担当者本人ではない
   * - ttlMs が 0 ならデフォルト 24 時間を適用、負値はエラー
   * - 既存の有効な招待があれば expiresAt を上書き延長する（重複レコードは作らない）
   * - 発行成功時、被招待者へ area_invite 通知を送る（発行時のみ通知）
   */
  invite(
    actorId: string,
    checkoutId: string,
    inviteeId: string,
    ttlMs: number,
  ): Promise<CheckoutInvitation>;

  /**
   * 区域招待を取り消す。
   * - 取消可能者: 招待者本人 / 当該チェックアウトの現担当者 / editor+
   * - 既に取消済みの場合はエラー（invalid_state）
   */
  revokeInvite(actorId: string, invitationId: string): Promise<void>;

  /** 当該チェックアウトの招待一覧を返す（取消・期限切れ含む全件）。 */
  listInvitations(checkoutId: string): Promise<CheckoutInvitation[]>;

  /**
   * userId が areaId に対して持つ区域レベルのアクセスモードを返す。
   * - editor+ ならば常に閲覧可。入力可（editable）になるのは active なチェックアウト経由のみ
   * - 活動メンバーは担当者または有効招待保有のときのみ editable、それ以外は read_only
   */
  areaAccessMode(userId: string, areaId: string): Promise<AccessMode>;

  /**
   * userId が placeId に対して持つ場所レベルのアクセスモードを返す。
   * 現フェーズでは場所単位の read-only 切替操作は未実装のため、常に editable を返す。
   */
  placeAccessMode(userId: string, placeId: string): Promise<AccessMode>;

  /**
   * userId がアクセス可能な区域一覧を返す。
   * 担当者として active なチェックアウトを持つ区域 + 有効な招待を保有している区域。
   */
  listAccessibleAreas(userId: string): Promise<AccessibleArea[]>;
}

export class CheckoutServiceImpl implements CheckoutService {
  constructor(
    private coRepo: CheckoutRepository,
    private userRepo: UserRepository,
    private notifRepo: NotificationRepository,
    private regionRepo: RegionRepository,
    private nowFn: () => Date = () => new Date(),
  ) {}

  private async getActorRole(actorId: string) {
    const user = await this.userRepo.getUser(actorId);
    if (!user) {
      throw new ServiceError("not_found", `user not found: ${actorId}`);
    }
    return user.role;
  }

  async checkout(
    actorId: string,
    areaId: string,
    personInChargeId: string,
  ): Promise<Checkout> {
    const role = await this.getActorRole(actorId);

    if (personInChargeId === "") {
      personInChargeId = actorId;
    }

    // 権限チェック: 活動メンバーは自分自身を担当者にする場合のみ発行可能
    if (!roleIsAtLeast(role, "editor") && personInChargeId !== actorId) {
      throw new ServiceError(
        "permission_denied",
        "members can only checkout for themselves",
      );
    }

    const now = this.nowFn();

    // 区域の存在確認
    const area = await this.regionRepo.getArea(areaId);
    if (!area) {
      throw new ServiceError("not_found", `area not found: ${areaId}`);
    }

    // ポリゴン未紐付けの区域はチェックアウト不可（仕様 docs/wants/05_チェックアウト.md）
    if (areaPolygonIds(area).length === 0) {
      throw new ServiceError(
        "invalid_state",
        `area ${areaId} has no polygon bound`,
      );
    }

    // 排他的チェックアウト: 他者を含むアクティブなチェックアウトがあればエラー
    // （「チェックアウト可能期間」廃止により、ゲートはこの排他制約のみ）
    const existing = await this.coRepo.getActiveCheckout(areaId);
    if (existing) {
      throw new ServiceError(
        "exclusive_checkout",
        `area ${areaId} already has active checkout: ${existing.id}`,
      );
    }

    const nowIso = now.toISOString();
    const c: Checkout = {
      id: newId("co"),
      areaId,
      personInChargeId,
      checkedOutById: actorId,
      status: "active",
      createdAt: nowIso,
      returnedAt: null,
      completedAt: null,
      updatedAt: nowIso,
    };

    await this.coRepo.saveCheckout(c);
    return c;
  }

  async return(_actorId: string, checkoutId: string): Promise<void> {
    const c = await this.coRepo.getCheckout(checkoutId);
    if (!c) {
      throw new ServiceError("not_found", `checkout not found: ${checkoutId}`);
    }

    if (c.status !== "active") {
      throw new ServiceError(
        "invalid_state",
        `checkout ${checkoutId} is not active (status: ${c.status})`,
      );
    }

    const nowIso = this.nowFn().toISOString();
    await this.coRepo.saveCheckout({
      ...c,
      status: "returned",
      returnedAt: nowIso,
      updatedAt: nowIso,
    });

    // 紐づく未失効の招待を一括失効
    // 仕様 docs/wants/05_チェックアウト.md「区域招待 > 失効・取り消し」
    await this.cascadeRevokeInvitations(checkoutId, nowIso);
  }

  async forceReturn(actorId: string, checkoutId: string): Promise<void> {
    const role = await this.getActorRole(actorId);
    if (!roleIsAtLeast(role, "editor")) {
      throw new ServiceError(
        "permission_denied",
        "force return requires editor or above",
      );
    }
    await this.return(actorId, checkoutId);
  }

  async reassignPersonInCharge(
    actorId: string,
    checkoutId: string,
    newPersonInChargeId: string,
  ): Promise<void> {
    const role = await this.getActorRole(actorId);
    if (!roleIsAtLeast(role, "editor")) {
      throw new ServiceError(
        "permission_denied",
        "reassign person in charge requires editor or above",
      );
    }

    const c = await this.coRepo.getCheckout(checkoutId);
    if (!c) {
      throw new ServiceError("not_found", `checkout not found: ${checkoutId}`);
    }
    if (c.status !== "active") {
      throw new ServiceError(
        "invalid_state",
        `reassign requires active checkout (status: ${c.status})`,
      );
    }

    if (newPersonInChargeId === c.personInChargeId) {
      return; // 冪等: 同じ担当者への再任命は no-op で成功
    }

    if (!(await this.userRepo.getUser(newPersonInChargeId))) {
      throw new ServiceError(
        "not_found",
        `new person in charge not found: ${newPersonInChargeId}`,
      );
    }

    // checkedOutById は変更しない（操作履歴として保持）
    // 紐づく招待も維持（仕様: 担当者変更で招待は剥奪されない）
    await this.coRepo.saveCheckout({
      ...c,
      personInChargeId: newPersonInChargeId,
      updatedAt: this.nowFn().toISOString(),
    });
  }

  async recordVisit(
    actorId: string,
    checkoutId: string,
    placeId: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord> {
    const c = await this.coRepo.getCheckout(checkoutId);
    if (!c) {
      throw new ServiceError("not_found", `checkout not found: ${checkoutId}`);
    }

    if (c.status !== "active") {
      throw new ServiceError(
        "invalid_state",
        `checkout ${checkoutId} is not active`,
      );
    }

    return this.saveVisitWithOptionalRequest(
      actorId,
      c.areaId,
      checkoutId,
      placeId,
      result,
      visitedAt,
      applicationText,
    );
  }

  async recordVisitAdHoc(
    actorId: string,
    areaId: string,
    placeId: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord> {
    if (areaId === "") {
      throw new ServiceError(
        "invalid_input",
        "areaId is required for ad-hoc visit recording",
      );
    }
    return this.saveVisitWithOptionalRequest(
      actorId,
      areaId,
      "",
      placeId,
      result,
      visitedAt,
      applicationText,
    );
  }

  private async saveVisitWithOptionalRequest(
    actorId: string,
    areaId: string,
    checkoutId: string,
    placeId: string,
    result: VisitResult,
    visitedAt: string,
    applicationText: string,
  ): Promise<VisitRecord> {
    if (visitResultRequiresApplication(result) && applicationText === "") {
      throw new ServiceError(
        "invalid_input",
        `applicationText is required for visit result "${result}"`,
      );
    }

    const nowIso = this.nowFn().toISOString();
    const vr: VisitRecord = {
      id: newId("vr"),
      userId: actorId,
      placeId,
      coord: null,
      areaId,
      checkoutId,
      result,
      appliedRequestId: null,
      visitedAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (visitResultRequiresApplication(result)) {
      const req: Request = {
        id: newId("req"),
        type: requestTypeForVisitResult(result),
        status: "pending",
        submitterId: actorId,
        areaId,
        placeId,
        coord: null,
        description: applicationText,
        createdAt: nowIso,
        resolvedAt: null,
        resolvedBy: "",
      };
      await this.notifRepo.saveRequest(req);
      vr.appliedRequestId = req.id;
    }

    await this.coRepo.saveVisitRecord(vr);
    return vr;
  }

  // --- Invite / RevokeInvite / ListInvitations ---

  async invite(
    actorId: string,
    checkoutId: string,
    inviteeId: string,
    ttlMs: number,
  ): Promise<CheckoutInvitation> {
    if (ttlMs < 0) {
      throw new ServiceError("invalid_input", "ttl must be non-negative");
    }
    if (ttlMs === 0) {
      ttlMs = DEFAULT_CHECKOUT_INVITE_TTL_MS;
    }

    const c = await this.coRepo.getCheckout(checkoutId);
    if (!c) {
      throw new ServiceError("not_found", `checkout not found: ${checkoutId}`);
    }
    if (c.status !== "active") {
      throw new ServiceError(
        "invalid_state",
        `invite requires active checkout (status: ${c.status})`,
      );
    }

    // 招待者の権限チェック: editor+ または当該チェックアウトの現担当者
    const actorRole = await this.getActorRole(actorId);
    if (!roleIsAtLeast(actorRole, "editor") && actorId !== c.personInChargeId) {
      throw new ServiceError(
        "permission_denied",
        "invite requires editor or current checkout person in charge",
      );
    }

    // 被招待者の検証
    if (inviteeId === c.personInChargeId) {
      throw new ServiceError(
        "invalid_input",
        "cannot invite the person in charge themselves",
      );
    }
    const invitee = await this.userRepo.getUser(inviteeId);
    if (!invitee) {
      throw new ServiceError("not_found", `invitee not found: ${inviteeId}`);
    }
    if (invitee.role !== "member") {
      throw new ServiceError(
        "invalid_input",
        "invitee must be a member (editors/admins already have full access)",
      );
    }

    const now = this.nowFn();
    const newExpiresAt = new Date(now.getTime() + ttlMs).toISOString();

    // 既存の有効な招待があれば期限延長（上書き）
    const existing = await this.coRepo.getCheckoutInvitationByPair(
      checkoutId,
      inviteeId,
    );
    if (existing && checkoutInvitationIsActive(existing, now)) {
      const extended = { ...existing, expiresAt: newExpiresAt };
      await this.coRepo.saveCheckoutInvitation(extended);
      await this.notifyAreaInvite(extended);
      return extended;
    }

    const inv: CheckoutInvitation = {
      id: newId("inv"),
      checkoutId,
      inviteeId,
      inviterId: actorId,
      expiresAt: newExpiresAt,
      revokedAt: null,
      createdAt: now.toISOString(),
    };
    await this.coRepo.saveCheckoutInvitation(inv);
    await this.notifyAreaInvite(inv);
    return inv;
  }

  async revokeInvite(actorId: string, invitationId: string): Promise<void> {
    const inv = await this.coRepo.getCheckoutInvitation(invitationId);
    if (!inv) {
      throw new ServiceError(
        "not_found",
        `invitation not found: ${invitationId}`,
      );
    }
    if (inv.revokedAt !== null) {
      throw new ServiceError(
        "invalid_state",
        `invitation ${invitationId} is already revoked`,
      );
    }

    const c = await this.coRepo.getCheckout(inv.checkoutId);
    if (!c) {
      throw new ServiceError(
        "not_found",
        `checkout not found: ${inv.checkoutId}`,
      );
    }

    const actorRole = await this.getActorRole(actorId);
    // 取消可能: 招待者本人 / 現担当者 / editor+
    if (
      actorId !== inv.inviterId &&
      actorId !== c.personInChargeId &&
      !roleIsAtLeast(actorRole, "editor")
    ) {
      throw new ServiceError(
        "permission_denied",
        "revoke requires inviter, current person in charge, or editor",
      );
    }

    await this.coRepo.saveCheckoutInvitation({
      ...inv,
      revokedAt: this.nowFn().toISOString(),
    });
  }

  async listInvitations(checkoutId: string): Promise<CheckoutInvitation[]> {
    return this.coRepo.listCheckoutInvitations(checkoutId);
  }

  /** 当該チェックアウトに紐づく未失効の招待をすべて失効させる（Return / ForceReturn から呼ぶ）。 */
  private async cascadeRevokeInvitations(
    checkoutId: string,
    atIso: string,
  ): Promise<void> {
    const invs = await this.coRepo.listCheckoutInvitations(checkoutId);
    for (const inv of invs) {
      if (inv.revokedAt !== null) continue; // 既に取消済み
      await this.coRepo.saveCheckoutInvitation({ ...inv, revokedAt: atIso });
    }
  }

  /**
   * 被招待者へ区域招待通知を発行する（発行時のみ通知）。
   * 仕様 docs/wants/07_通知と申請.md「区域招待: 発行時のみ被招待者のマイページに通知」
   */
  private async notifyAreaInvite(inv: CheckoutInvitation): Promise<void> {
    const n: Notification = {
      id: newId("ntf"),
      type: "area_invite",
      targetId: inv.inviteeId,
      referenceId: inv.id,
      message: "",
      read: false,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    };
    try {
      // 通知の保存失敗は握りつぶす（招待自体は成立しているため）
      await this.notifRepo.saveNotification(n);
    } catch {
      // ignore
    }
  }

  // --- アクセスモード判定 ---

  async areaAccessMode(userId: string, areaId: string): Promise<AccessMode> {
    // 1. 自分が担当者として active チェックアウトを持っているか
    const active = await this.coRepo.getActiveCheckout(areaId);
    if (
      active &&
      active.personInChargeId === userId &&
      active.status === "active"
    ) {
      return "editable";
    }

    // 2. 有効な招待を保有しているか（同区域に対するもの）
    const invs =
      await this.coRepo.listActiveCheckoutInvitationsForInvitee(userId);
    const now = this.nowFn();
    for (const inv of invs) {
      if (!checkoutInvitationIsActive(inv, now)) continue;
      const c = await this.coRepo.getCheckout(inv.checkoutId);
      if (!c || c.status !== "active") continue;
      if (c.areaId === areaId) {
        return "editable";
      }
    }

    // 3. 上記いずれにも該当しない → read_only
    //    editor+ は閲覧可（入力には自己チェックアウトが必要）、活動メンバーは UI 側で非表示の前提
    return "read_only";
  }

  async placeAccessMode(
    _userId: string,
    _placeId: string,
  ): Promise<AccessMode> {
    // 仕様 docs/wants/05_チェックアウト.md「アクセスモード > 場所レベル」:
    // 「現フェーズではモデルとデータ構造として用意し、UI からの read-only 切替操作は未実装」
    // したがって判定 API は常に editable を返す。
    return "editable";
  }

  async listAccessibleAreas(userId: string): Promise<AccessibleArea[]> {
    const result: AccessibleArea[] = [];
    const seenCheckouts = new Set<string>(); // 担当者でも被招待者でもある場合の重複排除

    // 担当者として active なチェックアウトを持つ区域
    const owned =
      await this.coRepo.listActiveCheckoutsForPersonInCharge(userId);
    for (const c of owned) {
      result.push({
        areaId: c.areaId,
        checkoutId: c.id,
        role: "person_in_charge",
        inviteExpiresAt: null,
      });
      seenCheckouts.add(c.id);
    }

    // 有効な招待を保有しているチェックアウトの区域
    const invs =
      await this.coRepo.listActiveCheckoutInvitationsForInvitee(userId);
    const now = this.nowFn();
    for (const inv of invs) {
      if (!checkoutInvitationIsActive(inv, now)) continue;
      if (seenCheckouts.has(inv.checkoutId)) continue; // 担当者として既に計上済み
      const c = await this.coRepo.getCheckout(inv.checkoutId);
      if (!c || c.status !== "active") continue;
      result.push({
        areaId: c.areaId,
        checkoutId: c.id,
        role: "invitee",
        inviteExpiresAt: inv.expiresAt,
      });
      seenCheckouts.add(c.id);
    }

    return result;
  }
}

/** 申請を伴う訪問ステータスから対応する RequestType を返す。 */
function requestTypeForVisitResult(result: VisitResult): RequestType {
  switch (result) {
    case "vacant_abandoned":
      return "map_update";
    case "refused":
      return "do_not_visit";
    default:
      throw new ServiceError(
        "invalid_input",
        `visit result "${result}" does not require an application`,
      );
  }
}
