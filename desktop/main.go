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
	"github.com/SeijiShii/home-visit-suite/shared/testdata"
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

	// 開発用: ユーザーが自分だけならダミーデータを投入
	if users, _ := userRepo.ListUsers(); len(users) <= 1 {
		seedRepos := testdata.NewLinkSelfRepos(repo)
		if err := testdata.SeedAll(seedRepos); err != nil {
			log.Printf("seed failed: %v", err)
		} else {
			log.Println("Dummy data seeded")
		}
	}

	app := NewApp(lsService)
	regionBinding := binding.NewRegionBinding(repo.Region())
	mapBinding := binding.NewMapBinding(repo.Map())
	userBinding := binding.NewUserBinding(repo.User())
	settingsBinding := binding.NewSettingsBinding(repo.Personal())

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
			settingsBinding,
		},
	})

	if err != nil {
		log.Fatalf("Error: %v", err)
	}
}
