package main

import (
	"context"

	"github.com/SeijiShii/home-visit-suite/shared/linkself"
)

// App はWailsアプリケーションのライフサイクルを管理する。
type App struct {
	ctx       context.Context
	lsService *linkself.Service
}

func NewApp(lsService *linkself.Service) *App {
	return &App{lsService: lsService}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	if a.lsService != nil {
		a.lsService.Stop(ctx)
	}
}
