// PersonalRepository のインメモリ実装。
// LinkSelf TS アダプタが完成するまでの開発・テスト用。
// PersonalNote / PersonalTag / PersonalTagAssignment と AppSettings（tip 非表示・
// ロケール・区域詳細半径）を保持する。

import type {
  PersonalNote,
  PersonalTag,
  PersonalTagAssignment,
} from "../../domain/models/personal";
import type { PersonalRepository } from "../../domain/repositories/personal-repository";

export class InMemoryPersonalRepository implements PersonalRepository {
  private notes = new Map<string, PersonalNote>(); // key: visitRecordId
  private tags = new Map<string, PersonalTag>();
  private assignments = new Map<string, PersonalTagAssignment>();
  private hiddenTipKeys = new Set<string>();
  private locale = "";
  private areaDetailRadiusKm = 0;

  async getPersonalNote(visitRecordId: string): Promise<PersonalNote | null> {
    const n = this.notes.get(visitRecordId);
    return n ? { ...n } : null;
  }

  async savePersonalNote(note: PersonalNote): Promise<void> {
    this.notes.set(note.visitRecordId, { ...note });
  }

  async deletePersonalNote(id: string): Promise<void> {
    for (const [k, v] of this.notes) {
      if (v.id === id) this.notes.delete(k);
    }
  }

  async listPersonalTags(): Promise<PersonalTag[]> {
    return [...this.tags.values()].map((t) => ({ ...t }));
  }

  async savePersonalTag(tag: PersonalTag): Promise<void> {
    this.tags.set(tag.id, { ...tag });
  }

  async deletePersonalTag(id: string): Promise<void> {
    this.tags.delete(id);
  }

  async listPersonalTagAssignments(
    visitRecordId: string,
  ): Promise<PersonalTagAssignment[]> {
    return [...this.assignments.values()]
      .filter((a) => a.visitRecordId === visitRecordId)
      .map((a) => ({ ...a }));
  }

  async savePersonalTagAssignment(a: PersonalTagAssignment): Promise<void> {
    this.assignments.set(a.id, { ...a });
  }

  async deletePersonalTagAssignment(id: string): Promise<void> {
    this.assignments.delete(id);
  }

  async getHiddenTipKeys(): Promise<string[]> {
    return [...this.hiddenTipKeys];
  }

  async addHiddenTipKey(key: string): Promise<void> {
    this.hiddenTipKeys.add(key);
  }

  async clearHiddenTipKeys(): Promise<void> {
    this.hiddenTipKeys.clear();
  }

  async getLocale(): Promise<string> {
    return this.locale;
  }

  async setLocale(locale: string): Promise<void> {
    this.locale = locale;
  }

  async getAreaDetailRadiusKm(): Promise<number> {
    return this.areaDetailRadiusKm;
  }

  async setAreaDetailRadiusKm(km: number): Promise<void> {
    this.areaDetailRadiusKm = km;
  }
}
