# CODEMAP — 仕様↔コード対応インデックス

**目的:** 仕様変更のたびにコードベースを全調査するコンテキスト消費を避けるためのナビゲーション索引。
「`docs/wants/NN` の仕様を変えたい → どのファイルを見ればよいか」を Grep せずに引く。

**使い方（AI/人間共通）:**
- 仕様変更に着手するとき、まず該当テーマ節だけを読み、記載ファイルへ直行する。全 Grep/Glob は原則しない。
- ここに載っていない挙動に触れて初めて探索する（＝索引の穴を見つけたら下記ルールで追記）。

**維持ルール（コード変更と同じコミットで更新する）:**
1. ファイルを**新規追加**したら、対応テーマ節に1行追記する。
2. ファイルの**責務が変わった**ら、その行の説明を直す。
3. ファイルを**削除/リネーム**したら、該当行も直す。
4. テーマをまたぐファイルは主テーマに載せ、`(→NN)` で従テーマを併記する。

> この索引は仕様の複製ではなくナビゲーション補助のため、CLAUDE.md「補助ドキュメントは作らない」方針の例外として維持する（詳細は CLAUDE.md 開発方針を参照）。
> パスは `pwa/src/` からの相対。テスト（`*.test.ts(x)`）は原則載せない。

---

## 01 共通基盤（データ構造/実行環境/DI/i18n/永続化基盤）
- `services/errors.ts` — サービス層の構造化エラー（ErrCode/ServiceError/isCode）
- `services/id.ts` — 単調増加カウンタ併用のエンティティID生成
- `services/test-fixture.ts` — サービス層テスト用の共通フィクスチャ
- `services/settings-service.ts` — ロケール/Tips/AIプロバイダ/モデル/APIキー/取込同意など個人設定と定数 (→03)
- `services/settings-binding-adapter.ts` — SettingsBindingAPI を PersonalRepository 上に実装する設定永続化アダプタ
- `contexts/ServicesContext.tsx` — リポジトリ/サービス群をアプリ全体へ配線する DI コンテキスト
- `contexts/I18nContext.tsx` — ロケール選択/翻訳と永続化ストア注入の i18n コンテキスト
- `contexts/TipsContext.tsx` — 操作ヒント(Tips)の表示キュー制御と非表示状態の永続化 (→10)
- `components/Layout.tsx` — アプリ共通レイアウトとロール別ナビゲーション・サイドバー下部の自己情報（表示名+ロールバッジ）表示 (→10)
- `components/AppBrand.tsx` — ロゴ+アプリ名の共通ブランド表示（初回系画面: オンボーディング/参加/ペアリングのカード先頭）(→04,10)
- `components/RootErrorBoundary.tsx` — 起動診断用ルートエラーバウンダリ
- `components/TipCard.tsx` / `components/TipStack.tsx` — ヘルプ Tip の表示 (→03)
- `pages/SettingsPage.tsx` — 設定画面（プロフィール=表示名変更(同名はエラー)/言語/ID切替(dev)/デバイス管理(端末追加QR・一覧・ラベル・自分以外の削除)/AIプロバイダ・キー=編集メンバー以上のみ表示/地図メンテナンス）(→01,04,10)
- `lib/map-storage.ts` — ポリゴンネットワークの localStorage 永続化アダプタ (→03)
- `data/localstorage/persistent-map.ts` — localStorage write-through 永続化 Map 基盤（各 InMemory リポジトリの共通バックエンド）
- `data/localstorage/localstorage-personal-repository.ts` — アプリ設定を localStorage 永続化（ドメインデータは InMemory へ委譲）(→08)

## 02 領域と区域（領域/区域親番/区域）
- `services/region-service.ts` — 領域/区域親番/区域のツリー管理・RegionBindingAPI 抽象・AreaTreeNode
- `services/region-binding-adapter.ts` — RegionBindingAPI 実装（記号変更の ID 連鎖更新等）
- `services/command-executor.ts` — region/parentArea/area 削除の undo/redo を API 経由で実行
- `services/command-history.ts` — 領域ツリー編集の削除コマンドを undo/redo スタックで保持
- `domain/models/region.ts` — 領域/区域親番/区域の階層モデルと識別子・表示ラベル生成
- `domain/repositories/region-repository.ts` — 領域ツリーの取得/保存/論理・物理削除 IF
- `data/inmemory/inmemory-region-repository.ts` — RegionRepository の InMemory 実装（論理削除フィルタ）
- `pages/RegionManagementPage.tsx` — 領域記号・区域番号の CRUD 画面 (→10)
- `components/AreaTree.tsx` — 区域ツリーの表示/編集（Undo/Redo・ポリゴン紐付け）(→03)
- `components/AreaPickerDialog.tsx` — ポリゴン紐付け先区域のツリー選択ダイアログ (→03)
- `components/PolygonList.tsx` — ポリゴン一覧管理（区域紐付け/解除・有効/ロック・AI下書き取込）(→03)

## 03 地図機能（ポリゴン編集/紐付け/住宅情報/AI取込）
### サービス
- `services/polygon-service.ts` — ポリゴン編集と区域紐付け(BindPolygonToArea)・エリアマップ構築
- `services/place-service.ts` — Place型/PlaceBindingAPI と場所(住宅情報)の CRUD・並び順・論理削除 (→08)
- `services/place-binding-adapter.ts` — PlaceBindingAPI を PlaceRepository 上に実装するアダプタ
- `services/place-import-service.ts` — AI下書き場所の stash とポリゴン紐付け後の区域 Place 取込
- `services/ai-map-import-factory.ts` — 設定から AI地図取込サービス（vision+GSI）を組立
- `services/ai-map-import.ts` — vision抽出→GSI接地→ジオリファレンス変換で区域下書き生成
- `services/anthropic-map-vision.ts` — Anthropic Messages API による地図画像解析アダプタ
- `services/gemini-map-vision.ts` — Gemini generateContent API による地図画像解析アダプタ
- `services/map-vision-extraction.ts` — vision 共通のプロンプト契約/画像判定/base64・JSON抽出/正規化
- `services/gsi-geocoder.ts` — 国土地理院住所検索 API による Geocoder（住所→座標接地）
### 画面/コンポーネント
- `pages/MapPage.tsx` — 地図画面（ポリゴン描画/区域ツリー/ポリゴン一覧/AI取込の統合）(→10)
- `pages/AreaDetailEditPage.tsx` — 区域詳細編集（家/集合住宅/場所の追加・移動・削除＋地図編集）(→10)
- `pages/AreaDetailEditPageContainer.tsx` — 区域詳細編集の DI 組立ラッパ (→01)
- `components/MapView.tsx` — 地図レンダリングとポリゴン編集操作の描画コンポーネント
- `components/AiMapImportDialog.tsx` — AI地図取込ダイアログ（同意→画像→解析→下書きレビュー→取込）
- `components/AddPlaceInputDialog.tsx` — 家追加・場所編集の入力ダイアログ
- `components/BuildingEditDialog.tsx` — 集合住宅の作成/編集（部屋行の追加・並替・削除）
- `components/PlaceListPanel.tsx` — 区域内の場所一覧パネル（D&D並替・部屋数表示）
- `components/AreaDetailContextMenu.tsx` — 区域詳細編集の右クリックメニュー
- `components/EdgeContextMenu.tsx` — ポリゴン辺の右クリック（頂点追加）
- `components/VertexContextMenu.tsx` — ポリゴン頂点の右クリック（頂点削除/dissolve）
- `components/DeletePlaceConfirmDialog.tsx` — 場所削除（論理削除）の確認
### lib（純ロジック/幾何/画像処理）
- `lib/map-renderer.ts` — Leaflet による地図/ポリゴン/場所マーカー描画・ベース地図切替
- `lib/map-state.ts` — 地図モード（描画/編集/詳細編集）と選択ポリゴンの状態ストア
- `lib/map-config.ts` — 環境変数からベース地図プロバイダ設定(GSI/Google)を解決 (→01)
- `lib/map-maintenance.ts` — 孤立頂点の一括削除（開発用保守）
- `lib/area-detail-controller.ts` — 活性ポリゴン中心/近隣/詳細ビューモデルを算出する純関数群
- `lib/area-detail-geo.ts` — 幾何計算基盤（重心/haversine/点内包/近傍削除場所探索）
- `lib/area-detail-map-integration.ts` — 詳細ビューモデルを MapView ハンドルへ適用する統合層
- `lib/add-place-flow.ts` — 「家を追加」フローの純状態機械（削除済み場所の復元判定含む）
- `lib/move-place-flow.ts` — 場所マーカー移動フローの純状態機械
- `lib/building-flow.ts` — 集合住宅編集の部屋行モデルと保存差分計算
- `lib/place-sort-order.ts` — 場所一覧の初回並び順採番
- `lib/polygon-clip.ts` — 隣接境界共有のスナップ・差集合クリップ幾何
- `lib/assign-places-to-polygons.ts` — AI下書き場所を内包取込ポリゴンへ割当 (→06)
- `lib/ai-map-commit.ts` — AI下書きポリゴンを NetworkPolygonEditor へ流し込み（正規化/クリップ/失敗スキップ）
- `lib/extract-boundary-color.ts` — 画像から色ベースで境界線検出しポリゴン化
- `lib/georeference.ts` — GCP対応点から画素→緯度経度アフィン変換を最小二乗推定
- `lib/overlay-georeference.ts` — 手動オーバーレイ整列の相対座標→緯度経度線形写像
- `lib/pdf-raster.ts` — AI取込の PDF 入力を1ページ目 PNG にラスタ化
### hooks
- `hooks/useAreaDetailMap.ts` — 区域詳細編集の地図/場所描画とビューモデル適用を束ねる
- `hooks/useCommandHistory.ts` — Undo/Redo コマンドヒストリを React へ購読
- `hooks/useMapState.ts` — MapState ストアを useSyncExternalStore で購読
- `hooks/usePolygonEditor.ts` — NetworkPolygonEditor/PolygonService の初期化・配線
### domain / data
- `domain/models/geometry.ts` — 地理座標と GeoJSON ポリゴンの基礎型
- `domain/models/place.ts` — 座標に紐づく場所（戸建/集合住宅/部屋）モデル (→08)
- `domain/models/pending-import-place.ts` — AI取込の未確定場所（紐付け前）モデル
- `domain/repositories/place-repository.ts` — 場所の取得/保存/論理削除・近傍削除済み検索 IF (→08)
- `domain/repositories/pending-import-place-repository.ts` — AI取込未確定場所の保存/取得/件数/削除 IF
- `data/inmemory/inmemory-place-repository.ts` — PlaceRepository の InMemory 実装（論理削除除外・Haversine 近傍）(→08)
- `data/inmemory/inmemory-pending-import-place-repository.ts` — PendingImportPlaceRepository の InMemory 実装

## 04 メンバー管理と権限（ロール/招待/承認）
- `services/auth-service.ts` — ロール権限判定・メンバー編集（updateMember=表示名/ロール直接変更。自己ロール変更不可・同名は already_exists・最後の管理者降格ガード）・メンバー削除（removeMember=自己削除不可）。任命招待フローは 2026-07-14 廃止
- `services/identity-service.ts` — アクター DID 解決の抽象。LocalIdentityService（実 identity 作成・localStorage 永続・URL 端末ペアリング・デバイス登録簿・setName=表示名変更、ローカルメンバー表で同名は already_exists。loadIdentity はリポジトリ側レコードを正とし同期済みの名前/ロールを stomp しない）と DevIdentityService（dev 切替）。`loadStoredSeed()` は保存済みシードを返し LinkSelfClient のネットワーク配線に供給(→01,11)
- `contexts/IdentityContext.tsx` — actorID/ロール/表示名（currentName・renameSelf）/開発モードの一元管理・初回オンボーディングゲート・デバイス管理（hasIdentity/identityReady・createIdentity/completePairing・listDevices/renameDevice/removeDevice=自分以外）。`hvs:shared-applied`(users) で自分のロール・表示名を同期追従 (→10)
- `lib/identity-crypto.ts` — Ed25519 鍵生成と did:key（LinkSelf 互換 0xed 形式）エンコード/デコード・シード base64 往復
- `lib/pairing.ts` — 端末ペアリングのトークン/ペイロード(base64url)生成・ペアリング URL 組立/抽出・期限/形式検証（同一 DID コピー）
- `lib/linkself/group-invite.ts` — グループ招待（別 DID 参加）の発行/解析ラッパ。@linkself/core の invitation を束ね、3 日期限の `#/join?i=...` URL 生成（issueGroupInvite=シード / buildGroupInviteUrl=Identity。表示用グループ名 `&g=` 同梱）と検証付き解析（parseGroupInvite / extractGroupNameParam）。デバイスペアリングと異なり鍵は運ばない (→11)
- `lib/group-name.ts` — グループ名（アプリレベルデータ・LinkSelf に名前概念なし）の localStorage 永続（`hvs.groupName`）。創設時設定・管理者変更・参加時保存の共有ヘルパ
- `lib/linkself/group-network.ts` — グループ参加のアプリ向けファサード（GroupNetworkService）。起動中 LinkSelfClient を薄くラップし ensureFoundingNetwork（創設ネットワーク作成/永続。実体なし迷子 ID は作り直し回復）・issueInvite（管理者として3日招待発行）・setMemberRole/kickMember（ロール変更/除名の LinkSelf ネットワーク反映 + membership snapshot 配信。実体に無い対象は best-effort で素通り）・join（招待URL受理→requestJoin→networkId永続）・**非同期参加**（joinAsync=メールボックスへ封緘 deposit + pending 永続 `hvs.pendingJoin` / restorePendingJoin=起動時復元・失効判定 / resolveAsyncDecision=受理結果の確定・networkId 永続・`hvs:async-join-decision` イベント通知・持ち越し `hvs.asyncJoinResult` は App が consumeAsyncJoinResult でロール採用）を提供。networkId は localStorage `hvs.networkId`。upsertJoinedMember（onMemberJoined→UserRepository 記録。表示名は受理管理者のみ可視・既存メンバーと同名なら「(2)」からの連番付与）(→04,11)
- `lib/linkself/network-store.ts` — ネットワーク実体（メンバー・ロール表）と使用済み招待ノンスの localStorage 永続ストア（LocalStorageNetworkStore / LocalStorageConsumedNonceStore）。in-memory だとリロードで消え招待が network_not_found 拒否になるのを防ぐ (→01,04)
- `lib/linkself/shared-store.ts` — groupshare 共有レコード（LocalStorageSharedStorage、catch-up 高水位・LWW 判定材料の保持）と membership epoch（LocalStorageEpochStore、スナップショット巻き戻り防止）の localStorage 永続 (→01)
- `lib/linkself/shared-events.ts` — ScopeNetwork 受信適用の window イベント定数（`hvs:shared-applied`。UsersPage/IdentityContext が購読。重量級 linkself-services に依存しない軽量モジュール）(→01,04)
- `lib/linkself/known-members.ts` — 既知メンバー（招待発行者=管理者）到達アドレスの localStorage 永続（`hvs.knownMembers`）。presence 未実装のため次回起動の FastStart で管理者へ再ダイヤルするハブ型トポロジの土台 (→01)
- `data/linkself/linkself-user-repository.ts` — UserRepository の MyDB(SQL) 実装（users/member_tags。OPFS 永続 + ScopeNetwork でメンバー間同期。invitations は廃止フローのため InMemory 委譲。USER_SYNC_TABLES）(→01,04)
- `domain/models/device.ts` — 個人デバイス（自 DID に紐づく端末）モデル（deviceId/label、暫定 localStorage・M5 で同期リポジトリへ）
- `pages/OnboardingPage.tsx` — 初回オンボーディング（ID 作成=創設グループ名の設定込み / 既存端末から URL・コード引き継ぎ。AppBrand 表示）(→10)
- `pages/PairPage.tsx` — 端末ペアリング取り込み（`#/pair?d=…`。未登録は登録・登録済みは冪等スルー、フラグメント除去）(→10)
- `pages/JoinPage.tsx` — グループ招待取り込み（`#/join?i=…`。別 DID が招待を受けて参加。AppBrand+「○○グループに招待されています」（`&g=`）+招待ロール表示。ID 未作成なら作成へ誘導・参加は GroupNetwork.join。管理者不達時は joinAsync で非同期参加へフォールバックし成立待ち表示、受理結果イベントで完了/失効へ遷移。成立/預け時にグループ名をローカル保存）(→10,11)
- `components/GroupInviteSection.tsx` — グループ招待の発行 UI（管理者専用・admin 以外は非表示。参加ロール選択=既定活動メンバー・3 日期限の URL/QR 発行・コピー・グループ名同梱。メンバー管理画面 `/users` に配置）(→11)
- `components/GroupNameSection.tsx` — グループ名の表示・変更 UI（管理者専用。`/users` に配置。見出し横に現在値プレビュー・未保存/保存済みの状態表示付きで、招待 URL に同梱される表示名を編集）
- `contexts/GroupNetworkContext.tsx` — グループ招待/参加ファサード（GroupNetworkService）の DI。ネットワーク未配線時は null (→01,11)
- `components/QrCode.tsx` — テキスト（ペアリング URL 等）を QR canvas 描画
- `pages/UsersPage.tsx` — メンバー一覧（編集=表示名/ロール直接変更・削除=LinkSelf グループからの削除、自分の行はロール変更/削除不可）とタグ CRUD・検索/フィルタ画面。`hvs:shared-applied` で同期受信時に自動再読込 (→10)
- `domain/models/user.ts` — メンバー/ロール(admin/editor/member)権限判定・メンバータグ
- `domain/models/invitation.ts` — グループ参加・ロール任命の招待モデル
- `domain/repositories/user-repository.ts` — メンバー/メンバータグ/招待の永続化 IF
- `data/inmemory/inmemory-user-repository.ts` — UserRepository の InMemory 実装

## 05 チェックアウト（返却回収/担当者/区域アクセス権/区域招待）
- `services/checkout-service.ts` — チェックアウト操作（排他制約 + ポリゴン紐付け必須・期間ゲート廃止）・担当者/招待・区域アクセス権・訪問記録書込
- `pages/CheckoutsPage.tsx` — チェックアウト一覧/発行/招待/状態タブ管理 (→10)
- `components/InviteDialog.tsx` — チェックアウト招待発行（被招待者選択/TTL）(→07)
- `domain/models/access.ts` — 訪問記録画面の編集/読取アクセスモードと親子合成
- `domain/models/checkout-invitation.ts` — 区域招待（時間制限付き参加）モデルと有効判定
- `domain/models/visit.ts` — 訪問記録＋チェックアウト（排他取得）モデル・申請要否判定 (→08)
- `domain/repositories/checkout-repository.ts` — チェックアウト/区域招待/訪問記録/編集履歴の永続化 IF
- `data/inmemory/inmemory-checkout-repository.ts` — CheckoutRepository の InMemory/localStorage 実装

## 06 網羅管理（網羅活動/進捗/予定）
- `domain/models/coverage.ts` — 区域親番単位の網羅活動（進捗率/ステータス）モデル
- `domain/repositories/coverage-repository.ts` — 網羅活動の永続化 IF
- `data/inmemory/inmemory-coverage-repository.ts` — CoverageRepository の InMemory/localStorage 実装
- 「チェックアウト可能期間（AvailablePeriod）」は 2026-07-13 廃止（旧 `available-period*` / `CoveragePage` は削除。網羅進捗参照画面は後続フェーズ）

## 07 通知と申請（通知/申請/監査ログ/データ保持）
- `pages/RequestsPage.tsx` — 通知と申請画面（保留/解決一覧、現状プレースホルダ）(→10)
- `components/VisitRecordDialog.tsx` — 訪問記録入力（結果/メモ）＋編集リクエスト（要削除/要移動/その他）(→08)
- `domain/models/notification.ts` — 任命/貸出/返却/申請結果等の通知モデル
- `domain/models/request.ts` — 各種申請（場所削除/情報修正/地図更新/訪問拒否）モデル
- `domain/models/audit.ts` — 重要操作（ロール変更/強制回収等）の監査ログモデル
- `domain/repositories/notification-repository.ts` — 通知/申請/監査ログの永続化 IF
- `data/inmemory/inmemory-notification-repository.ts` — NotificationRepository の InMemory/localStorage 実装

## 08 活動メンバー向けアプリ（訪問記録/最新状況/場所データ）
- `services/visit-service.ts` — 訪問結果5値・VisitRecord/VisitService 型・申請要否判定
- `services/visit-binding-adapter.ts` — VisitBindingAPI を CheckoutService/CheckoutRepository 上に実装
- `pages/VisitPage.tsx` — 訪問記録画面（記録入力・場所の直接追加・編集リクエスト。移動/削除は直接不可）(→10)
- `pages/VisitPageContainer.tsx` — 訪問記録画面の DI 組立ラッパ (→01)
- `pages/DashboardPage.tsx` — ダッシュボード（アクセス可能区域一覧・チェックアウト/返却/招待導線）(→10)
- `components/BuildingVisitDialog.tsx` — 集合住宅の部屋一覧と訪問対象部屋選択
- `lib/visit-date-color.ts` — 最終訪問日の経過日数による色分け CSS クラス判定
- `domain/models/personal.ts` — 端末内個人スコープの個人メモ/個人タグ/割当モデル
- `domain/models/visit-edit.ts` — 訪問記録の編集履歴（変更前後スナップショット）モデル
- `domain/repositories/personal-repository.ts` — 個人データ＋アプリ設定の永続化 IF (→01)
- `data/inmemory/inmemory-personal-repository.ts` — PersonalRepository の InMemory 実装

## 10 画面設計
各画面は上記の機能テーマ節に `pages/*` として掲載。画面横断の構成・Binding 対応は `docs/wants/10_画面設計.md` を参照。共通レイアウト/ナビは `components/Layout.tsx`（01節）。

## 11 LinkSelf 拡張要望（データインフラ）
- `services/identity-service.ts` — アクター DID 解決の抽象（04節に掲載、LinkSelf 移行点）
- 各 `*-binding-adapter.ts`（01/02/03/08節）— ドメイン↔BindingAPI 境界。LinkSelf 実装差し替えの接続点。
- `lib/linkself/client-factory.ts` — ブラウザ用 LinkSelf クライアント（@linkself/core）の組み立て。WebSocket + Circuit Relay v2（`circuitRelayTransport`）/Noise/yamux + identify サービスで libp2p を構成し `createLinkSelfClient()` が起動済み `LinkSelfSession`（client + libp2p + graceful stop）を返す。circuit-relay により着信不可のブラウザ同士がリレー経由（`/p2p-circuit`）で相互到達できる。`transportPrivateKey`（省略時 DID 鍵）で libp2p host 鍵を DID 鍵から分離＝同一 DID 多端末が別 peerId を持ち相互 devicesync 可能に。`sqlDatabase`（OPFS SqliteWasmDatabase）を渡すと `client.myDB` の SQL/KV が使える。`mailboxes`/`onAsyncJoinDecision` で非同期参加（メールボックス）を配線。M5 統合の実利用エントリ
- `lib/linkself/device-key.ts` — この端末固有の libp2p transport 鍵（=device 鍵）を生成・永続（32byte シードを localStorage `hvs.deviceKeySeed` に保管、決定的復元で peerId 固定）。`loadOrCreateDeviceTransportKey()`。ユーザー鍵（hvs.identity）とは独立。2層 identity の device DID を供給
- `lib/linkself/device-roster.ts` — デバイスロスターのローカル永続・自端末登録（`loadOrCreateRoster()`/`addDeviceToRoster()`）。ユーザー鍵署名の `userDID→[deviceDID]` を localStorage `hvs.deviceRoster` に marshal 保管。自端末を必ず登録し、別ユーザー/破損時は作り直す。兄弟端末の収束（相手 device DID 取り込み）は接続時のロスター交換＝発見フェーズ（後続）。link-self `roster.ts` と対
- `lib/linkself/identity-bridge.ts` — アプリの identity（32byte Ed25519 シード, `identity-crypto.ts`）から @linkself/core の `Identity` を導出（`linkselfIdentityFromSeed`）。同一シード→同一 did:key で既存ユーザーの DID を保ったまま LinkSelf 統合へ移行（04節 identity-service と対）
- `data/linkself/linkself-personal-repository.ts` — PersonalRepository の LinkSelf(MyDB SQL) 実装。アプリ設定(`my_settings`)・非表示tip(`hidden_tips`)を MyDB の SQL テーブル（ブラウザは OPFS SAHPool VFS の SQLite=リロード永続）に保存。書き込みは wireSqlSync が devicesync へミラー（ScopeDevice=将来の端末間同期に接続）。ノート/タグは当面 InMemory 委譲。※KV 面は MemDeviceStorage=インメモリで永続しないため設定は SQL 面に載せる（ScopeDevice フェーズ Slice-1）
- `contexts/linkself-services.ts` — LinkSelf-backed のサービス束 `createLinkSelfServices()`（`{services, stop}` を返す）。個人設定 + **users/member_tags**（LinkSelfUserRepository。ScopeNetwork 配線 = networkId 確定時に setSyncScope、includeExisting は初回のみ `hvs.scopedTables`、受信適用と参加受理記録は `hvs:shared-applied` イベント発火＝テーブル単位 100ms 合流（開いている /users が自動更新・バースト時の再読込連発を防止）、旧 localStorage データの一度きり移行、userRepo 依存の auth/checkout/visit サービス再構築、既知メンバーへの FastStart 再ダイヤル）を OPFS-backed MyDB(SQL) に永続し残りは `createInMemoryServices` 流用。2 モード: **スタンドアロン**（リレー/identity 未指定=libp2p 起動なし・ローカル永続のみ）と**ネットワーク**（seed+relays 指定時=実 identity で `LinkSelfClient` 起動・`client.myDB` 使用・FastStart 接続・graceful stop）。ネットワーク配線失敗はスタンドアロンへフォールバック。ネットワーク時はメールボックス（=リレー同一ノード）を配線し、成立待ち復元 + 起動時/60 秒間隔の checkMailbox ポーリング（管理者の無人受理・被招待者の結果受領）。`parseRelays()` は `VITE_LINKSELF_RELAYS`(`did=multiaddr` カンマ区切り) を `KnownPeer[]` に解析。`VITE_LINKSELF` 有効時に `main.tsx` から動的 import（sqlite-wasm 遅延ロード）
- `lib/linkself/linkself-wiring.test.ts` — @linkself/core が alias 経由で pwa のツールチェーン下に解決・トランスパイルできる配線確認（CP-A）
- `lib/linkself/linkself-interop.test.ts` — client-factory から Go ノード（link-self/core `poc-wsnode`）へ実 WebSocket 接続・LinkSelf auth・echo 往復の自動 interop 検証（CP-B、`go` 無ければ skip）
- 依存リンク: `@linkself/core` は姉妹リポジトリ `../../link-self/ts/linkself/src` の TS ソースを Vite `resolve.alias` + tsconfig `paths` で直接参照（build 不要）。libp2p 実行時依存は pwa 側に固定バージョンで導入し `resolve.dedupe` で単一化（`pwa/vite.config.ts` / `pwa/tsconfig.json`）
