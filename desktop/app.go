package main

import (
	"context"
)

// App はWailsアプリケーションのライフサイクルを管理する。
type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// TODO: LinkSelf接続初期化
}

func (a *App) shutdown(ctx context.Context) {
	// TODO: LinkSelf切断
}
