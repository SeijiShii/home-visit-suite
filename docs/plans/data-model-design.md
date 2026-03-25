# データモデル設計計画

## 概要

Home Visit Suiteの全データモデルをLinkSelfの運用前提で設計する。
仕様書（`docs/wants/01〜09`）を基に、既存モデルの改修と新規モデルの追加を行う。

---

## 1. LinkSelfストレージへのマッピング方針

LinkSelfには2つのストレージレイヤーがある。

| レイヤー | 用途 | 同期範囲 | API |
|---|---|---|---|
| **DeviceDB** | 同一ユーザーのデバイス間同期 | 個人のみ | `Put/Get/Delete/List` by table |
| **GroupShare** | 異なるユーザー間の共有 | グループメンバー | `Put/Get/Delete/List` by channel × topic |

データの性質に応じて以下のように振り分ける。

- **個人データ（他メンバーに共有されない）** → DeviceDB
- **共有データ（グループ全体で参照）** → GroupShare

### 1-1. DeviceDB テーブル設計

個人に閉じたデータを格納する。

| table名 | 内容 | 根拠（仕様参照） |
|---|---|---|
| `personal_notes` | 訪問記録の個人メモ | 「他メンバーに共有されない」(08) |
| `personal_tags` | 個人タグ定義 | 「自前のタグを登録して検索や管理」(08) |
| `personal_tag_assignments` | タグと訪問記録の紐づけ | 同上 |
| `my_settings` | アプリ個人設定 | 個人環境 |

### 1-2. GroupShare チャネル設計

全メンバーで共有するデータを格納する。topicにより必要なデータだけをSubscribeできる。

| channel | topic | 内容 | Write権限 | 保持期間 |
|---|---|---|---|---|
| `regions` | `{regionId}` | 領域 | admin | 永続 |
| `parent_areas` | `{regionId}` | 区域親番 | editor+ | 永続 |
| `areas` | `{parentAreaId}` | 区域 | editor+ | 永続 |
| `places` | `{areaId}` | 場所（住宅情報） | editor+（活動staffは申請経由） | 永続 |
| `users` | `roster` | ユーザー名簿・ロール | admin | 永続 |
| `org_groups` | `roster` | 組織グループ・所属 | admin | 永続 |
| `member_tags` | `roster` | メンバータグ定義 | editor+ | 永続 |
| `teams` | `{regionId}` | チーム | editor+, activity staff | 永続 |
| `activities` | `{areaId}` | 訪問活動（チェックアウト） | editor+（持ち出しはactivity staff） | 管理者設定 |
| `activity_assignments` | `{activityId}` | チーム割り当て | editor+ | 管理者設定 |
| `visit_records` | `{areaId}` | 訪問記録（共有部分） | activity staff（自分の記録） | 管理者設定 |
| `visit_record_edits` | `{visitRecordId}` | 訪問記録編集履歴 | editor+, activity staff | 管理者設定 |
| `coverages` | `{parentAreaId}` | 網羅活動 | editor+ | 管理者設定 |
| `coverage_plans` | `{coverageId}` | 網羅予定 | editor+（承認フロー） | 管理者設定 |
| `area_availability` | `{coveragePlanId}` | 区域の可用性設定 | editor+ | 管理者設定 |
| `requests` | `{areaId}` | 活動staffからの申請 | activity staff(作成), editor+(処理) | 管理者設定 |
| `invitations` | `{targetDID}` | 招待・任命 | admin/editor+ | 90日 |
| `notifications` | `{targetDID}` | 通知 | system | 30日 |
| `audit_log` | `{regionId}` | 監査ログ | system | 永続 |
| `map_vertices` | `{regionId}` | ポリゴン頂点 | editor+ | 永続 |
| `map_edges` | `{regionId}` | ポリゴン辺 | editor+ | 永続 |
| `map_polygons` | `{regionId}` | ポリゴン定義 | editor+ | 永続 |

#### topicの設計意図

活動スタッフアプリはチェックアウト中の区域に関連するtopicのみSubscribeすることで、必要最小限のデータだけを同期できる。例えば、区域 `NRT-001-05` をチェックアウトした活動スタッフは以下をSubscribeする：

- `places` topic=`{areaId}` — その区域内の場所データ
- `visit_records` topic=`{areaId}` — その区域の訪問記録
- `activities` topic=`{areaId}` — その区域の訪問活動データ

---

## 2. 既存モデルの変更

### 2-1. User — 組織グループ所属の追加

**ファイル**: `shared/domain/models/user.go`

```go
type User struct {
    ID         string    `json:"id"`         // LinkSelf DID
    Name       string    `json:"name"`       // 表示名
    Role       Role      `json:"role"`
    OrgGroupID string    `json:"orgGroupId"` // ★追加: 組織グループ（排他的所属）
    TagIDs     []string  `json:"tagIds"`     // ★追加: メンバータグIDリスト
    JoinedAt   time.Time `json:"joinedAt"`   // ★追加: 参加日時
}
```

**変更理由**:
- 仕様(04)「メンバーは排他的に1つのグループにのみ所属」— `OrgGroupID`が必要
- 仕様(04)「編集スタッフは他のメンバーにタグを付与」— `TagIDs`が必要

### 2-2. Activity — チェックアウト経路と時系列の追跡

**ファイル**: `shared/domain/models/visit.go`

```go
type CheckoutType string

const (
    CheckoutTypeLending  CheckoutType = "lending"   // 貸し出し（編集staff主体）
    CheckoutTypeSelfTake CheckoutType = "self_take"  // 持ち出し（活動staff主体）
)

type Activity struct {
    ID             string         `json:"id"`
    AreaID         string         `json:"areaId"`
    CoveragePlanID string         `json:"coveragePlanId"` // ★追加: 網羅予定との紐づけ
    CheckoutType   CheckoutType   `json:"checkoutType"`   // ★追加: 貸出 or 持ち出し
    OwnerID        string         `json:"ownerId"`        // 担当者
    LentByID       string         `json:"lentById"`       // ★追加: 貸し出した編集staff（持ち出し時は空）
    Status         ActivityStatus `json:"status"`
    CreatedAt      time.Time      `json:"createdAt"`
    ReturnedAt     *time.Time     `json:"returnedAt"`     // ★追加: 返却日時
    CompletedAt    *time.Time     `json:"completedAt"`    // ★追加: 完了日時
    UpdatedAt      time.Time      `json:"updatedAt"`
}
```

**変更理由**:
- 仕様(05)「2つの経路: 貸し出しと持ち出し」— `CheckoutType`
- 仕様(05)「他のチームに貸し出す場合は編集staffが担当者」— `LentByID`
- 仕様(05)「返却・回収」— `ReturnedAt`, `CompletedAt`

### 2-3. ActivityTeamAssignment — 活動日の追加

**ファイル**: `shared/domain/models/visit.go`

```go
type ActivityTeamAssignment struct {
    ID           string    `json:"id"`
    ActivityID   string    `json:"activityId"`
    TeamID       string    `json:"teamId"`
    ActivityDate time.Time `json:"activityDate"` // ★追加: 活動日
    AssignedAt   time.Time `json:"assignedAt"`
}
```

**変更理由**:
- 仕様(05)「日時ごとに複数の訪問活動チームを紐づけ」

### 2-4. VisitRecord — 個人メモの分離とActivity紐づけ

**ファイル**: `shared/domain/models/visit.go`

```go
type VisitRecord struct {
    ID         string      `json:"id"`
    UserID     string      `json:"userId"`     // 記録した活動スタッフ
    PlaceID    string      `json:"placeId"`    // NULL可: 場所モデルへの参照
    Coord      *Coordinate `json:"coord"`      // NULL可: 場所未登録地点
    AreaID     string      `json:"areaId"`     // 活動中の区域
    ActivityID string      `json:"activityId"` // ★追加: どの訪問活動での記録か
    Result     VisitResult `json:"result"`
    // Note フィールドは削除 → DeviceDB の PersonalNote へ移動
    VisitedAt  time.Time   `json:"visitedAt"`
    CreatedAt  time.Time   `json:"createdAt"`
    UpdatedAt  time.Time   `json:"updatedAt"`
}
```

**変更理由**:
- 仕様(08)「活動スタッフは訪問時の家の人の反応などの情報を記述できる。これらは個人情報に当たるので他のメンバーに共有されない」
- NoteはGroupShareではなくDeviceDBに格納すべき

### 2-5. Place — 集合住宅の階・部屋構造と追跡フィールド

**ファイル**: `shared/domain/models/place.go`

```go
type Place struct {
    ID             string     `json:"id"`             // UUID
    AreaID         string     `json:"areaId"`
    Coord          Coordinate `json:"coord"`
    Type           PlaceType  `json:"type"`
    Label          string     `json:"label"`          // 表札名等
    DisplayName    string     `json:"displayName"`    // ★変更: 部屋番号等の表示名（文字列）
    ParentID       string     `json:"parentId"`       // 集合住宅の場合、親建物のID
    SortOrder      int        `json:"sortOrder"`      // ★追加: 並び順（編集staff変更可）
    Languages      []string   `json:"languages"`      // ★追加: ISO 639-1コード
    DoNotVisit     bool       `json:"doNotVisit"`
    DoNotVisitNote string     `json:"doNotVisitNote"` // ★追加: 訪問不可理由
    CreatedAt      time.Time  `json:"createdAt"`      // ★追加
    UpdatedAt      time.Time  `json:"updatedAt"`      // ★追加
}
```

**変更理由**:
- 仕様(03)「集合住宅は部屋構成や部屋番号を記述できる方式」
- 仕様(08)「訪問をしないお家」の理由記録

### 2-6. CoveragePlan — 対象区域親番の明示と追跡

**ファイル**: `shared/domain/models/coverage.go`

```go
type CoveragePlan struct {
    ID            string    `json:"id"`
    CoverageID    string    `json:"coverageId"`
    GroupID       string    `json:"groupId"`       // 対象グループ（""=全メンバー）
    ParentAreaIDs []string  `json:"parentAreaIds"` // ★追加: 対象区域親番リスト
    StartDate     time.Time `json:"startDate"`
    EndDate       time.Time `json:"endDate"`
    Approved      bool      `json:"approved"`
    CreatedAt     time.Time `json:"createdAt"`     // ★追加
    UpdatedAt     time.Time `json:"updatedAt"`     // ★追加
}
```

**変更理由**:
- 仕様(06)「グループごとに期間を指定して区域親番単位で割り当て」— 対象のParentAreaIDsが必要

---

## 3. 新規モデル

### 3-1. AreaAvailability — 区域の可用性設定

**新規ファイル**: `shared/domain/models/availability.go`

```go
type AvailabilityType string

const (
    AvailabilityLendable AvailabilityType = "lendable"  // 貸出可能
    AvailabilitySelfTake AvailabilityType = "self_take"  // 持ち出し可能
)

type AreaAvailability struct {
    ID             string           `json:"id"`
    CoveragePlanID string           `json:"coveragePlanId"`
    AreaID         string           `json:"areaId"`
    Type           AvailabilityType `json:"type"`
    ScopeGroupID   string           `json:"scopeGroupId"` // ""=全メンバー対象
    StartDate      time.Time        `json:"startDate"`
    EndDate        time.Time        `json:"endDate"`
    SetByID        string           `json:"setById"`      // 設定した編集staff
    CreatedAt      time.Time        `json:"createdAt"`
}
```

**根拠**: 仕様(05)(06)の核心的な要件。貸出可能 ⊃ 持ち出し可能の包含関係をモデル化する。

### 3-2. Invitation — 招待・任命

**新規ファイル**: `shared/domain/models/invitation.go`

```go
type InvitationType string

const (
    InvitationTypeGroupJoin   InvitationType = "group_join"    // LinkSelfグループ招待
    InvitationTypeRolePromote InvitationType = "role_promote"  // ロール任命
)

type InvitationStatus string

const (
    InvitationStatusPending  InvitationStatus = "pending"
    InvitationStatusAccepted InvitationStatus = "accepted"
    InvitationStatusDeclined InvitationStatus = "declined"
)

type Invitation struct {
    ID          string           `json:"id"`
    Type        InvitationType   `json:"type"`
    Status      InvitationStatus `json:"status"`
    InviterID   string           `json:"inviterId"`   // 招待者のDID
    InviteeID   string           `json:"inviteeId"`   // 対象者のDID
    TargetRole  Role             `json:"targetRole"`   // 任命先ロール
    Description string           `json:"description"`
    CreatedAt   time.Time        `json:"createdAt"`
    ResolvedAt  *time.Time       `json:"resolvedAt"`
}
```

**根拠**: 仕様(04)「招待を受理すると成立」— 招待の承諾待ち状態を管理するモデルが必要。

### 3-3. Notification — 通知

**新規ファイル**: `shared/domain/models/notification.go`

```go
type NotificationType string

const (
    NotificationTypeInvitation    NotificationType = "invitation"     // 任命招待
    NotificationTypeLending       NotificationType = "lending"        // 区域の貸し出し
    NotificationTypeReturn        NotificationType = "return"         // 返却
    NotificationTypeForceReturn   NotificationType = "force_return"   // 強制回収
    NotificationTypeRequestResult NotificationType = "request_result" // 申請結果
)

type Notification struct {
    ID          string           `json:"id"`
    Type        NotificationType `json:"type"`
    TargetID    string           `json:"targetId"`    // 宛先DID
    ReferenceID string           `json:"referenceId"` // 関連エンティティID
    Message     string           `json:"message"`
    Read        bool             `json:"read"`
    CreatedAt   time.Time        `json:"createdAt"`
    ExpiresAt   *time.Time       `json:"expiresAt"`   // 表示期限
}
```

**根拠**: 仕様(07)「任命招待」「区域の貸し出し」等の通知表示。

### 3-4. PersonalNote — 個人メモ（DeviceDB）

**新規ファイル**: `shared/domain/models/personal.go`

```go
// PersonalNote は訪問記録に紐づく個人メモ（DeviceDBに格納、他メンバーに共有されない）。
type PersonalNote struct {
    ID            string    `json:"id"`
    VisitRecordID string    `json:"visitRecordId"`
    Note          string    `json:"note"`
    CreatedAt     time.Time `json:"createdAt"`
    UpdatedAt     time.Time `json:"updatedAt"`
}

// PersonalTag は活動スタッフが個人的に定義するタグ（DeviceDB）。
type PersonalTag struct {
    ID   string `json:"id"`
    Name string `json:"name"`
}

// PersonalTagAssignment はタグと訪問記録の紐づけ（DeviceDB）。
type PersonalTagAssignment struct {
    ID            string `json:"id"`
    TagID         string `json:"tagId"`
    VisitRecordID string `json:"visitRecordId"`
}
```

**根拠**: 仕様(08)「個人情報に当たるので他のメンバーに共有されない」「自前のタグを登録」。

### 3-5. VisitRecordEdit — 訪問記録編集履歴

**新規ファイル**: `shared/domain/models/visit_edit.go`

```go
// VisitRecordEdit は訪問記録の編集履歴。
type VisitRecordEdit struct {
    ID            string    `json:"id"`
    VisitRecordID string    `json:"visitRecordId"`
    EditorID      string    `json:"editorId"`  // 編集者のDID
    OldBody       string    `json:"oldBody"`   // 変更前のJSON snapshot
    NewBody       string    `json:"newBody"`   // 変更後のJSON snapshot
    EditedAt      time.Time `json:"editedAt"`
}
```

**根拠**: 仕様(08)「編集履歴を保持する」。

---

## 4. エンティティ関連図

```
Region (領域)
 ├── ParentArea (区域親番) [1:N]
 │    ├── Area (区域) [1:N]
 │    │    ├── Place (場所) [1:N]
 │    │    │    └── Place (部屋) [1:N, via parentId]
 │    │    ├── Activity (訪問活動) [1:N]
 │    │    │    └── ActivityTeamAssignment [1:N]
 │    │    │         └── Team (チーム) [N:1]
 │    │    ├── VisitRecord (訪問記録) [1:N]
 │    │    │    ├── PersonalNote [1:1, DeviceDB]
 │    │    │    ├── PersonalTagAssignment [1:N, DeviceDB]
 │    │    │    └── VisitRecordEdit (編集履歴) [1:N]
 │    │    ├── AreaAvailability (可用性設定) [1:N]
 │    │    └── Request (申請) [1:N]
 │    └── Coverage (網羅活動) [1:N]
 │         └── CoveragePlan (網羅予定) [1:N]
 │              └── AreaAvailability [1:N]
 └── AuditLog (監査ログ) [1:N]

User (ユーザー, DID)
 ├── OrgGroup (組織グループ) [N:1, 排他的]
 ├── Team.Members [N:M]
 ├── Activity.OwnerID [1:N]
 ├── VisitRecord.UserID [1:N]
 ├── Invitation [1:N, as inviter/invitee]
 └── Notification [1:N, as target]

OrgGroup (組織グループ)
 └── CoveragePlan.GroupID [1:N]
```

---

## 5. 検討事項

### 5-1. 重要度：高

#### H1. LinkSelf Groupと組織グループの関係 → **決定済み**

LinkSelf GroupとApp内グループは全く異なるレイヤーであり、混同しない。

- **LinkSelf Group**: P2Pデータ同期の基盤層。全メンバーが1つのLinkSelf Groupに参加し、GroupShareでデータを共有する
- **App内グループ（組織グループ）**: ビジネスロジック層。`org_groups`チャネルでアプリ側が管理する運用上の組織構造

#### H2. マルチリージョン（複数領域）のデータ分離 → **決定済み**

領域間のアクセス制御は不要。topicベースのSubscriptionによるトラフィック最適化で十分。活動スタッフは自分が関与する領域のtopicのみSubscribeする。

#### H3. Activity と Team の多対多関係（日時情報） → **決定済み**

日付単位で管理する。`ActivityTeamAssignment.ActivityDate`は`time.Time`だが日付部分のみ使用。時間帯の区別は不要。

#### H4. 同一区域の複数チェックアウト → **決定済み**

同一区域の複数チェックアウトは不可。区域の貸し出しは排他的とする。1つの区域に対してアクティブなActivityは常に最大1つ。ビジネスロジック層でActivity作成時に既存アクティブActivityの有無をチェックする。

#### H5. 留守情報の共有範囲 → **決定済み**

- **GroupShare（VisitRecord）**: PlaceID、訪問日時、結果（会えた/留守）— 他メンバーの再訪問判断に必要な事実情報
- **DeviceDB（PersonalNote）**: 詳細メモ（反応の様子、個人的な所感など）— 個人情報に該当するため非共有

### 5-2. 重要度：中

#### M1. 外国人居住情報の構造 → **決定済み**

Placeに `Languages []string` フィールドを追加。ISO 639-1コード（`en`, `zh`, `ko`, `pt`, `es`, `vi`, `tl` 等）を格納する。UIでは `golang.org/x/text/language` の表示名付き選択肢リストを提供し、一般的な外国語をほぼ全てカバーする。

#### M2. 集合住宅の階・部屋構造の詳細 → **決定済み**

- 部屋番号は建物により体系が異なるため、全て文字列管理とする
- 各Place（部屋）はUUIDを持ち、`DisplayName`として部屋番号文字列を持つ
- デフォルトは辞書順ソートだが、編集スタッフが並び順を変更可能（`SortOrder int`）
- メゾネット式の例: 101, 201, 202, 102 のような物理配置順に並べ替えできる
- `Floor` / `RoomNumber` フィールドは廃止し、`DisplayName` + `SortOrder` に統合する

#### M3. 承認フローのデータモデル → **決定済み**

専用Approvalモデルは不要。各エンティティの`Approved` boolフラグ + AuditLog（誰がいつ承認したか）で対応する。

#### M4. データ保持期間の管理 → **決定済み**

GroupShareに`app_config`チャネルを設け、管理者が設定した保持期間等のアプリ設定を格納する。チャネル登録時のRetention指定と連動させる。

#### M5. ポリゴンネットワークのGroupShare化 → **決定済み**

同時編集を可能にする。`map_networks`チャネル（JSON丸ごと）ではなく、`map_vertices` / `map_edges` / `map_polygons` の3チャネルにエンティティ単位で格納する。map-polygon-editorライブラリ側のStorageAdapterをレコード単位のput/deleteに変更する必要あり。

詳細は [map-polygon-editor-concurrent-editing.md](map-polygon-editor-concurrent-editing.md) を参照。

#### M6. 罷免時のデータ遷移 → **決定済み**

- **Activity.OwnerID**: 空文字にクリア（担当者なし）。バッチ処理で該当DIDのアクティブなActivityを更新
- **VisitRecord.UserID**: 履歴として保持（誰が訪問したかは事実情報として永続）
- **Request等の未処理タスク**: 担当者なしに変更

### 5-3. 重要度：低

#### L1. NTPスキュー問題 → **決定済み**

アプリ起動時にNTP同期チェックを行い、5分以上のずれを検出した場合はユーザーに警告する。

#### L2. ダンプ/リストアの粒度 → **決定済み**

GroupShareの`Dump`はGroupID単位。領域単位のエクスポートが必要な場合はアプリ層でフィルタリングする。

#### L3. 管理者0人問題 → **決定済み**

データモデル層での制約は不要。ビジネスロジック（ロール変更処理）で「管理者は自己罷免不可」を担保する。

---

## 6. 実装フェーズ案

| Phase | 内容 | 対象モデル | 依存 |
|---|---|---|---|
| **Phase 1** | 既存モデル修正 + 基盤 | User, Region, ParentArea, Area, Place, Geometry | なし |
| **Phase 2** | 訪問活動の核心 | Activity, Team, ActivityTeamAssignment, VisitRecord, PersonalNote, PersonalTag, VisitRecordEdit | Phase 1 |
| **Phase 3** | 網羅管理 | Coverage, CoveragePlan, AreaAvailability | Phase 1 |
| **Phase 4** | ユーザー管理・通知 | Invitation, Notification, Request, AuditLog | Phase 1 |
| **Phase 5** | LinkSelfチャネル実装 | AccessPolicy, SchemaValidator, チャネル登録・Subscribe管理 | Phase 1〜4 |

---

## 7. 全モデル一覧

| # | モデル名 | 格納先 | 状態 | ファイル |
|---|---|---|---|---|
| 1 | Region | GroupShare | 既存 | `models/region.go` |
| 2 | ParentArea | GroupShare | 既存 | `models/region.go` |
| 3 | Area | GroupShare | 既存 | `models/region.go` |
| 4 | Coordinate | — | 既存 | `models/geometry.go` |
| 5 | GeoJSONPolygon | — | 既存 | `models/geometry.go` |
| 6 | User | GroupShare | **要修正** | `models/user.go` |
| 7 | Group (OrgGroup) | GroupShare | 既存 | `models/user.go` |
| 8 | Tag | GroupShare | 既存 | `models/user.go` |
| 9 | Place | GroupShare | **要修正** | `models/place.go` |
| 10 | VisitRecord | GroupShare | **要修正** | `models/visit.go` |
| 11 | Team | GroupShare | 既存 | `models/visit.go` |
| 12 | Activity | GroupShare | **要修正** | `models/visit.go` |
| 13 | ActivityTeamAssignment | GroupShare | **要修正** | `models/visit.go` |
| 14 | Coverage | GroupShare | 既存 | `models/coverage.go` |
| 15 | CoveragePlan | GroupShare | **要修正** | `models/coverage.go` |
| 16 | Request | GroupShare | 既存 | `models/request.go` |
| 17 | AuditLog | GroupShare | 既存 | `models/audit.go` |
| 18 | AreaAvailability | GroupShare | **新規** | `models/availability.go` |
| 19 | Invitation | GroupShare | **新規** | `models/invitation.go` |
| 20 | Notification | GroupShare | **新規** | `models/notification.go` |
| 21 | PersonalNote | DeviceDB | **新規** | `models/personal.go` |
| 22 | PersonalTag | DeviceDB | **新規** | `models/personal.go` |
| 23 | PersonalTagAssignment | DeviceDB | **新規** | `models/personal.go` |
| 24 | VisitRecordEdit | GroupShare | **新規** | `models/visit_edit.go` |
