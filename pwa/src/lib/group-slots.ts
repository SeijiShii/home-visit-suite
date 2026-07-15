// グループスロット = グループ（LinkSelf ネットワーク）毎のローカル DB 名前空間。
// 複数グループ所属でローカルデータを相互汚染させないための土台:
// - スロット一覧は `hvs.groups`、アクティブポインタは `hvs.activeGroup`
// - グループ状態キーは `hvs.g.<slotId>.<key>`、repo 永続は `hvs.g.<slotId>:<repo>`
// - グループ用 OPFS SQLite は `hvs-group-<slotId>.db`（個人設定の hvs-personal.db とは分離）
// slotId は networkId 確定前（創設前・参加成立前）から不変なローカル識別子。
// networkId は創設/参加で確定したときにスロットへ attach する。
// 仕様: docs/wants/01_共通基盤.md「グループ毎のローカル DB 分離」/
//       docs/wants/04_メンバー管理と権限.md「複数グループ所属と切替」

/** 1 グループ分のローカル名前空間。 */
export interface GroupSlot {
  /** ローカル名前空間キー（端末内でのみ意味を持つ。networkId 確定前から不変）。 */
  slotId: string;
  /** LinkSelf ネットワーク ID（創設/参加で確定するまで null）。 */
  networkId: string | null;
  /** 表示用グループ名（アプリレベルのデータ。docs/wants/04「グループ名」）。 */
  groupName: string | null;
}

const SLOTS_KEY = "hvs.groups";
const ACTIVE_KEY = "hvs.activeGroup";
/** 名前空間キーの共通プレフィクス。 */
const NS_PREFIX = "hvs.g.";

/** 旧（単一グループ時代）のグループ状態キー → スロット内キーの対応。 */
const LEGACY_KEYS: Array<{ legacy: string; key: string }> = [
  { legacy: "hvs.networkId", key: "networkId" },
  { legacy: "hvs.knownMembers", key: "knownMembers" },
  { legacy: "hvs.scopedTables", key: "scopedTables" },
  { legacy: "hvs.sharedRecords", key: "sharedRecords" },
  { legacy: "hvs.membershipEpochs", key: "membershipEpochs" },
];
const LEGACY_GROUP_NAME_KEY = "hvs.groupName";
/** 旧 repo 永続プレフィクス（`hvs:user` 等）。 */
const LEGACY_REPO_PREFIX = "hvs:";
/** 旧・地図ポリゴンネットワークの単一キー（repo 名前空間 `:map.network` へ移行）。 */
const LEGACY_MAP_KEY = "pwa.map.network";
/**
 * purge で参照が切れた OPFS グループ DB のファイル名一覧。sqlite-wasm(SAHPool) には
 * 同期の削除 API が無いため即時削除できず、孤児として記録して後日の掃除
 * （link-self 側の unlink API 待ち。docs/wants/09）に委ねる。
 */
const ORPHAN_DBS_KEY = "hvs.orphanGroupDbs";

function newSlotId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `g-${hex}`;
}

function saveSlots(list: GroupSlot[]): void {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/** 所属グループのスロット一覧（作成順）。 */
export function listGroupSlots(): GroupSlot[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    return raw ? (JSON.parse(raw) as GroupSlot[]) : [];
  } catch {
    return [];
  }
}

/** アクティブスロット。ポインタが無い/壊れている場合は null。 */
export function getActiveGroupSlot(): GroupSlot | null {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (!id) return null;
    return listGroupSlots().find((s) => s.slotId === id) ?? null;
  } catch {
    return null;
  }
}

/** アクティブスロットを切り替える（存在しない slotId は無視）。 */
export function setActiveGroupSlot(slotId: string): void {
  if (!listGroupSlots().some((s) => s.slotId === slotId)) return;
  try {
    localStorage.setItem(ACTIVE_KEY, slotId);
  } catch {
    // ignore
  }
}

/** 新しいスロットを作成する（アクティブは変更しない。無ければアクティブにする）。 */
export function createGroupSlot(
  init: Partial<Pick<GroupSlot, "networkId" | "groupName">> = {},
): GroupSlot {
  const slot: GroupSlot = {
    slotId: newSlotId(),
    networkId: init.networkId ?? null,
    groupName: init.groupName ?? null,
  };
  const list = listGroupSlots();
  list.push(slot);
  saveSlots(list);
  if (getActiveGroupSlot() == null) setActiveGroupSlot(slot.slotId);
  return slot;
}

/** アクティブスロットを返す。スロットが 1 つも無ければ作成する（bootstrap 用）。 */
export function ensureActiveSlot(): GroupSlot {
  const active = getActiveGroupSlot();
  if (active) return active;
  const list = listGroupSlots();
  if (list.length > 0) {
    setActiveGroupSlot(list[0].slotId);
    return list[0];
  }
  return createGroupSlot();
}

function updateSlot(slotId: string, patch: Partial<GroupSlot>): void {
  const list = listGroupSlots();
  const i = list.findIndex((s) => s.slotId === slotId);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch, slotId: list[i].slotId };
  saveSlots(list);
}

/** 創設/参加で確定した networkId をスロットへ記録する。 */
export function attachNetworkId(slotId: string, networkId: string): void {
  updateSlot(slotId, { networkId });
}

/** スロットの表示用グループ名を更新する。 */
export function setSlotGroupName(slotId: string, name: string | null): void {
  updateSlot(slotId, { groupName: name });
}

/** グループ状態キーの名前空間キー（`hvs.g.<slotId>.<key>`）。 */
export function nsKey(slotId: string, key: string): string {
  return `${NS_PREFIX}${slotId}.${key}`;
}

/** repo 永続のプレフィクス（`hvs.g.<slotId>`。repo 側が `:<name>` を付ける）。 */
export function repoPrefix(slotId: string): string {
  return `${NS_PREFIX}${slotId}`;
}

/** グループ用 OPFS SQLite のファイル名（個人設定の hvs-personal.db とは分離）。 */
export function groupDbFilename(slotId: string): string {
  return `hvs-group-${slotId}.db`;
}

/**
 * 旧（単一グループ時代）のローカルデータを一度だけスロット名前空間へ移行する。
 * スロット一覧が既にあれば何もしない。旧データが何も無ければスロットも作らない
 * （新規インストールは ensureActiveSlot が担う）。bootstrap（main.tsx）の最初に呼ぶ。
 */
export function migrateLegacyGroupData(): void {
  try {
    if (localStorage.getItem(SLOTS_KEY) != null) return;
    const legacyRepoKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_REPO_PREFIX)) legacyRepoKeys.push(k);
    }
    const hasLegacy =
      legacyRepoKeys.length > 0 ||
      LEGACY_KEYS.some((m) => localStorage.getItem(m.legacy) != null) ||
      localStorage.getItem(LEGACY_GROUP_NAME_KEY) != null ||
      localStorage.getItem(LEGACY_MAP_KEY) != null;
    if (!hasLegacy) return;

    const slot = createGroupSlot({
      networkId: localStorage.getItem("hvs.networkId"),
      groupName: localStorage.getItem(LEGACY_GROUP_NAME_KEY),
    });
    for (const k of legacyRepoKeys) {
      const v = localStorage.getItem(k);
      if (v != null) {
        localStorage.setItem(
          `${repoPrefix(slot.slotId)}:${k.slice(LEGACY_REPO_PREFIX.length)}`,
          v,
        );
      }
      localStorage.removeItem(k);
    }
    for (const m of LEGACY_KEYS) {
      const v = localStorage.getItem(m.legacy);
      if (v != null) localStorage.setItem(nsKey(slot.slotId, m.key), v);
      localStorage.removeItem(m.legacy);
    }
    const mapNetwork = localStorage.getItem(LEGACY_MAP_KEY);
    if (mapNetwork != null) {
      localStorage.setItem(
        `${repoPrefix(slot.slotId)}:map.network`,
        mapNetwork,
      );
      localStorage.removeItem(LEGACY_MAP_KEY);
    }
    localStorage.removeItem(LEGACY_GROUP_NAME_KEY);
    setActiveGroupSlot(slot.slotId);
  } catch {
    // localStorage 不可の環境では移行なしで続行する。
  }
}

/** purge で参照が切れる OPFS グループ DB を孤児一覧へ記録する（重複なし）。 */
function recordOrphanGroupDb(slotId: string): void {
  try {
    const list = JSON.parse(
      localStorage.getItem(ORPHAN_DBS_KEY) ?? "[]",
    ) as string[];
    const file = groupDbFilename(slotId);
    if (!list.includes(file)) {
      list.push(file);
      localStorage.setItem(ORPHAN_DBS_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore
  }
}

/** 孤児になった OPFS グループ DB のファイル名一覧（後日の掃除用）。 */
export function listOrphanGroupDbs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ORPHAN_DBS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function removeNamespaceKeys(slotId: string): void {
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    // キー形（hvs.g.<slotId>.<key>）と repo 形（hvs.g.<slotId>:<repo>）の両方。
    if (
      k &&
      (k.startsWith(`${nsKey(slotId, "")}`) ||
        k.startsWith(`${repoPrefix(slotId)}:`))
    ) {
      doomed.push(k);
    }
  }
  for (const k of doomed) localStorage.removeItem(k);
}

/**
 * スロットを名前空間キーごと破棄する（脱退時のローカル DB 削除）。
 * アクティブだった場合は残りの先頭スロットへ切り替える（無ければポインタ削除）。
 */
export function purgeGroupSlot(slotId: string): void {
  try {
    recordOrphanGroupDb(slotId);
    removeNamespaceKeys(slotId);
    const rest = listGroupSlots().filter((s) => s.slotId !== slotId);
    saveSlots(rest);
    if (localStorage.getItem(ACTIVE_KEY) === slotId) {
      if (rest.length > 0) localStorage.setItem(ACTIVE_KEY, rest[0].slotId);
      else localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // ignore
  }
}

/** 全スロットを破棄する（別 DID への紐づけ直し = 旧 ID のグループ状態を引き継がない）。 */
export function purgeAllGroupSlots(): void {
  try {
    for (const s of listGroupSlots()) {
      recordOrphanGroupDb(s.slotId);
      removeNamespaceKeys(s.slotId);
    }
    localStorage.removeItem(SLOTS_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}
