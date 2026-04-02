// Package linkself はLinkSelfとの統合層を提供する。
// link-selfコアライブラリをラップし、home-visit-suite固有のデータ同期を行う。
package linkself

import (
	"context"
	"fmt"
	"time"

	ls "github.com/SeijiShii/link-self/core/pkg/linkself"
)

const SuiteID = "jp.home-visit-suite"

// Service はLinkSelfクライアントのライフサイクルを管理する。
type Service struct {
	client ls.Client
	db     ls.MyDB
}

// NewService は新しいServiceを生成する。
func NewService() *Service {
	return &Service{client: ls.NewClient()}
}

// Start はLinkSelfノードを起動し、スキーマとSyncScopeを設定する。
func (s *Service) Start(ctx context.Context) (*ls.NodeInfo, error) {
	config := ls.Config{
		SuiteID: SuiteID,
		Roles: ls.RoleDefs{
			"member": {},
			"editor": {Includes: []string{"member"}},
			"admin":  {Includes: []string{"editor"}},
		},
		AdminRole: "admin",
		ChangeLogRetention: &ls.ChangeLogRetention{
			Mode:     ls.TimeBasedRetention,
			Duration: 30 * 24 * time.Hour,
		},
	}

	info, err := s.client.Start(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("start linkself: %w", err)
	}
	s.db = s.client.MyDB()

	if err := s.db.Migrate(ctx, AllMigrations); err != nil {
		s.client.Stop(ctx)
		return nil, fmt.Errorf("migrate: %w", err)
	}

	if err := s.setupSyncScopes(ctx); err != nil {
		s.client.Stop(ctx)
		return nil, fmt.Errorf("setup sync scopes: %w", err)
	}

	return info, nil
}

// Stop はLinkSelfノードを停止する。
func (s *Service) Stop(ctx context.Context) error {
	return s.client.Stop(ctx)
}

// DB はMyDBインスタンスを返す。
func (s *Service) DB() ls.MyDB { return s.db }

// Client はLinkSelfクライアントを返す。
func (s *Service) Client() ls.Client { return s.client }

func (s *Service) setupSyncScopes(ctx context.Context) error {
	for _, t := range NetworkTables {
		if err := s.db.SetSyncScope(ctx, t, ls.ScopeNetwork); err != nil {
			return fmt.Errorf("set scope network for %s: %w", t, err)
		}
	}
	for _, t := range DeviceTables {
		if err := s.db.SetSyncScope(ctx, t, ls.ScopeDevice); err != nil {
			return fmt.Errorf("set scope device for %s: %w", t, err)
		}
	}
	return nil
}
