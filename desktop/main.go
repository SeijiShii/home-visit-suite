package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
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

	app := NewApp()
	regionBinding := binding.NewRegionBinding(repo)
	mapBinding := binding.NewMapBinding()

	err = wails.Run(&options.App{
		Title:  "Home Visit Suite",
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
		},
	})

	if err != nil {
		log.Fatalf("Error: %v", err)
	}
}
