// Package repository はリポジトリインターフェースの各種実装を提供する。
// このファイルはLinkSelf MyDBを使ったリポジトリの共通基盤を定義する。
package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	ls "github.com/SeijiShii/link-self/core/pkg/linkself"
)

// LinkSelfRepository はLinkSelf MyDBを使ったリポジトリ共通基盤。
type LinkSelfRepository struct {
	db  ls.MyDB
	ctx context.Context
}

// NewLinkSelfRepository は新しいLinkSelfRepositoryを生成する。
func NewLinkSelfRepository(db ls.MyDB) *LinkSelfRepository {
	return &LinkSelfRepository{db: db, ctx: context.Background()}
}

// Region はRegionRepository実装を返す。
func (r *LinkSelfRepository) Region() *LinkSelfRegionRepo {
	return &LinkSelfRegionRepo{r}
}

// User はUserRepository実装を返す。
func (r *LinkSelfRepository) User() *LinkSelfUserRepo {
	return &LinkSelfUserRepo{r}
}

// Activity はActivityRepository実装を返す。
func (r *LinkSelfRepository) Activity() *LinkSelfActivityRepo {
	return &LinkSelfActivityRepo{r}
}

// Coverage はCoverageRepository実装を返す。
func (r *LinkSelfRepository) Coverage() *LinkSelfCoverageRepo {
	return &LinkSelfCoverageRepo{r}
}

// Notification はNotificationRepository実装を返す。
func (r *LinkSelfRepository) Notification() *LinkSelfNotificationRepo {
	return &LinkSelfNotificationRepo{r}
}

// Place はPlaceRepository実装を返す。
func (r *LinkSelfRepository) Place() *LinkSelfPlaceRepo {
	return &LinkSelfPlaceRepo{r}
}

// Personal はPersonalRepository実装を返す。
func (r *LinkSelfRepository) Personal() *LinkSelfPersonalRepo {
	return &LinkSelfPersonalRepo{r}
}

// Map はMapRepository実装を返す。
func (r *LinkSelfRepository) Map() *LinkSelfMapRepo {
	return &LinkSelfMapRepo{r}
}

// --- ヘルパー関数 ---

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func formatTime(t time.Time) string {
	return t.Format(time.RFC3339)
}

func formatTimePtr(t *time.Time) sql.NullString {
	if t == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: t.Format(time.RFC3339), Valid: true}
}

func parseTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}

func parseTimePtr(ns sql.NullString) *time.Time {
	if !ns.Valid {
		return nil
	}
	t, err := time.Parse(time.RFC3339, ns.String)
	if err != nil {
		return nil
	}
	return &t
}

func marshalJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func nullableJSON(v any) sql.NullString {
	if v == nil {
		return sql.NullString{}
	}
	b, _ := json.Marshal(v)
	s := string(b)
	if s == "null" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
