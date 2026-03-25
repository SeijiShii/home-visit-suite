package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/testdata"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// データ保存ディレクトリ: ~/.home-visit-suite/data
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Fatalf("failed to get home directory: %v", err)
	}
	dataDir := filepath.Join(homeDir, ".home-visit-suite", "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("failed to create data directory: %v", err)
	}

	repo, err := repository.NewJSONFileRepository(dataDir)
	if err != nil {
		log.Fatalf("failed to initialize repository: %v", err)
	}

	// ユーザー・グループ管理用リポジトリ（開発中: InMemory + シードデータ）
	seedRepos := testdata.NewInMemoryRepos()
	if err := testdata.SeedAll(seedRepos); err != nil {
		log.Fatalf("failed to seed data: %v", err)
	}

	app := NewApp()
	regionBinding := binding.NewRegionBinding(repo)
	mapBinding, err := binding.NewMapBinding(dataDir)
	if err != nil {
		log.Fatalf("failed to initialize map binding: %v", err)
	}
	userBinding := binding.NewUserBinding(seedRepos.User)

	err = wails.Run(&options.App{
		Title:  "Home Visit",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
			regionBinding,
			mapBinding,
			userBinding,
		},
	})

	if err != nil {
		log.Fatalf("Error: %v", err)
	}
}
