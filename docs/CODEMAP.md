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
- `services/settings-service.ts` — ロケール/Tips/隣接半径など個人設定と定数 (→03)
- `services/settings-binding-adapter.ts` — SettingsBindingAPI を PersonalRepository 上に実装する設定永続化アダプタ
- `contexts/ServicesContext.tsx` — リポジトリ/サービス群をアプリ全体へ配線する DI コンテキスト（persist 時の localStorage プレフィクスは `storagePrefix` で差し替え可＝グループ名前空間）
- `contexts/I18nContext.tsx` — ロケール選択/翻訳と永続化ストア注入の i18n コンテキスト
- `contexts/TipsContext.tsx` — 操作ヒント(Tips)の表示キュー制御と非表示状態の永続化（非表示キーのロード完了まで表示要求を保留し「表示しない」決定を確実に尊重）(→10)
- `components/Layout.tsx` — アプリ共通レイアウトとロール別ナビゲーション・サイドバー下部の自己情報（表示名+ロールバッジ）表示。狭幅では初期折りたたみ+オーバーレイ展開（backdrop タップ/遷移で閉じる）・区域編集/領域管理の項目は非表示（hideOnNarrow）(→10)
- `components/AppBrand.tsx` — ロゴ+アプリ名の共通ブランド表示（初回系画面: オンボーディング/参加/ペアリングのカード先頭）(→04,10)
- `components/RootErrorBoundary.tsx` — 起動診断用ルートエラーバウンダリ
- `components/TipCard.tsx` / `components/TipStack.tsx` — ヘルプ Tip の表示 (→03)
- `lib/terms.ts` — 使用許諾・免責事項の同意状態（TERMS_VERSION/localStorage `hvs.termsAcceptedVersion`、旧バージョン同意は未同意扱い=改定時再同意）(→01,10)
- `components/TermsDocument.tsx` — 使用許諾・免責事項の全文表示（i18n `terms.*` が SoT。同意ゲートと設定画面で共用）(→01,10)
- `pages/TermsGatePage.tsx` — 使用許諾・免責事項の同意ゲート画面（未同意起動時に全ルートへ優先表示。ハッシュ URL は消費しない）(→01,10)
- `pages/SettingsPage.tsx` — 設定画面（プロフィール=表示名変更(同名はエラー)/言語/使用許諾・免責事項の全文閲覧/ID切替(dev)/デバイス管理(端末追加QR・一覧=登録簿+ロスター由来兄弟端末・ラベルは全行改名可=ロスター同期・削除は自分以外の全行=失効+対象端末の全初期化(ロスター行はネットワーク配線時のみ)・`hvs:roster-updated` 購読で一覧が再読込なしで追従)/地図メンテナンス/アプリ情報=ビルド日時+コミット表示（最新ビルド確認用））(→01,04,10)
- `lib/map-storage.ts` — ポリゴンネットワークの MapBindingAPI 抽象と localStorage 実装（非 LinkSelf 時・テスト用。LinkSelf 時は data/linkself/linkself-map-binding.ts が map_* テーブルに置換）。ロード時に network-sanitize で不整合を非破壊除外し直近レポートを保持・除外検出時は完全 catch-up の即時リペアを要求（`hvs:sync-repair-requested`）(→03)
- `lib/build-info.ts` — ビルド情報（Vite define の `__BUILD_TIME__`/`__BUILD_COMMIT__` を安全に参照・表示整形。設定画面「アプリ情報」が使用）
- `data/localstorage/persistent-map.ts` — localStorage write-through 永続化 Map 基盤（各 InMemory リポジトリの共通バックエンド）
- `data/linkself/group-schema.ts` — グループドメイン全テーブル（regions/places/map_*/checkouts/feedback 等）の MyDB SQL スキーマ（v3=初期集合・v4=feedback）と JSON 行 `(id, data)` の共通ヘルパ・GROUP_SYNC_TABLES（ScopeNetwork 対象一覧）(→02,03,05,06,07,11)
- `data/linkself/legacy-group-data-migration.ts` — 旧 localStorage（PersistentMap/map.network blob）→ MyDB SQL の一度きり移行（SQL 空のときだけ・昇格前に実行し初回一括配送へ載せる）。移行ソースキー一覧（LEGACY_MIGRATION_SOURCE_SUFFIXES）を export し sync-state-heal が食い違い検出時に破棄する (→01,11)
- `hooks/useSharedApplied.ts` — ScopeNetwork 受信適用イベントの購読フック（指定テーブル群の受信で画面再読込）(→10)
- `data/localstorage/localstorage-personal-repository.ts` — アプリ設定を localStorage 永続化（ドメインデータは InMemory へ委譲）(→08)
- `scripts/deploy-oci.sh` — 本番デプロイ（OCI VM + Caddy, home-visit.givers.work へビルド→rsync）

## 02 領域と区域（領域/区域親番/区域）
- `services/region-service.ts` — 領域/区域親番/区域のツリー管理・RegionBindingAPI 抽象・AreaTreeNode
- `services/region-binding-adapter.ts` — RegionBindingAPI 実装（記号変更の ID 連鎖更新等）
- `services/command-executor.ts` — region/parentArea/area 削除の undo/redo を API 経由で実行
- `services/command-history.ts` — 領域ツリー編集の削除コマンドを undo/redo スタックで保持
- `domain/models/region.ts` — 領域/区域親番/区域の階層モデルと識別子・表示ラベル生成・飛地ポリゴンID群の読み替え(areaPolygonIds、旧 polygonId 互換)
- `lib/region-tree-index.ts` — 区域ツリー＋表示名インデックスの構築（ダッシュボード/区域一覧が共用）(→05,10)
- `domain/repositories/region-repository.ts` — 領域ツリーの取得/保存/論理・物理削除 IF
- `data/inmemory/inmemory-region-repository.ts` — RegionRepository の InMemory 実装（論理削除フィルタ）
- `data/linkself/linkself-region-repository.ts` — RegionRepository の MyDB(SQL) 実装（regions/parent_areas/areas。OPFS 永続 + ScopeNetwork でメンバー間同期）(→01)
- `pages/RegionManagementPage.tsx` — 領域記号・区域番号の CRUD 画面 (→10)
- `components/AreaTree.tsx` — 区域ツリーの表示/編集（Undo/Redo・ポリゴン紐付け・選択ポリゴン行への祖先自動展開＋スクロール）(→03)
- `components/AreaPickerDialog.tsx` — ポリゴン紐付け先区域のツリー選択ダイアログ（紐付け済み区域には飛地追加ボタン）(→03)
- `components/PolygonList.tsx` — ポリゴン一覧管理（区域紐付け/解除・有効/ロック・選択ポリゴン行への自動スクロール）(→03)

## 03 地図機能（ポリゴン編集/紐付け/住宅情報）
- ポリゴン編集コア（頂点/辺ネットワーク・スナップ・交差解決・面列挙・undo/redo）は外部 npm パッケージ `map-polygon-editor`（自作、ソース: `~/map-polygon-editor`、https://github.com/SeijiShii/map-polygon-editor ）。編集コアの不具合はライブラリ側で修正→patch 公開→`pwa` の依存更新で反映する
### サービス
- `services/polygon-service.ts` — ポリゴン編集と区域紐付け(BindPolygonToArea、1区域複数ポリゴン=飛地対応・個別/一括解除)・エリアマップ構築
- `services/place-service.ts` — Place型/PlaceBindingAPI と場所(住宅情報)の CRUD・並び順・論理削除 (→08)
- `services/place-binding-adapter.ts` — PlaceBindingAPI を PlaceRepository 上に実装するアダプタ
- `data/linkself/linkself-place-repository.ts` — PlaceRepository の MyDB(SQL) 実装（places。OPFS 永続 + ScopeNetwork）(→01,08)
- `data/linkself/linkself-map-binding.ts` — MapBindingAPI の MyDB(SQL) 実装（map_vertices/map_edges/map_polygons のエンティティ行・保存は差分行のみ upsert/delete。OPFS 永続 + ScopeNetwork）(→01)
### 画面/コンポーネント
- `pages/MapPage.tsx` — 地図画面（ポリゴン描画/区域ツリー/ポリゴン一覧/場所の読み取り専用オーバーレイ＝灰色・区域外は赤灰色・SortOrder 重複の幾何順再採番の統合・頂点マージ後の紐付け補正＝分割継承/消滅解除・ロード時の無効紐付き修復スキャン・マージ削除の確認ダイアログ=キャンセルで undo 復元・常設アンドゥ/リドゥボタン=描画中は非表示）(→10)
- `components/MapView.tsx` — 地図レンダリングとポリゴン編集操作の描画コンポーネント。現在地 watch の購読ライフサイクルと「現在地へ移動」ボタン配線（未取得時は単発取得→パン）
- `components/AddPlaceInputDialog.tsx` — 家追加・場所編集の入力ダイアログ
- `components/BuildingEditDialog.tsx` — 集合住宅の作成/編集（名前/住所/補足＋部屋行は RoomRowsEditor・D&D 並替あり）
- `components/RoomRowsEditor.tsx` — 部屋番号一覧の行エディタ共通コンポーネント（行=入力欄＋×確認付き削除・[+1][+5][+10]・D&D は allowReorder 時のみ。編集ダイアログ/訪問ダイアログ部屋編集モードで共用）(→08)
- `components/PlaceListPanel.tsx` — 場所一覧と訪問記録の一覧（直近記録併記/展開・D&D並替は権限ゲート・右ペイン/オーバーレイ両対応）(→08)
- `components/AreaDetailContextMenu.tsx` — 場所直接編集/追加の右クリックメニュー（訪問記録画面で使用）
- `components/EdgeContextMenu.tsx` — ポリゴン辺の右クリック（頂点追加）
- `components/VertexContextMenu.tsx` — ポリゴン頂点の右クリック（頂点削除/dissolve）
- `components/DeletePlaceConfirmDialog.tsx` — 場所削除（論理削除）の確認
- `components/PolygonDeleteConfirmDialog.tsx` — 頂点統合でポリゴンが消滅するときの確認（OK=確定/キャンセル=undo 復元）
### lib（純ロジック/幾何/画像処理）
- `lib/map-renderer.ts` — Leaflet による地図/ポリゴン（未紐付け=灰・紐付け済みは親番ごとに有彩色塗り分け・詳細モードは親番色の極薄塗り）/場所マーカー/区域IDラベル（ズーム16以上のみ表示）/親番境界の実線太線強調（区域境界線＝輪郭が手前）の描画・読み取り専用の場所オーバーレイ（ズーム16以上・灰/赤灰）・ベース地図切替・描画モードのスナップ表示（頂点/線分）・頂点ドラッグの吸着マーカー表示（onDragMove 戻り値の位置へ）・初期表示位置（前回ビュー復元=moveend 毎に localStorage 保存 > 初回は GPS 現在地=表示が動いていたら上書きしない > 東京フォールバック）・現在地マーカー（青ドット＋精度円、専用ペイン・非対話）と「現在地へ移動」コントロール（パン時 zoom15 未満は引き上げ）
- `lib/initial-map-view.ts` — 地図初期表示位置の解決純ロジック（保存ビュー優先/東京駅フォールバック/GPS 1回取得のラッパ）
- `lib/current-location.ts` — 現在地のリアルタイム購読（watchPosition ラッパ・stop で解除。現在地マーカー/現在地パンの供給元）
- `lib/parent-boundary.ts` — 区域親番の境目となる辺の判定（親番キー抽出・辺単位の境界集合算出）
- `lib/parent-area-color.ts` — 区域親番ごとのポリゴン塗り分け（有彩色8色パレット・親番号の mod で色割り当て・非数値識別子は文字コード和で代替。区域編集画面の輪郭/塗りと訪問記録画面の極薄塗りが共用）
- `lib/map-state.ts` — 地図モード（描画/編集/詳細編集）と選択ポリゴンの状態ストア
- `lib/map-config.ts` — 環境変数からベース地図プロバイダ設定(GSI/Google)を解決 (→01)
- `lib/google-maps-loader.ts` — Google Maps JS API の script 動的読み込み（loading=async では onload 時点で google.maps.Map 未定義のため、公式 callback パラメータで API 完全準備後に resolve。single-flight・失敗時リトライ可）
- `lib/map-maintenance.ts` — 孤立頂点の一括削除（開発用保守）
- `lib/polygon-binding-fixup.ts` — 頂点マージ後の ChangeSet から区域紐付けの補正を算出する純ロジック（分割で新 ID が出たら分割元の区域へ bind・消滅したポリゴンは unbind）
- `lib/vertex-attract.ts` — ドラッグ中の頂点吸着（磁着）の純ロジック（しきい値内の最近傍他頂点を返す。しきい値=12px は map-renderer 定数）
- `lib/network-sanitize.ts` — ロード時ネットワーク整合性サニタイズの純ロジック（欠落頂点を参照する辺・欠落辺/頂点を参照する面をメモリ上でのみ除外＝非破壊。修復スキャンの missing 誤解除の抑止元データ）
- `lib/area-tree-path.ts` — 選択ポリゴンが紐付く区域のツリー祖先パス（領域/区域親番/区域）解決の純ロジック（区域一覧の自動展開＋スクロールが使用）
- `lib/area-binding-heal.ts` — 区域に紐付いたままの無効ポリゴンID（削除済み/面積ほぼ0）の検出純ロジック（地図画面ロード時の修復スキャンが使用）
- `lib/area-detail-controller.ts` — 活性ポリゴン中心/近隣/詳細ビューモデルを算出する純関数群（飛地=複数対象ポリゴン・外接範囲中心）
- `lib/area-detail-geo.ts` — 幾何計算基盤（重心/haversine/点内包/近傍削除場所探索）
- `lib/area-detail-map-integration.ts` — 詳細ビューモデルを MapView ハンドルへ適用する統合層
- `lib/add-place-flow.ts` — 「家を追加」フローの純状態機械（削除済み場所の復元判定含む）
- `lib/move-place-flow.ts` — 場所マーカー移動フローの純状態機械
- `lib/building-flow.ts` — 集合住宅編集の部屋行モデル（構築/変更判定含む）と保存差分計算/差分適用（削除確定後に復元候補を評価）・部屋の同番号復元判定 (→08)
- `lib/place-sort-order.ts` — 場所一覧の初回並び順採番
- `lib/place-renumber.ts` — SortOrder 重複の検出と幾何順（北→南・西→東）再採番の純ロジック
### hooks
- `hooks/useAreaDetailMap.ts` — 訪問記録画面の地図/場所描画とビューモデル適用を束ねる (→08)
- `hooks/useMediaQuery.ts` — matchMedia 購読（タッチ主体判定=直接編集ゲート/狭幅判定=一覧レイアウト）(→07,08)
- `hooks/useCommandHistory.ts` — Undo/Redo コマンドヒストリを React へ購読
- `hooks/useMapState.ts` — MapState ストアを useSyncExternalStore で購読
- `hooks/usePolygonEditor.ts` — NetworkPolygonEditor/PolygonService の初期化・配線（reloadKey 増分で ScopeNetwork 受信後にストレージから再初期化）
### domain / data
- `domain/models/geometry.ts` — 地理座標と GeoJSON ポリゴンの基礎型
- `domain/models/place.ts` — 座標に紐づく場所（戸建/集合住宅/部屋）モデル (→08)
- `domain/repositories/place-repository.ts` — 場所の取得/保存/論理削除・近傍削除済み検索・Building 配下の削除済み部屋検索 IF (→08)
- `data/inmemory/inmemory-place-repository.ts` — PlaceRepository の InMemory 実装（論理削除除外・Haversine 近傍・削除済み部屋検索）(→08)

## 04 メンバー管理と権限（ロール/招待/承認）
- `services/auth-service.ts` — ロール権限判定・メンバー編集（updateMember=表示名/ロール直接変更。自己ロール変更不可・同名は already_exists・最後の管理者降格ガード）・メンバー削除（removeMember=自己削除不可）。任命招待フローは 2026-07-14 廃止
- `services/identity-service.ts` — アクター DID 解決の抽象。LocalIdentityService（実 identity 作成・localStorage 永続・URL 端末ペアリング=payload v2 拡張同梱、completePairing は identity 復元＋旧グループ状態の残骸破棄＋payload 拡張適用まで一括（URL 経路と手入力貼付経路の共通挙動）・デバイス一覧=登録簿+ロスター由来兄弟端末でラベルはロスターが SoT・renameDevice はデバイス DID に解決して device-directory へ委譲=rev+1 再署名+announce・removeDevice はロスター行を device-directory の失効へ委譲=対象端末は全初期化・setName=表示名変更、ローカルメンバー表で同名は already_exists。loadIdentity はリポジトリ側レコードを正とし同期済みの名前/ロールを stomp しない）と DevIdentityService（dev 切替）。`loadStoredSeed()` は保存済みシードを返し LinkSelfClient のネットワーク配線に供給(→01,11)
- `contexts/IdentityContext.tsx` — actorID/ロール/表示名（currentName・renameSelf）/開発モードの一元管理・初回オンボーディングゲート・デバイス管理（hasIdentity/identityReady・createIdentity/completePairing・listDevices/renameDevice/removeDevice=自分以外）。`hvs:shared-applied`(users) で自分のロール・表示名を同期追従 (→10)
- `lib/identity-crypto.ts` — Ed25519 鍵生成と did:key（LinkSelf 互換 0xed 形式）エンコード/デコード・シード base64 往復
- `lib/pairing.ts` — 端末ペアリングのトークン/ペイロード(base64url)生成・ペアリング URL 組立/抽出・期限/形式検証（同一 DID コピー）。payload v2 拡張=鍵+最小ポインタのみ（発行側デバイス DID・所属グループの networkId/表示名。ロスター・実体は載せない）(→01)
- `lib/pairing-extras.ts` — ペアリング payload 拡張＝鍵+最小ポインタのみ。収集（発行側: deviceKeySeed から DID 導出・グループの networkId/表示名/自ロール）と適用（受信側: 兄弟 DID をユーザー紐づきで hvs.pendingSiblingDevices へ控え・スロット作成・実体は自メンバーシップのみで自己合成=自分を含まない残骸実体は上書き）。applyPairingExtrasIfMissing=同一 DID 再スキャンで欠けた器のみ取り込み。main バンドルのため @linkself/core 非依存で対応キーを直接読む (→01)
- `lib/linkself/group-invite.ts` — グループ招待（別 DID 参加）の発行/解析ラッパ。@linkself/core の invitation を束ね、3 日期限の `#/join?i=...` URL 生成（issueGroupInvite=シード / buildGroupInviteUrl=Identity。表示用グループ名 `&g=` 同梱）と検証付き解析（parseGroupInvite / extractGroupNameParam）。デバイスペアリングと異なり鍵は運ばない (→11)
- `lib/group-name.ts` — グループ名（アプリレベルデータ・LinkSelf に名前概念なし）のローカル永続。アクティブなグループスロットに保存（スロット未作成時は旧 `hvs.groupName` フォールバック）。創設時設定・管理者変更・参加時保存の共有ヘルパ (→01,04)
- `lib/group-slots.ts` — グループスロット＝グループ毎のローカル DB 名前空間（`hvs.groups`/`hvs.activeGroup`・キー `hvs.g.<slotId>.*`・repo プレフィクス `hvs.g.<slotId>:*`・グループ DB ファイル名導出）。旧単一グループデータの一度きり移行（migrateLegacyGroupData）・スロット破棄（purgeGroupSlot=脱退 / purgeAllGroupSlots=別 DID 紐づけ直し。孤児 DB はプールディレクトリ付きで記録）・DB 毎の専用 SAHPool 導出（dbPoolNameFor/dbPoolDirFor）(→01,04)
- `lib/persistence-status.ts` — 永続化デグレード（OPFS を開けず in-memory 起動）の共有フラグ。linkself-services が記録し Layout が警告バナー表示（learnings L-010 対応）(→01)
- `lib/linkself/group-network.ts` — グループ参加のアプリ向けファサード（GroupNetworkService）。起動中 LinkSelfClient を薄くラップし ensureFoundingNetwork（創設ネットワーク作成/永続。実体なし迷子 ID は作り直し回復）・issueInvite（管理者として3日招待発行）・setMemberRole/kickMember（ロール変更/除名の LinkSelf ネットワーク反映 + membership snapshot 配信。実体に無い対象は best-effort で素通り）・join（招待URL受理→requestJoin→networkId永続）・**非同期参加**（joinAsync=メールボックスへ封緘 deposit + pending 永続 `hvs.pendingJoin` / restorePendingJoin=起動時復元・失効判定 / resolveAsyncDecision=受理結果の確定・networkId 永続・`hvs:async-join-decision` イベント通知・持ち越し `hvs.asyncJoinResult` は App が consumeAsyncJoinResult でロール採用）を提供。networkId は localStorage `hvs.networkId`。clearGroupNetworkLocalState（別 DID への紐づけ直し時に networkId/pending/持ち越し結果を破棄。PairPage が使用）。upsertJoinedMember（onMemberJoined→UserRepository 記録。表示名は受理管理者のみ可視・既存メンバーと同名なら「(2)」からの連番付与）(→04,11)
- `lib/linkself/network-store.ts` — ネットワーク実体（メンバー・ロール表）と使用済み招待ノンスの localStorage 永続ストア（LocalStorageNetworkStore / LocalStorageConsumedNonceStore）。in-memory だとリロードで消え招待が network_not_found 拒否になるのを防ぐ (→01,04)
- `lib/linkself/shared-store.ts` — groupshare 共有レコード（LocalStorageSharedStorage、catch-up 高水位・LWW 判定材料の保持）と membership epoch（LocalStorageEpochStore、スナップショット巻き戻り防止）の localStorage 永続 (→01)
- `lib/linkself/user-mailbox.ts` — ユーザー鍵を transport 鍵にした短命 libp2p 接続でメールボックスへ届く MailboxTransport を作る（withUserMailboxTransport。fetch/ack のスコープ＝transport DID をユーザー DID にする経路。link-self spec §7.6。ロスター同期とフィードバック送受信が共用）(→01,07,11)
- `lib/linkself/relays.ts` — VITE_LINKSELF_RELAYS（`did=multiaddr` カンマ区切り）→ KnownPeer[] の解析（parseRelays。linkself-services から移設し軽量経路と共用・旧 import 元へは再エクスポート）(→01,11)
- `lib/linkself/roster-mailbox-sync.ts` — ロスターメールボックス同期の純ロジック（syncRosterWithMailbox = fetch→mergeSiblingRoster 統合→手元が新しい/空なら deposit。transport 生成と分離しテスト可能）(→01,11)
- `lib/linkself/sync-state-heal.ts` — 同期状態の自己修復（healDivergedSyncState）。グループ DB が新規（sqlite_master 空）なのに同期フラグ（scopedTables/sharedRecords）が残る食い違い＝iOS「ホーム画面に追加」等の部分コピーを検出し、フラグ＋旧データ移行ソースキー（陳腐データの再インポート→includeExisting 新スタンプ配送での巻き戻し防止）を破棄して初回一括配送＋全量 catch-up をやり直させる。epochs/networkId/未移行現役リポジトリは保持。linkself-services が DB open 直後（in-memory フォールバック時を除く）に呼び、healed 起動はレガシー移行もスキップ (→01)
- `lib/linkself/shared-events.ts` — ScopeNetwork 受信適用（`hvs:shared-applied`。UsersPage/IdentityContext + useSharedApplied 経由で区域一覧/ダッシュボード/領域管理/地図/訪問画面/申請一覧が購読）・ロスター更新（`hvs:roster-updated`。SettingsPage デバイス一覧が購読）・同期リペア要求（`hvs:sync-repair-requested`。map-storage が発火し linkself-services が完全 catch-up 実行）の window イベント定数・画面別購読テーブル群プリセット。重量級 linkself-services に依存しない軽量モジュール (→01,04)
- `lib/linkself/full-sync-schedule.ts` — 完全 catch-up（アンチエントロピー）の実行判定純ロジック（起動時=未実行なら即・約 10 分周期・リペア要求は 60 秒クールダウン。docs/wants/01「同期完全性の補完」）(→01)
- `lib/linkself/known-members.ts` — 既知メンバー（招待発行者=管理者）到達アドレスのローカル永続（アクティブスロットの名前空間。未作成時は旧 `hvs.knownMembers`）。presence 未実装のため次回起動の FastStart で管理者へ再ダイヤルするハブ型トポロジの土台 (→01)
- `data/linkself/linkself-user-repository.ts` — UserRepository の MyDB(SQL) 実装（users/member_tags。OPFS 永続 + ScopeNetwork でメンバー間同期。invitations は廃止フローのため InMemory 委譲。USER_SYNC_TABLES）(→01,04)
- `domain/models/device.ts` — 個人デバイス（自 DID に紐づく端末）モデル（deviceId/label。ラベルの SoT はロスター、fromRoster 行は改名可・削除不可）
- `lib/device-directory.ts` — デバイスディレクトリ（ロスターのラベル更新 setLabel / 端末削除=失効 removeDevice）のサービスロケータ。linkself-services が実装（rev+1 再署名+announce+対象端末宛送信）を登録し、main バンドルの identity-service が @linkself/core 非依存で呼ぶ (→01)
- `lib/full-reset.ts` — 端末の全初期化（デバイス失効の受理時）。graceful stop→OPFS 削除（best-effort）→localStorage/sessionStorage クリア→削除通知フラグ→再読込。オンボーディングが通知を消費表示 (→01)
- `pages/OnboardingPage.tsx` — 初回オンボーディング（ID 作成=創設グループ名の設定込み / 既存端末から URL・コード引き継ぎ。AppBrand 表示。デバイス失効による初期化直後は削除通知を消費表示）(→01,10)
- `pages/PairPage.tsx` — 端末ペアリング取り込み（`#/pair?d=…`。DID 照合で分岐: 未登録は登録＋再読込で LinkSelf 再配線（残骸破棄・拡張適用は completePairing＝サービス側）・同一 DID は冪等スルー＋欠けた器のみ取り込み・別 DID は確認のうえ切替=旧自己レコード削除→completePairing・失敗時は QR 再発行案内でオンボーディングへ誘導しない。フラグメント除去）(→01,10)
- `pages/JoinPage.tsx` — グループ招待取り込み（`#/join?i=…`。別 DID が招待を受けて参加。AppBrand+「○○グループに招待されています」（`&g=`）+招待ロール表示。ID 未作成なら作成へ誘導・参加は GroupNetwork.join。管理者不達時は joinAsync で非同期参加へフォールバックし成立待ち表示、受理結果イベントで完了/失効へ遷移。成立/預け時にグループ名をローカル保存）(→10,11)
- `components/GroupInviteSection.tsx` — グループ招待の発行 UI（管理者専用・admin 以外は非表示。参加ロール選択=既定活動メンバー・3 日期限の URL/QR 発行・コピー・グループ名同梱。メンバー管理画面 `/users` に配置）(→11)
- `components/GroupNameSection.tsx` — グループ名の表示・変更 UI（管理者専用。`/users` に配置。見出し横に現在値プレビュー・未保存/保存済みの状態表示付きで、招待 URL に同梱される表示名を編集）
- `contexts/GroupNetworkContext.tsx` — グループ招待/参加ファサード（GroupNetworkService）の DI。ネットワーク未配線時は null (→01,11)
- `components/QrCode.tsx` — テキスト（ペアリング URL 等）を QR canvas 描画（誤り訂正 L=容量優先・生成失敗時は URL コピーへ誘導するフォールバック表示）
- `pages/UsersPage.tsx` — メンバー一覧（編集=表示名/ロール直接変更・削除=LinkSelf グループからの削除、自分の行はロール変更/削除不可）とタグ CRUD・検索/フィルタ画面。`hvs:shared-applied` で同期受信時に自動再読込 (→10)
- `domain/models/user.ts` — メンバー/ロール(admin/editor/member)権限判定・メンバータグ
- `domain/models/invitation.ts` — グループ参加・ロール任命の招待モデル
- `domain/repositories/user-repository.ts` — メンバー/メンバータグ/招待の永続化 IF
- `data/inmemory/inmemory-user-repository.ts` — UserRepository の InMemory 実装

## 05 チェックアウト（返却回収/担当者/区域アクセス権/区域招待）
- `services/checkout-service.ts` — チェックアウト操作（排他制約 + ポリゴン紐付け必須・期間ゲート廃止）・担当者/招待・区域アクセス権・訪問記録書込
- `pages/AreasPage.tsx` — 区域一覧（editor+。親番テーブル絞り込み・行展開で区域・チェックアウト状況表示、担当者割り当て・回収・招待管理。旧 `/checkouts` を置換 2026-07-16）(→02,10)
- `components/InviteDialog.tsx` — 招待管理ダイアログ（既発行一覧・取消＋新規発行〔被招待者選択/TTL〕。経路=ダッシュボード/区域一覧）(→07)
- `domain/models/access.ts` — 訪問記録画面の編集/読取アクセスモードと親子合成
- `domain/models/checkout-invitation.ts` — 区域招待（時間制限付き参加）モデルと有効判定
- `domain/models/visit.ts` — 訪問記録＋チェックアウト（排他取得）モデル・申請要否判定 (→08)
- `domain/repositories/checkout-repository.ts` — チェックアウト/区域招待/訪問記録/編集履歴の永続化 IF
- `data/inmemory/inmemory-checkout-repository.ts` — CheckoutRepository の InMemory/localStorage 実装
- `data/linkself/linkself-checkout-repository.ts` — CheckoutRepository の MyDB(SQL) 実装（checkouts/checkout_invitations/visit_records/visit_record_edits。OPFS 永続 + ScopeNetwork）(→01,08)

## 06 網羅管理（網羅活動/進捗/予定）
- `domain/models/coverage.ts` — 区域親番単位の網羅活動（進捗率/ステータス）モデル
- `domain/repositories/coverage-repository.ts` — 網羅活動の永続化 IF
- `data/inmemory/inmemory-coverage-repository.ts` — CoverageRepository の InMemory/localStorage 実装
- `data/linkself/linkself-coverage-repository.ts` — CoverageRepository の MyDB(SQL) 実装（coverages。OPFS 永続 + ScopeNetwork）(→01)
- 「チェックアウト可能期間（AvailablePeriod）」は 2026-07-13 廃止（旧 `available-period*` / `CoveragePage` は削除。網羅進捗参照画面は後続フェーズ）

## 07 通知と申請（通知/申請/監査ログ/フィードバック/データ保持）
- `pages/RequestsPage.tsx` — 申請一覧（全区域の単一リスト＋ステータスバッジ〔未処理/保留/処理済み〕・区域ID/区域名検索・申請日/処理日期間・ステータス絞り込み〔初期=未処理〕・行内ステータス変更・申請者名表示・対象の訪問記録画面への遷移〔?place= で場所選択・部屋は親集合住宅へ読み替え〕・受信同期で自動更新）(→10)
- `pages/FeedbackPage.tsx` — フィードバック画面（送信フォーム=宛先〔管理者/開発者〕×種別〔バグ報告/応援/その他〕・送信履歴=管理者宛同期テーブル自分の分+開発者宛ローカルスレッド（返信併記）・管理者の受信一覧+ステータス2値・開発者 DID 一致時の受信ボックス+返信。表示時にメールボックス同期。LinkSelf 依存は動的 import）(→10)
- `components/VisitRecordDialog.tsx` — 訪問記録入力（結果/メモ）＋編集リクエスト（要削除/要移動/その他）(→08)
- `domain/models/notification.ts` — 任命/貸出/返却/申請結果等の通知モデル
- `domain/models/request.ts` — 各種申請（場所削除/情報修正/地図更新/訪問拒否）モデル
- `domain/models/feedback.ts` — 管理者宛フィードバック（種別/ステータス2値）モデル
- `domain/models/audit.ts` — 重要操作（ロール変更/強制回収等）の監査ログモデル
- `domain/repositories/notification-repository.ts` — 通知/申請/フィードバック/監査ログの永続化 IF
- `data/inmemory/inmemory-notification-repository.ts` — NotificationRepository の InMemory/localStorage 実装
- `data/linkself/linkself-notification-repository.ts` — NotificationRepository の MyDB(SQL) 実装（notifications/requests/feedback/audit_log。OPFS 永続 + ScopeNetwork）(→01)
- `lib/feedback-store.ts` — 開発者宛フィードバックのローカル保存（送信スレッド+返信・開発者受信ボックス。envelopeId 重複排除・ストア文書の union 統合 mergeFeedbackStoreSnapshot・`hvs:feedback-updated` イベント）
- `lib/linkself/feedback-mailbox.ts` — 開発者宛フィードバックの封緘送受信と兄弟端末同期（ユーザー鍵署名+seal→開発者 DID 宛 mailboxDeposit・自 DID 宛 fetch=検証済み封筒のみ=ロスター等と共存・**ストア文書**=ローカルストアを新しい順 40KiB に刈り込み自 DID 宛に預けて兄弟端末が union 統合+TTL 更新（ノード封筒上限 64KiB 対策）・ack は文書に実際に載った封筒のみ=唯一写し保護・返信・syncFeedbackMailboxWith=transport 注入でテスト可能）(→11)

## 08 活動メンバー向けアプリ（訪問記録/最新状況/場所データ）
- `services/visit-service.ts` — 訪問結果5値・VisitRecord/VisitService 型・申請要否判定・区域内記録一覧
- `services/visit-binding-adapter.ts` — VisitBindingAPI を CheckoutService/CheckoutRepository 上に実装
- `pages/VisitPage.tsx` — 訪問記録画面（記録入力・場所の直接追加/一覧＋直接編集〔編集メンバー×非タッチのみ。部屋の追加/番号編集/削除は全メンバー・タッチ可＋同番号復元〕・編集リクエスト）(→03,10)
- `pages/VisitPageContainer.tsx` — 訪問記録画面の DI 組立ラッパ（直接編集権限判定・活動メンバーのアクセス制御・?place= の初期場所選択）(→01)
- `pages/DashboardPage.tsx` — ダッシュボード（アクセス可能区域一覧・返却/招待管理導線〔担当者本人の招待一覧・取消・発行〕。チェックアウト可能一覧は活動メンバーのみ＝editor+ は /areas から）(→10)
- `components/BuildingVisitDialog.tsx` — 集合住宅の部屋一覧と訪問対象部屋選択・部屋編集モード（「部屋を編集」で RoomRowsEditor に切替＝編集ダイアログと共通 UI・確定で一括保存・キャンセル/Esc は破棄確認、全メンバー・タッチ可）(→03,07)
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
- `lib/linkself/device-roster.ts` — デバイスロスターのローカル永続・自端末登録（`loadOrCreateRoster()`/`addDeviceToRoster()`/`setDeviceLabelInRoster()`=ラベル変更を rev+1 再署名/`removeDeviceFromRoster()`=失効を rev+1 再署名/`persistRoster()`/`consumePendingSiblingDevices()`=payload 由来の兄弟 DID を追加署名）。ロスターは rev + tombstone 付き（新規は rev1、変更毎に +1。高 rev が merge で全面採用されラベル変更が伝播、失効は tombstone=removed に明示記録され union でも復活しない）。ユーザー鍵署名の `userDID→[deviceDID+label]` を localStorage `hvs.deviceRoster` に marshal 保管し、永続のたび `hvs:roster-updated` を発火（UI 即時反映）。自端末を必ず登録し、別ユーザー/破損時は作り直す。兄弟端末の収束は接続時のロスター announce 統合（link-self `mergeSiblingRoster`。onRosterUpdated で永続）とペアリング payload 同梱で成立。link-self `roster.ts` と対
- `lib/linkself/identity-bridge.ts` — アプリの identity（32byte Ed25519 シード, `identity-crypto.ts`）から @linkself/core の `Identity` を導出（`linkselfIdentityFromSeed`）。同一シード→同一 did:key で既存ユーザーの DID を保ったまま LinkSelf 統合へ移行（04節 identity-service と対）
- `data/linkself/linkself-personal-repository.ts` — PersonalRepository の LinkSelf(MyDB SQL) 実装。アプリ設定(`my_settings`)・非表示tip(`hidden_tips`)を MyDB の SQL テーブル（ブラウザは OPFS SAHPool VFS の SQLite=リロード永続）に保存。書き込みは wireSqlSync が devicesync へミラー（ScopeDevice=将来の端末間同期に接続）。ノート/タグは当面 InMemory 委譲。※KV 面は MemDeviceStorage=インメモリで永続しないため設定は SQL 面に載せる（ScopeDevice フェーズ Slice-1）
- `contexts/linkself-services.ts` — LinkSelf-backed のサービス束 `createLinkSelfServices()`（`{services, stop}` を返す）。個人設定 + **グループドメイン全テーブル**（users/member_tags=LinkSelfUserRepository、regions/places/checkouts/coverages/notifications/map_* = 各 LinkSelf*Repository + LinkSelfMapBinding。ScopeNetwork 配線 = networkId 確定時に GROUP_SYNC_TABLES を setSyncScope、includeExisting は初回のみ（スロット名前空間の scopedTables）、受信適用と参加受理記録は `hvs:shared-applied` イベント発火＝テーブル単位 100ms 合流（開いている画面が自動更新・バースト時の再読込連発を防止）、旧 localStorage データの一度きり移行（users + legacy-group-data-migration。昇格前に実行し初回一括配送へ載せる）、差し替えリポジトリ依存の auth/checkout/visit/place/regionBinding/mapBinding サービス再構築、既知メンバー + ロスター掲載兄弟端末（リレー circuit アドレス合成）への FastStart 接続、60 秒ポーリング=checkMailbox+未接続兄弟への再ダイヤル+約 10 分毎の完全 catch-up（アンチエントロピー。起動配線後 1 回 + `hvs:sync-repair-requested` 購読で不整合検出時に即時リペア＝full-sync-schedule が判定・接続中ピアのみ）、onRosterUpdated でロスター永続=UI イベント発火・自分の tombstone を受理したら全初期化=wipeThisDevice（不在のみでは初期化しない=ペアリング未収束と区別。起動時にも残骸チェック）、DeviceDirectory 登録=ラベル変更/失効を rev+1 再署名し client.updateRoster で即時 announce・失効は対象端末宛に sendRosterTo=store-and-forward、ロスターメールボックス=起動時にユーザー DID 宛の最新ロスターを取得・統合（自分の tombstone なら全初期化・新規兄弟へ即時 redial）し変更時 3 秒合流で預け直し）を OPFS-backed MyDB(SQL) に永続し残りは `createInMemoryServices` 流用。**DB はグループ毎に分離**（個人設定=hvs-personal.db / グループ系=hvs-group-<slotId>.db。networkId・scopedTables・sharedRecords・membershipEpochs もスロット名前空間キー。既所属と異なる networkId の参加は新スロットを作って切替＝上書きしない追加参加ガード。docs/wants/01「グループ毎のローカル DB 分離」）。2 モード: **スタンドアロン**（リレー/identity 未指定=libp2p 起動なし・ローカル永続のみ）と**ネットワーク**（seed+relays 指定時=実 identity で `LinkSelfClient` 起動・`client.myDB` 使用・FastStart 接続・graceful stop）。ネットワーク配線失敗はスタンドアロンへフォールバック。ネットワーク時はメールボックス（=リレー同一ノード）を配線し、成立待ち復元 + 起動時/60 秒間隔の checkMailbox ポーリング（管理者の無人受理・被招待者の結果受領）。`parseRelays()` は lib/linkself/relays.ts へ移設（互換の再エクスポートあり）。`VITE_LINKSELF` 有効時に `main.tsx` から動的 import（sqlite-wasm 遅延ロード）
- `lib/linkself/linkself-wiring.test.ts` — @linkself/core が alias 経由で pwa のツールチェーン下に解決・トランスパイルできる配線確認（CP-A）
- `lib/linkself/linkself-interop.test.ts` — client-factory から Go ノード（link-self/core `poc-wsnode`）へ実 WebSocket 接続・LinkSelf auth・echo 往復の自動 interop 検証（CP-B、`go` 無ければ skip）
- 依存リンク: `@linkself/core` は姉妹リポジトリ `../../link-self/ts/linkself/src` の TS ソースを Vite `resolve.alias` + tsconfig `paths` で直接参照（build 不要）。libp2p 実行時依存は pwa 側に固定バージョンで導入し `resolve.dedupe` で単一化（`pwa/vite.config.ts` / `pwa/tsconfig.json`）
