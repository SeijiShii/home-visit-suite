package main

import (
	"context"
	"embed"
	"log"
	"time"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/SeijiShii/home-visit-suite/shared/domain/models"
	"github.com/SeijiShii/home-visit-suite/shared/domain/repository"
	"github.com/SeijiShii/home-visit-suite/shared/linkself"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	ctx := context.Background()

	// LinkSelf起動
	lsService := linkself.NewService()
	info, err := lsService.Start(ctx)
	if err != nil {
		log.Fatalf("failed to start LinkSelf: %v", err)
	}
	log.Printf("LinkSelf started: DID=%s", info.DID)

	// リポジトリ生成（全てLinkSelf MyDB経由）
	repo := repository.NewLinkSelfRepository(lsService.DB())

	// 初回起動: 自分自身をadminとして登録
	userRepo := repo.User()
	if _, err := userRepo.GetUser(info.DID); err != nil {
		if err := userRepo.SaveUser(&models.User{
			ID:       info.DID,
			Name:     "自分",
			Role:     models.RoleAdmin,
			JoinedAt: time.Now(),
		}); err != nil {
			log.Fatalf("failed to register self: %v", err)
		}
		log.Printf("Registered self as admin: %s", info.DID)
	}

	app := NewApp(lsService)
	regionBinding := binding.NewRegionBinding(repo.Region())
	mapBinding := binding.NewMapBinding(repo.Map())
	userBinding := binding.NewUserBinding(repo.User())

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
