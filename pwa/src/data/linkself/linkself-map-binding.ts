// MapBindingAPI（ポリゴンネットワーク JSON の読み書き）の LinkSelf(MyDB SQL) 実装。
// 頂点/辺/ポリゴンをエンティティ単位の JSON 行テーブル（map_vertices/map_edges/
// map_polygons）に保存する。ネットワーク配線時は ScopeNetwork の行単位 LWW で
// 全メンバーへ伝播する（docs/wants/01「同期スコープ」の map_*）。
//
// 保存はネットワーク全体 JSON（map-polygon-editor の saveAll）で渡されるため、
// 現在の行と突き合わせて差分だけ upsert/delete する:
// - 変更行だけ書く = 保存のたびに全行が新タイムスタンプで再配送され、他端末の
//   より新しい編集を上書きする事故を防ぐ（includeExisting を初回のみに絞るのと同じ理由）
// - 消えた行は DELETE = 同期上は墓石になり削除が伝播する

import type { MyDB } from "@linkself/core";
import type { MapBindingAPI } from "../../lib/map-storage";
import { ensureGroupSchema, type GroupDomainTable } from "./group-schema";

interface NetworkJson {
  vertices: Array<{ id: string }>;
  edges: Array<{ id: string }>;
  polygons: Array<{ id: string }>;
}

const EMPTY: NetworkJson = { vertices: [], edges: [], polygons: [] };

const TABLE_FOR: Record<keyof NetworkJson, GroupDomainTable> = {
  vertices: "map_vertices",
  edges: "map_edges",
  polygons: "map_polygons",
};

export class LinkSelfMapBinding implements MapBindingAPI {
  /**
   * このバインディングが直近にエディタへ提供した行 ID（テーブル毎）。
   * saveAll（全体スナップショット）で「スナップショットに無い行」を削除するのは
   * **エディタが知っていた行**に限る — loadAll 後に ScopeNetwork で届いた行は
   * エディタのスナップショットに載らないだけで削除の意図ではないため、これを
   * 削除すると他端末の新規編集の墓石が全員へ伝播してしまう（learnings L-014）。
   */
  private readonly servedIds = new Map<GroupDomainTable, Set<string>>();

  constructor(private readonly db: MyDB) {}

  async GetNetworkJSON(): Promise<string> {
    await ensureGroupSchema(this.db);
    const network: NetworkJson = { vertices: [], edges: [], polygons: [] };
    for (const part of Object.keys(TABLE_FOR) as Array<keyof NetworkJson>) {
      const served = new Set<string>();
      const rows = await this.db.query(
        `SELECT id, data FROM ${TABLE_FOR[part]}`,
      );
      for (const r of rows) {
        try {
          network[part].push(JSON.parse(String(r.data)) as { id: string });
          served.add(String(r.id));
        } catch {
          // 壊れた行は読み飛ばす（表示不能にしない）
        }
      }
      this.servedIds.set(TABLE_FOR[part], served);
    }
    return JSON.stringify(network);
  }

  async SaveNetworkJSON(json: string): Promise<void> {
    await ensureGroupSchema(this.db);
    let network: NetworkJson;
    try {
      const parsed = JSON.parse(json) as Partial<NetworkJson>;
      network = {
        vertices: parsed.vertices ?? [],
        edges: parsed.edges ?? [],
        polygons: parsed.polygons ?? [],
      };
    } catch {
      network = EMPTY;
    }
    for (const part of Object.keys(TABLE_FOR) as Array<keyof NetworkJson>) {
      await this.savePartDiff(TABLE_FOR[part], network[part]);
    }
  }

  /**
   * 現在の行と突き合わせ、変わった行だけ upsert・消えた行だけ delete する。
   * 削除はエディタが知っていた行（直近 loadAll で提供済み）に限定する（上記参照）。
   */
  private async savePartDiff(
    table: GroupDomainTable,
    entities: Array<{ id: string }>,
  ): Promise<void> {
    const current = new Map<string, string>();
    for (const r of await this.db.query(`SELECT id, data FROM ${table}`)) {
      current.set(String(r.id), String(r.data));
    }
    const served = this.servedIds.get(table) ?? new Set<string>();
    const nextIds = new Set<string>();
    for (const e of entities) {
      if (!e || typeof e.id !== "string" || e.id === "") continue;
      nextIds.add(e.id);
      const data = JSON.stringify(e);
      if (current.get(e.id) !== data) {
        await this.db.exec(
          `INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`,
          [e.id, data],
        );
      }
    }
    for (const id of current.keys()) {
      if (!nextIds.has(id) && served.has(id)) {
        await this.db.exec(`DELETE FROM ${table} WHERE id = ?`, [id]);
      }
    }
    // 保存後のエディタの既知集合 = このスナップショット。
    this.servedIds.set(table, nextIds);
  }
}
