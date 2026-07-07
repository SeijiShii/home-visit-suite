// チェックアウト可能期間（AvailablePeriod）のドメインモデル。
// チェックアウトの親概念であり、活動戦略として「いつ・どの範囲を活動対象にするか」を定義する。
// 仕様: docs/wants/06_網羅管理.md「チェックアウト可能期間（AvailablePeriod）」
// 参照実装: shared/domain/models/available_period.go

import { HEX_COLOR_RE } from "./color";

/** AvailablePeriod のフェーズ。startDate / endDate と現在時刻の関係から機械的に決まる。 */
export type AvailablePeriodPhase = "pending" | "active" | "closed";

export interface AvailablePeriod {
  id: string;
  name: string;
  /** ISO 8601 */
  startDate: string;
  /** ISO 8601 */
  endDate: string;
  /** 対象区域親番リスト */
  parentAreaIds: string[];
  /** AvailablePeriodTag への参照 */
  tagIds: string[];
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/**
 * 基本制約を検証し、不正なら英語のエラーメッセージを返す（正常時は null）。
 * 期間重複・編集制約は呼び出し側で別途検証する。
 */
export function validateAvailablePeriod(p: AvailablePeriod): string | null {
  const n = [...p.name].length;
  if (n === 0) {
    return "available period name must not be empty";
  }
  if (n > 100) {
    return `available period name must be 100 characters or fewer (got ${n})`;
  }
  if (new Date(p.endDate).getTime() < new Date(p.startDate).getTime()) {
    return "available period endDate must not be before startDate";
  }
  return null;
}

/** now が AvailablePeriod の活動期間（startDate <= now <= endDate）に含まれるかを返す。 */
export function availablePeriodIsActive(p: AvailablePeriod, now: Date): boolean {
  const t = now.getTime();
  return t >= new Date(p.startDate).getTime() && t <= new Date(p.endDate).getTime();
}

/** now 時点のフェーズを返す。 */
export function availablePeriodPhase(p: AvailablePeriod, now: Date): AvailablePeriodPhase {
  const t = now.getTime();
  if (t < new Date(p.startDate).getTime()) {
    return "pending";
  }
  if (t > new Date(p.endDate).getTime()) {
    return "closed";
  }
  return "active";
}

/**
 * 他の期間と時間的に重複するかを返す（両端を含む閉区間として判定）。
 * 同時に複数の AvailablePeriod がアクティブになることを許さないため、
 * 接する境界（一方の endDate と他方の startDate が一致する）も重複扱いとする。
 */
export function availablePeriodsOverlap(a: AvailablePeriod, b: AvailablePeriod): boolean {
  return (
    new Date(a.endDate).getTime() >= new Date(b.startDate).getTime() &&
    new Date(b.endDate).getTime() >= new Date(a.startDate).getTime()
  );
}

/**
 * AvailablePeriod を分類するためのタグ。
 * メンバータグとは別概念（混用しない）。
 * 仕様: docs/wants/06_網羅管理.md「AvailablePeriodTag（専用タグ）」
 */
export interface AvailablePeriodTag {
  id: string;
  name: string;
  color: string;
}

/**
 * タグの入力値を検証し、不正なら英語のエラーメッセージを返す（正常時は null）。
 * - Name が空でないこと
 * - Name が 16 文字（コードポイント）以内であること
 * - Color が空か、#rrggbb 形式であること
 */
export function validateAvailablePeriodTag(tag: AvailablePeriodTag): string | null {
  const n = [...tag.name].length;
  if (n === 0) {
    return "available period tag name must not be empty";
  }
  if (n > 16) {
    return `available period tag name must be 16 characters or fewer (got ${n})`;
  }
  if (tag.color !== "" && !HEX_COLOR_RE.test(tag.color)) {
    return `available period tag color must be empty or a valid #rrggbb hex color (got "${tag.color}")`;
  }
  return null;
}
