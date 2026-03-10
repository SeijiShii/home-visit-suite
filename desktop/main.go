package main

import (
	"embed"

	"github.com/SeijiShii/home-visit-suite/desktop/internal/binding"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	regionBinding := binding.NewRegionBinding()
	mapBinding := binding.NewMapBinding()

	err := wails.Run(&options.App{
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
		println("Error:", err.Error())
	}
}
