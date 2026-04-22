# LinkSelf 拡張要望（モバイル対応）

Home Visit Suite 活動メンバー向けアプリ（iOS/Android ネイティブ）を実装するために、LinkSelf 側に必要となる機能追加・変更事項をまとめる。

本ドキュメントは **LinkSelf リポジトリ（`github.com/SeijiShii/link-self`）への提案書**の原稿であり、LinkSelf 側に手動で転記・加筆した上で LinkSelf 側の仕様書・ロードマップに取り込む。

- 転記先候補: `link-self/docs/spec/mobile-support.md`（新規）
- 関連する既存仕様: `link-self/docs/spec/overview.md`, `phase1-design.md`, `network-concept.md`

---

## 1. 背景

- Home Visit Suite は管理・編集用のデスクトップアプリ（Wails）と、活動メンバー用のモバイルアプリ（iOS/Android）の 2 系統で構成される
- 両アプリともデータ永続化・同期は LinkSelf を共通基盤として使用する
- デスクトップ側は既に LinkSelf を Go から直接利用する実装が進んでいるが、モバイル側は LinkSelf をモバイル環境に組み込む必要がある
- 技術方針: **Expo (React Native) + gomobile** で `link-self/core/pkg/linkself` を iOS/Android 双方に組み込む
- 参考先例: **Berty**（go-libp2p を iOS/Android で App Store/Play Store 配信している実装事例）

## 2. 前提制約

### モバイル OS のバックグラウンド制約

| OS | 制約 |
|----|------|
| iOS | アプリが背面に回ると約 30 秒で suspend、socket 強制切断、コード実行停止。`voip` / `audio` / `location` / `background-fetch` 等の Background Mode 宣言で部分的に延命可能だが、P2P 常時接続目的での許可は App Store 審査で困難 |
| Android | Doze Mode / App Standby により不定期に通信・CPU が制限される。iOS よりは緩いが、無制限ではない |

### Home Visit Suite のユースケース上の前提

- 活動メンバーは訪問活動中にアプリを前景で操作する
- バックグラウンドでの常時同期は**不要**（次回起動時の差分同期で十分）
- したがって LinkSelf も **「前景起動時に高速に同期完了 → 背面遷移で graceful stop」** というライフサイクルを想定できれば足りる

## 3. 要求事項

優先度: **必須** = モバイル対応の前提として必要、**推奨** = UX 上望ましい、**将来** = 次フェーズ以降。

### 3.1 必須

#### 3.1.1 gomobile 向けファサード API

- **現状**: `pkg/linkself/types.go` の `Client` / `MyDB` / `NetworkAPI` / `SharedDB` 等のインタフェースは `context.Context`, `...any`, `interface{}`, func 型引数（`SetOnMessage`）などを多用しており、gomobile bind の制約（interface / channel / func 型 / 可変長 `any` をそのまま export 不可）に抵触する
- **要望**: `pkg/linkself/mobile`（仮）のような**モバイル専用ファサード層**を追加し、以下を満たす:
  - 引数・戻り値は struct + 基本型（string, int64, []byte, bool）のみ
  - context は内部で管理（タイムアウト値を引数で受け取る）
  - 可変長引数・interface{} は使用しない（`Exec`/`Query` は JSON 文字列でパラメータを受け取る等）
  - コールバックは function 型ではなく **Observer/Listener インタフェース**経由で受ける（gomobile は Go インタフェースを Objective-C/Java 側で実装可能）
- **影響範囲**: `pkg/linkself/` のみ（internal パッケージには変更不要）

#### 3.1.2 Foreground / Background ライフサイクル API

- **要望**: モバイル側からアプリ状態を通知する以下の API を追加
  - `Pause(ctx)`: 背面遷移時に呼ぶ。peerstore・DHT routing table をディスクに flush、アクティブな接続を graceful close、同期中タスクを中断可能な状態で保存
  - `Resume(ctx)`: 前景復帰時に呼ぶ。保存された peerstore から既知ピアに直接再接続、差分同期を即座に開始
- **理由**: iOS の場合、30 秒以内に graceful shutdown しないと強制 suspend され socket 半開き状態で次回起動することになる。ディスクに flush しておかないと再接続コストが毎回満額かかる

#### 3.1.3 高速起動モード

- **現状**: `Start()` 内部で DHT full bootstrap（bootstrap peers へ接続 → kad-dht の routing table 充填）を行うため、コールドスタートから同期可能状態まで数秒〜十数秒かかる想定
- **要望**: `Config` に以下を追加
  - `FastStart bool`: 起動時の DHT full bootstrap をスキップし、前回保存の peerstore / routing table を起点に既知ピアへ直接接続
  - `KnownPeerHints []string`: 既知ピア（他デバイス・チームメンバー）の multiaddr を外部から注入可能にする
- **理由**: モバイルで画面を開いてから同期結果が見えるまでの体感待ち時間を短縮する

#### 3.1.4 peerstore / routing table の永続化

- **要望**: libp2p の peerstore（DID ↔ multiaddr 対応表）および kad-dht の routing table を定期的にディスクへ永続化し、次回 `Start()` 時に復元する
- **保存先**: `<dataroot>/<encodedDID>/peerstore.db` 等の所定パス
- **理由**: `3.1.3` の前提

### 3.2 推奨

#### 3.2.1 Circuit Relay v2 ノード対応

- モバイルはキャリア NAT / モバイルキャリアの Carrier-Grade NAT 下に置かれることが多く、直接接続が成立しないケースが多い
- LinkSelf が Circuit Relay v2 をクライアント側で利用できるようにし、home-visit-suite 運用者がデスクトップ常時稼働ノードをリレーとして設定できる構成を推奨
- **要望**: `Config.CircuitRelays []string` のような設定項目を追加（既存 `BootstrapPeers` とは別枠として、明示的にリレー用途であることを示す）

#### 3.2.2 差分同期の優先度制御

- 前景起動時の短時間（〜数十秒）で**ユーザーに見える範囲**のデータを先に同期できることが UX 上重要
- **要望**: `MyDB` / `SharedDB` に「この画面で表示する範囲のデータから優先的に同期する」ようなヒントを渡す API（例: `SyncPreferTables([]string)` / `SyncPreferChannels([]string)`）
- 完全な優先キュー実装まで踏み込まず、**最低限「次回同期バッチで優先するテーブル/チャンネル集合」のヒントを受け付ける**だけでも可

#### 3.2.3 gomobile 対応の CI

- `link-self` リポジトリの CI に以下を追加することを推奨:
  - `gomobile bind -target=ios pkg/linkself/mobile` のビルドが通ることを検証
  - `gomobile bind -target=android pkg/linkself/mobile` のビルドが通ることを検証
- 依存パッケージ（quic-go / pion-webrtc）の cgo 事情により突発的に build が落ちる可能性があり、CI で早期検知したい

### 3.3 将来（本スコープ外・検討事項として記載）

#### 3.3.1 APNs / FCM 連携

- iOS バックグラウンドではサーバーからの Push 通知を起点にアプリを起こす必要がある
- LinkSelf は P2P を原則とするため直接的な Push サーバーは持たないが、**代理ノード（クラウド常駐ノード）が他メンバーのデータ変更を検知し APNs/FCM に転送**する構成が取り得る
- 本スコープでは「通知は画面を開いた時に差分同期で表示」方針としバックグラウンド通知は将来検討

#### 3.3.2 省電力モード

- Android Doze Mode / iOS Low Power Mode 時の通信頻度低減、同期間引き等
- 本スコープでは常時接続を想定しないため優先度低

## 4. マイルストーン案

| フェーズ | 内容 | 成果物 |
|---------|------|--------|
| M1: 机上調査 | go-libp2p のモバイル動作実績・Berty 事例を調査、ライフサイクル設計を固める | 本ドキュメントの更新 |
| M2: gomobile bind 試験 | 現状の `pkg/linkself` をそのまま gomobile で build してみて、落ちる箇所をリスト化 | ビルドログ・必要な API 変更の一覧 |
| M3: モバイル用ファサード実装 | `3.1.1` を実装、simulator 上で最小動作確認 | `pkg/linkself/mobile` の初版 |
| M4: ライフサイクル API | `3.1.2` `3.1.3` `3.1.4` を実装 | `Pause/Resume`, `FastStart`, peerstore 永続化 |
| M5: 実機 PoC | iOS 実機 + Android 実機でデスクトップノードと同期 | PoC アプリ・測定値（前景同期完了までの時間） |
| M6: Relay 運用 | `3.2.1` を実装、NAT 越え検証 | Circuit Relay v2 クライアント対応 |

## 5. 参考

- Berty — go-libp2p を iOS/Android で App Store/Play Store 配信している先例
  - https://berty.tech/blog/bluetooth-low-energy
- Briar — iOS 版を断念している事例（常時バックグラウンド通信が前提のため）
  - https://briarproject.org/how-it-works/
- gomobile 制約
  - https://pkg.go.dev/golang.org/x/mobile/cmd/gomobile

## 6. 本ドキュメントの扱い

- **本ドキュメントは home-visit-suite 側の要望をまとめた原稿**であり、LinkSelf 側の正式仕様になるわけではない
- 転記・加筆の上、LinkSelf 側で実装スコープ・優先度・API 署名が確定したら、home-visit-suite 側は**本ドキュメントを削除するか、LinkSelf 側仕様への参照のみに縮退させる**
