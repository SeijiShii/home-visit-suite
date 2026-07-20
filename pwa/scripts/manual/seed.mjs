// 操作マニュアルのスクリーンショット用デモデータ（docs/wants/12_操作マニュアル.md）。
//
// アプリ側にはシード用のコードを一切置かない。ここで localStorage の中身を組み立て、
// Playwright が addInitScript で起動前に流し込む。アプリの永続形式に結合するため、
// 形式が変わったときに無言で空の画面を撮らないよう、撮影側（shots.mjs）が
// 各ショットで「写っているべき文言」をアサートする。
//
// 保存形式の出どころ:
// - グループスロット: src/lib/group-slots.ts（hvs.groups / hvs.activeGroup / hvs.g.<slotId>）
// - リポジトリ: src/data/localstorage/persistent-map.ts（[id, entity] のペア配列）
// - 地図: src/lib/map-storage.ts（vertices/edges/polygons を持つ単一 JSON）
// - 同意・identity: src/lib/terms.ts / src/services/identity-service.ts

/** 同意ゲートのバージョン（src/lib/terms.ts の TERMS_VERSION と一致させる）。 */
export const TERMS_VERSION = "2026-07-17";

/** デモ用のグループスロット。実データ（別スロット）とは名前空間が分かれる。 */
const SLOT_ID = "g-demo0001";
const NS = `hvs.g.${SLOT_ID}`;

const SELF_DID = "did:key:z6MkManualDemoAdmin00000000000001";
const EDITOR_DID = "did:key:z6MkManualDemoEditor0000000000001";
const MEMBER_DID = "did:key:z6MkManualDemoMember0000000000001";
const MEMBER2_DID = "did:key:z6MkManualDemoMember0000000000002";

const DEVICE_ID = "dev-demo00000001";

// 32 バイトの固定シード（撮影結果を毎回同じにするため乱数は使わない）。
const SEED_B64 = Buffer.from("manual-demo-seed-32bytes-000000!").toString(
  "base64",
);

// 撮影結果を固定するため、日時はすべて定数にする。
const T0 = "2026-01-05T00:00:00.000Z";
const NOW = "2026-07-15T02:30:00.000Z";

/** 成田市加良部あたり。ポリゴンと場所がぶつからない程度に離す。 */
const BASE_LAT = 35.7745;
const BASE_LNG = 140.3105;

// --- 領域・区域親番・区域 -----------------------------------------------------

const REGION = {
  id: "rg-nrt",
  name: "成田市",
  symbol: "NRT",
  approved: true,
  geometry: null,
  order: 0,
};

const PARENT_AREAS = [
  { id: "pa-001", regionId: "rg-nrt", number: "001", name: "加良部1丁目" },
  { id: "pa-002", regionId: "rg-nrt", number: "002", name: "加良部2丁目" },
  { id: "pa-003", regionId: "rg-nrt", number: "003", name: "東和田" },
].map((pa) => ({ ...pa, geometry: null }));

const AREAS = [
  { id: "ar-001-01", parentAreaId: "pa-001", number: "01", polygonIds: ["pg-1"] },
  { id: "ar-001-02", parentAreaId: "pa-001", number: "02", polygonIds: ["pg-2"] },
  { id: "ar-001-03", parentAreaId: "pa-001", number: "03", polygonIds: [] },
  { id: "ar-002-01", parentAreaId: "pa-002", number: "01", polygonIds: ["pg-3"] },
  { id: "ar-002-02", parentAreaId: "pa-002", number: "02", polygonIds: [] },
  { id: "ar-003-01", parentAreaId: "pa-003", number: "01", polygonIds: [] },
].map((a) => ({ ...a, geometry: null }));

// --- 地図ネットワーク ---------------------------------------------------------
//
// sanitizeNetworkSnapshot が参照切れの辺・ポリゴンを黙って落とすため、
// vertices / edges / polygons は互いに整合していなければならない。

/** 矩形ポリゴンを 1 つ組み立てる（頂点 4・辺 4）。 */
function rectPolygon(id, latOffset, lngOffset, size = 0.0022) {
  const lat = BASE_LAT + latOffset;
  const lng = BASE_LNG + lngOffset;
  const corners = [
    [lat, lng],
    [lat, lng + size],
    [lat - size, lng + size],
    [lat - size, lng],
  ];
  const vertices = corners.map(([vlat, vlng], i) => ({
    id: `${id}-v${i + 1}`,
    lat: vlat,
    lng: vlng,
  }));
  const edges = vertices.map((v, i) => ({
    id: `${id}-e${i + 1}`,
    v1: v.id,
    v2: vertices[(i + 1) % vertices.length].id,
  }));
  return {
    vertices,
    edges,
    polygon: {
      id,
      edgeIds: edges.map((e) => e.id),
      holes: [],
      vertexIds: vertices.map((v) => v.id),
      locked: false,
      active: true,
    },
  };
}

function buildMapNetwork() {
  const parts = [
    rectPolygon("pg-1", 0, 0),
    rectPolygon("pg-2", 0, 0.0026),
    rectPolygon("pg-3", -0.0026, 0),
  ];
  return {
    vertices: parts.flatMap((p) => p.vertices),
    edges: parts.flatMap((p) => p.edges),
    polygons: parts.map((p) => p.polygon),
  };
}

// --- 場所 ---------------------------------------------------------------------

function place(over) {
  return {
    id: "",
    areaId: "ar-001-01",
    coord: { lat: BASE_LAT, lng: BASE_LNG },
    type: "house",
    label: "",
    displayName: "",
    address: "",
    description: "",
    parentId: "",
    sortOrder: 0,
    languages: [],
    doNotVisit: false,
    doNotVisitNote: "",
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

const HOUSES = [
  { n: "佐藤", addr: "成田市加良部1-2-3", dLat: -0.0004, dLng: 0.0004 },
  { n: "鈴木", addr: "成田市加良部1-2-5", dLat: -0.0007, dLng: 0.0005 },
  { n: "高橋", addr: "成田市加良部1-2-7", dLat: -0.001, dLng: 0.0006 },
  { n: "田中", addr: "成田市加良部1-3-1", dLat: -0.0013, dLng: 0.0009 },
  { n: "", addr: "成田市加良部1-3-4", dLat: -0.0016, dLng: 0.0012 },
].map((h, i) =>
  place({
    id: `pl-h${i + 1}`,
    coord: { lat: BASE_LAT + h.dLat, lng: BASE_LNG + h.dLng },
    type: "house",
    // 家・集合住宅の利用者向け名称は label（displayName は部屋名で使う）。
    label: h.n,
    displayName: h.n,
    address: h.addr,
    sortOrder: i + 1,
  }),
);

const BUILDING = place({
  id: "pl-b1",
  coord: { lat: BASE_LAT - 0.0006, lng: BASE_LNG + 0.0014 },
  type: "building",
  label: "加良部ハイツ",
  displayName: "加良部ハイツ",
  address: "成田市加良部1-4-1",
  description: "オートロックあり。入口は南側。管理人は平日午前のみ在室。",
  sortOrder: HOUSES.length + 1,
});

const ROOMS = ["101", "102", "103", "201", "202", "203", "301", "302"].map(
  (no, i) =>
    place({
      id: `pl-r${i + 1}`,
      coord: BUILDING.coord,
      type: "room",
      displayName: no,
      label: no,
      parentId: BUILDING.id,
      sortOrder: i + 1,
    }),
);

const PLACES = [...HOUSES, BUILDING, ...ROOMS];

// --- ユーザー・タグ -----------------------------------------------------------

const TAGS = [
  { id: "tg-1", name: "日曜午前", color: "#3b82f6" },
  { id: "tg-2", name: "英語対応", color: "#14b8a6" },
];

const USERS = [
  {
    id: SELF_DID,
    name: "山田 太郎",
    role: "admin",
    tagIds: [],
    joinedAt: T0,
  },
  {
    id: EDITOR_DID,
    name: "佐々木 花子",
    role: "editor",
    tagIds: ["tg-1"],
    joinedAt: T0,
  },
  {
    id: MEMBER_DID,
    name: "伊藤 健",
    role: "member",
    tagIds: ["tg-1", "tg-2"],
    joinedAt: T0,
  },
  {
    id: MEMBER2_DID,
    name: "渡辺 美咲",
    role: "member",
    tagIds: [],
    joinedAt: T0,
  },
];

// --- チェックアウト・訪問記録 -------------------------------------------------

const CHECKOUTS = [
  {
    // 自分（管理者）が担当する区域。ダッシュボードは「自分がアクセスできる
    // 区域」しか出さないため、ここが空だと全画面のスクショが空になる。
    id: "co-1",
    areaId: "ar-001-01",
    personInChargeId: SELF_DID,
    checkedOutById: SELF_DID,
    status: "active",
    createdAt: "2026-07-01T01:00:00.000Z",
    returnedAt: null,
    completedAt: null,
    updatedAt: "2026-07-01T01:00:00.000Z",
  },
  {
    id: "co-2",
    areaId: "ar-001-02",
    personInChargeId: MEMBER2_DID,
    checkedOutById: EDITOR_DID,
    status: "active",
    createdAt: "2026-06-20T01:00:00.000Z",
    returnedAt: null,
    completedAt: null,
    updatedAt: "2026-06-20T01:00:00.000Z",
  },
  {
    id: "co-3",
    areaId: "ar-002-01",
    personInChargeId: MEMBER_DID,
    checkedOutById: EDITOR_DID,
    status: "returned",
    createdAt: "2026-05-10T01:00:00.000Z",
    returnedAt: "2026-06-14T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-06-14T08:00:00.000Z",
  },
];

const VISIT_RECORDS = [
  { id: "vr-1", placeId: "pl-h1", result: "met", visitedAt: "2026-07-01T04:10:00.000Z" },
  { id: "vr-2", placeId: "pl-h2", result: "absent", visitedAt: "2026-07-01T04:25:00.000Z" },
  { id: "vr-3", placeId: "pl-h3", result: "absent", visitedAt: "2026-07-08T05:00:00.000Z" },
  { id: "vr-4", placeId: "pl-h4", result: "vacant_possible", visitedAt: "2026-06-14T04:00:00.000Z" },
  { id: "vr-5", placeId: "pl-r1", result: "met", visitedAt: "2026-07-08T05:20:00.000Z" },
  { id: "vr-6", placeId: "pl-r2", result: "absent", visitedAt: "2026-07-08T05:25:00.000Z" },
].map((v) => ({
  id: v.id,
  userId: SELF_DID,
  placeId: v.placeId,
  coord: null,
  areaId: "ar-001-01",
  checkoutId: "co-1",
  result: v.result,
  appliedRequestId: null,
  visitedAt: v.visitedAt,
  createdAt: v.visitedAt,
  updatedAt: v.visitedAt,
}));

// --- 申請・フィードバック・通知 -----------------------------------------------

const REQUESTS = [
  {
    id: "rq-1",
    type: "place_move",
    status: "pending",
    submitterId: MEMBER_DID,
    areaId: "ar-001-01",
    placeId: "pl-h3",
    coord: null,
    description: "実際の位置が 1 軒分ずれています。北隣が正しい位置です。",
    createdAt: "2026-07-09T01:00:00.000Z",
    resolvedAt: null,
    resolvedBy: "",
  },
  {
    id: "rq-2",
    type: "place_delete",
    status: "pending",
    submitterId: MEMBER2_DID,
    areaId: "ar-001-01",
    placeId: "pl-h5",
    coord: null,
    description: "解体されて更地になっていました。",
    createdAt: "2026-07-10T02:00:00.000Z",
    resolvedAt: null,
    resolvedBy: "",
  },
  {
    id: "rq-3",
    type: "place_info_modify",
    status: "resolved",
    submitterId: MEMBER_DID,
    areaId: "ar-001-01",
    placeId: "pl-b1",
    coord: null,
    description: "オートロックが設置されました。補足情報の追記をお願いします。",
    createdAt: "2026-06-28T02:00:00.000Z",
    resolvedAt: "2026-06-29T03:00:00.000Z",
    resolvedBy: SELF_DID,
  },
];

const FEEDBACK = [
  {
    id: "fb-0",
    kind: "other",
    body: "区域の並び順を活動しやすい順に変えられると助かります。",
    senderId: SELF_DID,
    createdAt: "2026-07-12T01:00:00.000Z",
    status: "pending",
    resolvedAt: null,
    resolvedBy: "",
  },
  {
    id: "fb-1",
    kind: "bug_report",
    body: "訪問記録の一覧で、部屋の並び順がときどき入れ替わることがあります。",
    senderId: MEMBER_DID,
    createdAt: "2026-07-11T02:00:00.000Z",
    status: "pending",
    resolvedAt: null,
    resolvedBy: "",
  },
  {
    id: "fb-2",
    kind: "encouragement",
    body: "地図から直接記録できるようになって、とても使いやすくなりました。",
    senderId: MEMBER2_DID,
    createdAt: "2026-07-05T02:00:00.000Z",
    status: "resolved",
    resolvedAt: "2026-07-06T02:00:00.000Z",
    resolvedBy: SELF_DID,
  },
];

const NOTIFICATIONS = [
  {
    id: "nt-1",
    type: "return",
    targetId: SELF_DID,
    referenceId: "co-3",
    message: "NRT-002-01 が返却されました",
    read: false,
    createdAt: "2026-06-14T08:00:00.000Z",
    expiresAt: null,
  },
];

const COVERAGES = [
  {
    id: "cv-1",
    parentAreaId: "pa-001",
    status: "active",
    actualPercent: 62,
    statusPercent: 78,
    createdAt: T0,
    updatedAt: NOW,
  },
];

/** 地図のヒント吹き出し（src/pages/MapPage.tsx の POLYGON_TIP_KEYS）。 */
const HIDDEN_TIP_KEYS = [
  "tips.map.polygon.startDraw",
  "tips.map.polygon.continueVertex",
  "tips.map.polygon.confirmDraw",
  "tips.map.polygon.cancelDraw",
  "tips.map.polygon.selectPolygon",
  "tips.map.polygon.moveVertex",
  "tips.map.polygon.splitEdge",
];

// --- 組み立て -----------------------------------------------------------------

/** PersistentMap の保存形式（[id, entity] のペア配列）に変換する。 */
function entries(list) {
  return JSON.stringify(list.map((e) => [e.id, e]));
}

/**
 * localStorage に流し込む key→value を組み立てる。
 * 値はすべて文字列（localStorage の実際の形式に合わせる）。
 */
export function buildSeedEntries() {
  return {
    // 同意ゲートを通過済みにする
    "hvs.termsAcceptedVersion": TERMS_VERSION,

    // 自分の identity（オンボーディングを飛ばす）
    "hvs.identity": JSON.stringify({
      did: SELF_DID,
      seedB64: SEED_B64,
      name: "山田 太郎",
      role: "admin",
    }),
    "hvs.deviceId": DEVICE_ID,
    "hvs.devices": JSON.stringify([
      { id: DEVICE_ID, userId: SELF_DID, label: "デモ端末", createdAt: T0 },
    ]),

    // グループスロット（実データと名前空間を分ける）
    "hvs.groups": JSON.stringify([
      {
        slotId: SLOT_ID,
        // null のままだと「送信できる宛先がありません」になり、送信フォームの
        // 図が撮れない（FeedbackPage の adminAvailable 判定）。
        networkId: "net-manual-demo",
        groupName: "成田市 訪問グループ",
      },
    ]),
    "hvs.activeGroup": SLOT_ID,

    // リポジトリ
    [`${NS}:user:users`]: entries(USERS),
    [`${NS}:user:tags`]: entries(TAGS),
    [`${NS}:user:invitations`]: entries([]),
    [`${NS}:region:regions`]: entries([REGION]),
    [`${NS}:region:parentAreas`]: entries(PARENT_AREAS),
    [`${NS}:region:areas`]: entries(AREAS),
    [`${NS}:checkout:checkouts`]: entries(CHECKOUTS),
    [`${NS}:checkout:invitations`]: entries([]),
    [`${NS}:checkout:visitRecords`]: entries(VISIT_RECORDS),
    [`${NS}:checkout:visitRecordEdits`]: entries([]),
    [`${NS}:coverage:coverages`]: entries(COVERAGES),
    [`${NS}:notification:notifications`]: entries(NOTIFICATIONS),
    [`${NS}:notification:requests`]: entries(REQUESTS),
    [`${NS}:notification:auditLogs`]: entries([]),
    [`${NS}:notification:feedback`]: entries(FEEDBACK),
    [`${NS}:place:places`]: entries(PLACES),

    // 地図ネットワーク
    [`${NS}:map.network`]: JSON.stringify(buildMapNetwork()),

    // 個人設定（スロット非依存）。VITE_LINKSELF=1 のときアプリは個人設定を
    // LinkSelf の MyDB（OPFS SQLite）から読むため、この値は無効化される。
    // ヒントの抑止を構成に依存させないよう、撮影側でも UI から閉じている
    // （shots.mjs の dismissTips）。ここは LinkSelf 無効時のための保険。
    "hvs.personal-settings.v1": JSON.stringify({
      hiddenTipKeys: HIDDEN_TIP_KEYS,
      locale: "ja",
    }),
  };
}

/** 撮影スクリプトのアサートで使う、デモデータ由来の固定文言。 */
export const SEED_FIXTURES = {
  regionName: REGION.name,
  regionSymbol: REGION.symbol,
  regionRow: `${REGION.symbol} (${REGION.name})`,
  areaLabel: "NRT-001-01",
  parentAreaName: "加良部1丁目",
  selfName: "山田 太郎",
  memberName: "伊藤 健",
  buildingName: "加良部ハイツ",
  // 場所一覧の通し番号（家 5 件の次が集合住宅）
  buildingBadge: String(HOUSES.length + 2),
  houseName: "佐藤",
  tagName: "日曜午前",
  // アサート用の本文（固定文言ではなくデモデータ由来にすることで、
  // データが流れ込んでいない画面を撮ったときに撮影を失敗させる）
  requestBody: "解体されて更地になっていました。",
  feedbackBody: "訪問記録の一覧で、部屋の並び順",
};
