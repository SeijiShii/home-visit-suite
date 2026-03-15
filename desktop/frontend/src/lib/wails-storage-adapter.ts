import type {
  StorageAdapter,
  MapPolygon,
  PersistedDraft,
  ChangeSet,
  DraftID,
} from "map-polygon-editor";

// Wails Go バインディングの型定義
export interface MapBindingAPI {
  GetPolygonsJSON(): Promise<string>;
  GetGroupsJSON?: () => Promise<string>;
  GetDraftsJSON(): Promise<string>;
  BatchWrite(changesJSON: string): Promise<void>;
  SaveDraft(draftJSON: string): Promise<void>;
  DeleteDraft(id: string): Promise<void>;
}

export class WailsStorageAdapter implements StorageAdapter {
  constructor(private readonly binding: MapBindingAPI) {}

  async loadAll(): Promise<{
    polygons: MapPolygon[];
    drafts: PersistedDraft[];
  }> {
    const [polygonsJSON, draftsJSON] = await Promise.all([
      this.binding.GetPolygonsJSON(),
      this.binding.GetDraftsJSON(),
    ]);

    return {
      polygons: JSON.parse(polygonsJSON) as MapPolygon[],
      drafts: JSON.parse(draftsJSON) as PersistedDraft[],
    };
  }

  async batchWrite(changes: ChangeSet): Promise<void> {
    await this.binding.BatchWrite(JSON.stringify(changes));
  }

  async saveDraft(draft: PersistedDraft): Promise<void> {
    await this.binding.SaveDraft(JSON.stringify(draft));
  }

  async deleteDraft(id: DraftID): Promise<void> {
    await this.binding.DeleteDraft(id as string);
  }
}
