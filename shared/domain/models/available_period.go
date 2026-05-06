package models

import (
	"fmt"
	"time"
	"unicode/utf8"
)

// AvailablePeriodPhase は AvailablePeriod のフェーズを表す。
// startDate / endDate と現在時刻の関係から機械的に決まる。
type AvailablePeriodPhase string

const (
	AvailablePeriodPhasePending AvailablePeriodPhase = "pending" // 開始前
	AvailablePeriodPhaseActive  AvailablePeriodPhase = "active"  // 活動中
	AvailablePeriodPhaseClosed  AvailablePeriodPhase = "closed"  // 終了済み
)

// AvailablePeriod はチェックアウト可能期間。
// チェックアウトの親概念であり、活動戦略として「いつ・どの範囲を活動対象にするか」を定義する。
// 仕様 docs/wants/06_網羅管理.md「チェックアウト可能期間（AvailablePeriod）」
type AvailablePeriod struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	StartDate     time.Time `json:"startDate"`
	EndDate       time.Time `json:"endDate"`
	ParentAreaIDs []string  `json:"parentAreaIds"` // 対象区域親番リスト
	TagIDs        []string  `json:"tagIds"`        // AvailablePeriodTag への参照
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// Validate は基本制約を検証する。期間重複・編集制約は呼び出し側で別途検証する。
func (p AvailablePeriod) Validate() error {
	n := utf8.RuneCountInString(p.Name)
	if n == 0 {
		return fmt.Errorf("available period name must not be empty")
	}
	if n > 100 {
		return fmt.Errorf("available period name must be 100 characters or fewer (got %d)", n)
	}
	if p.EndDate.Before(p.StartDate) {
		return fmt.Errorf("available period endDate must not be before startDate")
	}
	return nil
}

// IsActive は now が AvailablePeriod の活動期間（startDate <= now <= endDate）に含まれるかを返す。
func (p AvailablePeriod) IsActive(now time.Time) bool {
	return !now.Before(p.StartDate) && !now.After(p.EndDate)
}

// Phase は now 時点のフェーズを返す。
func (p AvailablePeriod) Phase(now time.Time) AvailablePeriodPhase {
	if now.Before(p.StartDate) {
		return AvailablePeriodPhasePending
	}
	if now.After(p.EndDate) {
		return AvailablePeriodPhaseClosed
	}
	return AvailablePeriodPhaseActive
}

// Overlaps は他の期間と時間的に重複するかを返す（両端を含む閉区間として判定）。
// 同時に複数の AvailablePeriod がアクティブになることを許さないため、
// 接する境界（一方の endDate と他方の startDate が一致する）も重複扱いとする。
func (p AvailablePeriod) Overlaps(other AvailablePeriod) bool {
	return !p.EndDate.Before(other.StartDate) && !other.EndDate.Before(p.StartDate)
}

// AvailablePeriodTag は AvailablePeriod を分類するためのタグ。
// メンバータグとは別概念（混用しない）。
// 仕様 docs/wants/06_網羅管理.md「AvailablePeriodTag（専用タグ）」
type AvailablePeriodTag struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// Validate はタグの入力値を検証する。
// - Name が空でないこと
// - Name が 16 ルーン以内であること
// - Color が空か、#rrggbb 形式であること
func (t AvailablePeriodTag) Validate() error {
	n := utf8.RuneCountInString(t.Name)
	if n == 0 {
		return fmt.Errorf("available period tag name must not be empty")
	}
	if n > 16 {
		return fmt.Errorf("available period tag name must be 16 characters or fewer (got %d)", n)
	}
	if t.Color != "" && !hexColorRe.MatchString(t.Color) {
		return fmt.Errorf("available period tag color must be empty or a valid #rrggbb hex color (got %q)", t.Color)
	}
	return nil
}
