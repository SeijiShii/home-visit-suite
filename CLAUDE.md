# Home Visit Suite

## 仕様書
- `docs/wants.md` に全仕様を記載済み

## 技術決定
- **管理・編集スタッフ向けアプリ**: Wails (Go + Web Frontend)
  - Go側: LinkSelf統合、ビジネスロジック、データ管理
  - Web側: 地図UI（map-polygon-editor/TypeScript）、フロントエンド全般
  - Electronは不採用（Go実装のLinkSelfにサイドカーが必要になるため）
- **活動スタッフ向けアプリ**: モバイルネイティブ（iOS/Android）- 技術選定未了
- **データインフラ**: LinkSelf（Go実装、サーバーレスP2P）
  - https://github.com/SeijiShii/link-self
- **地図**: GSIタイル（日本）、map-polygon-editor（TypeScript実装）でポリゴン編集

## 用語
- 区域 = 運用上の最小単位（旧称: 枝番）
- 区域親番 = 枝番の集合としての上位概念（旧称: 区域）
- 識別子形式: `領域-区域親番-区域` 例: `NRT-001-05`
