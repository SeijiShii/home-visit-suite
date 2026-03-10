# HOME-VISIT-SUITE

## 概要

グループまたは会社組織として戸別訪問活動を行うためのアプリスイートです。

## アプリ構成

- **管理・編集スタッフ向けアプリ** (`desktop/`) — Wails (Go + TypeScript)
- **活動スタッフ向けアプリ** (`mobile/`) — モバイルネイティブ（技術選定中）
- **共有コア** (`shared/`) — Go（ドメインモデル・ビジネスロジック）

## 前提条件

- Go 1.24+
- Node.js 18+
- libwebkit2gtk-4.1-dev（Ubuntu/Debian: `sudo apt install libwebkit2gtk-4.1-dev`）
- libgtk-3-dev（Ubuntu/Debian: `sudo apt install libgtk-3-dev`）
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

## デスクトップアプリの起動

### ビルド＆実行

```bash
cd desktop
make build
./build/bin/home-visit-suite
```

### 開発モード（ホットリロード）

```bash
cd desktop
make dev
```

### 手動でコマンドを実行する場合

Ubuntu 24.04 では webkit2gtk-4.1 のビルドタグが必要です：

```bash
cd desktop
wails build -tags webkit2_41
./build/bin/home-visit-suite
```

## ディレクトリ構成

```
home-visit-suite/
├── shared/              # 共有Goコア（モバイルとも共有）
│   ├── domain/          # ドメインモデル
│   ├── service/         # ビジネスロジック（インターフェース）
│   ├── locale/          # Go側 i18n（ja/en）
│   └── linkself/        # LinkSelf統合層
├── desktop/             # Wailsデスクトップアプリ
│   ├── internal/binding/  # フロントエンド向けAPI
│   ├── frontend/src/      # TypeScript UI
│   │   ├── pages/         # 画面（6ページ）
│   │   └── i18n/          # フロントエンド i18n（ja/en）
│   └── Makefile
└── docs/                # 仕様書
```
