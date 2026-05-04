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

WSL2 では同梱の起動スクリプトを使う（依存チェック・webkit2gtk-4.1 タグ・`HVS_DEV=1` を自動セット）：

```bash
cd desktop
./dev.sh
```

`HVS_DEV=1` で起動すると設定画面に「アイデンティティ切替（開発用）」セクションが表示され、シードユーザー（admin/editor/member）の視点で UI を検証できる。

`make dev` でもホットリロードは動作するが、dev 用 UI は `HVS_DEV` を明示する必要がある。

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
│   │   ├── pages/         # 画面（ダッシュボード / 区域編集 / 領域管理 /
│   │   │   #              メンバー管理 / チェックアウト管理 / 網羅管理 /
│   │   │   #              申請管理 / 訪問記録 / 設定）
│   │   ├── components/    # 共通コンポーネント（InviteDialog 等）
│   │   ├── contexts/      # React Context（I18n / Identity / Tips）
│   │   └── i18n/          # フロントエンド i18n（ja/en）
│   ├── dev.sh             # WSL2 用起動スクリプト（HVS_DEV=1 既定）
│   └── Makefile
└── docs/wants/         # 単一のソース・オブ・トゥルース（仕様書）
```
