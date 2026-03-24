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
| `map_networks` | `{regionId}` | ポリゴンネットワーク | editor+ | 永続 |

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
    ID             string     `json:"id"`
    AreaID         string     `json:"areaId"`
    Coord          Coordinate `json:"coord"`
    Type           PlaceType  `json:"type"`
    Label          string     `json:"label"`          // 表札名等
    ParentID       string     `json:"parentId"`       // 集合住宅の場合、親建物のID
    Floor          int        `json:"floor"`          // ★追加: 階数（部屋の場合）
    RoomNumber     string     `json:"roomNumber"`     // ★追加: 部屋番号
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

#### H1. LinkSelf Groupと組織グループの関係

**現状**: 仕様では「管理スタッフと活動スタッフは同じグループに所属」(01)とあり、全員が1つのLinkSelf Groupに参加する。一方で「管理者はLinkSelf内に複数のグループを作成しメンバーを割り当てる」(04)とも記載。

**問題**: LinkSelfの`GroupAPI`で組織グループ（Aグループ、Bグループ）も作るのか、1つのLinkSelf Groupの中でアプリ層で管理するのか。

**提案**: 1つのLinkSelf Groupに全員が参加し、組織グループは`org_groups`チャネルでアプリ層管理とする。理由：
- GroupShareのAccessPolicyはLinkSelf Group単位。組織グループごとにLinkSelf Groupを分けると、グループ横断のデータ共有（チーム組成等）ができない
- 組織グループは頻繁に再編される可能性があり、LinkSelf Group操作（DHT更新等）は重い

**要決定**: この方針でよいか。

#### H2. マルチリージョン（複数領域）のデータ分離

**現状**: GroupShareは全メンバーに配信される。成田市と富里市の両方の領域がある場合、全メンバーに両方のデータが届く。

**問題**: 領域Aの活動スタッフが領域Bのデータを受け取る必要があるか。データ量が大きい場合にトラフィックの懸念。

**提案**: topicベースのSubscriptionで解決する。活動スタッフは自分が関与する領域のtopicのみSubscribeする。AccessPolicyレベルでの制限は不要（領域間で秘匿が必要なデータはない想定）。

**要決定**: 領域間のアクセス制御が必要なケースがあるか。

#### H3. Activity と Team の多対多関係（日時情報）

**現状**: 仕様(05)「1つの訪問活動に対して日時ごとに複数のチームを紐づけ」。既存の`ActivityTeamAssignment`には日時情報がない。

**対応**: `ActivityDate`フィールドを追加済み（2-3参照）。

**要確認**: 「日時ごと」は日付単位か、それとも時間帯まで区別するか。

#### H4. 同一区域の複数チェックアウト

**現状**: 仕様(05)「同じ区域を複数のチームに貸し出すことができる」。

**問題**: 同一AreaIDに対して複数のActivityレコードが存在する状態で、網羅活動の進捗をどう算出するか。

**提案の選択肢**:
- A) 全Activityの訪問記録をマージして完了率を算出する（同じPlaceへの重複訪問は1回とカウント）
- B) Activityごとの完了はそれぞれ独立で、Coverage側で「最も進んでいるActivity」を採用する

**要決定**: 進捗算出のロジック方針。

#### H5. VisitRecordの留守情報の共有範囲

**現状**: 仕様(08)で「留守情報はLinkSelfグループ全体に共有して他のメンバーがその場所を再網羅できる」、一方「個人情報に当たるので他のメンバーに共有されない」。

**対応済み**: 本設計では以下のように分離している：
- **GroupShare**: `Result`（met/absent）, `VisitedAt`, `PlaceID` — 共有
- **DeviceDB**: `PersonalNote` — 個人

**要確認**: 留守の詳細情報（「何時頃不在」「車はあったが応答なし」等）はGroupShare側に持つべきか、PersonalNote側か。他メンバーの再訪問判断に役立つ情報はGroupShareに含めたほうがよい可能性がある。

### 5-2. 重要度：中

#### M1. 外国人居住情報の構造

**仕様参照**: (08)「言語によっては専従スタッフが訪問できるように情報を切り分ける」

**問題**: PlaceモデルにLanguageフィールドを追加するか、別モデルにするか。

**提案**: Placeに `Languages []string` フィールドを追加する。例: `["en", "zh"]`。簡素で実用的。

#### M2. 集合住宅の階・部屋構造の詳細

**仕様参照**: (03)「メゾネットタイプだと記述を工夫したほうが良い」

**現設計**: `Floor` + `RoomNumber` で基本構造をカバー。メゾネット（1つの部屋が2階にまたがる）は`Floor`を入居階として扱い、備考をLabelに記載する運用で対応できる。

**要確認**: より複雑な構造（棟番号など）への対応が必要か。

#### M3. 承認フローのデータモデル

**仕様参照**: (04)「一そろいの領域内区域が完成した時点で管理者が承認」、(06)「予定策定・編集も承認フロー」

**現設計**: Regionの`Approved` bool、CoveragePlanの`Approved` boolで対応。

**問題**: 承認履歴（誰がいつ承認したか）を記録する場合、以下の選択肢がある：
- A) AuditLogに記録するだけで十分（現設計）
- B) 汎用Approvalモデルを新設する

**提案**: A) AuditLogで対応。承認は頻繁に発生しないため専用モデルは過剰。

#### M4. データ保持期間の管理

**仕様参照**: (07)「LinkSelfの設定値として保持期間を管理者が設定」

**対応**: LinkSelfの`ChannelOption`にRetention設定がある。アプリ層で管理者が設定するUIと、チャネル登録時のRetention指定を実装する。

**要設計**: 保持期間設定のためのアプリ設定モデル（`AppConfig`等）が必要になる可能性がある。

#### M5. ポリゴンネットワークのGroupShare化

**現状**: `network.json`ファイルに保存（`MapBinding.SaveNetworkJSON`）。

**問題**: LinkSelfで同期する場合、JSONをまるごとGroupShareのレコードとして格納するか、ポリゴン単位でレコード化するか。

**提案**: 初期はJSONまるごと1レコードとして`map_networks`チャネルに格納。ポリゴン数が増え同時編集が頻発する場合に分割を検討する。

**理由**: map-polygon-editorはネットワーク全体をJSONとして読み書きする設計。レコード分割するとEditorのAPI変更が必要。

#### M6. 罷免時のデータ遷移

**仕様参照**: (04)「LinkSelfグループからの削除：担当者なしになる。未処理タスクも担当者なしになる」

**問題**: Activity.OwnerIDやRequest.SubmitterIDが削除されたDIDを参照し続ける。

**提案**: 削除時にActivityのOwnerIDを空文字にクリアするバッチ処理を行う。VisitRecordのUserIDは履歴として残す（誰が訪問したかは事実として保持）。

**要決定**: DID削除後もVisitRecord.UserIDを保持してよいか（データ保持ポリシー）。

### 5-3. 重要度：低

#### L1. NTPスキュー問題

LinkSelfはLast-Write-Winsで競合解決する。オフラインで活動し、オンライン復帰時にデバイス時刻がずれていると、意図しない上書きが発生しうる。

**対応**: アプリ起動時にNTP同期チェックを行い、大幅なずれ（例: 5分以上）を検出した場合はユーザーに警告する。

#### L2. ダンプ/リストアの粒度

GroupShareの`Dump`はGroupID単位で全チャネルの全データを出力する。領域単位のエクスポートが必要なら、アプリ層でフィルタリングする。

#### L3. 管理者0人問題

仕様(04)で「管理者は自己罷免不可」と明記。データモデル層での制約はなく、ビジネスロジック（ロール変更処理）で担保する。

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
