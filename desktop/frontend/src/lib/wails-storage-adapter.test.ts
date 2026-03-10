import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WailsStorageAdapter } from './wails-storage-adapter';
import type { MapPolygon, Group, PersistedDraft, ChangeSet } from 'map-polygon-editor';

// Wails Go バインディングのモック
const mockMapBinding = {
  GetPolygonsJSON: vi.fn(),
  GetGroupsJSON: vi.fn(),
  GetDraftsJSON: vi.fn(),
  BatchWrite: vi.fn(),
  SaveDraft: vi.fn(),
  DeleteDraft: vi.fn(),
};

describe('WailsStorageAdapter', () => {
  let adapter: WailsStorageAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WailsStorageAdapter(mockMapBinding);
  });

  describe('loadAll', () => {
    it('空のデータを返す', async () => {
      mockMapBinding.GetPolygonsJSON.mockResolvedValue('[]');
      mockMapBinding.GetGroupsJSON.mockResolvedValue('[]');
      mockMapBinding.GetDraftsJSON.mockResolvedValue('[]');

      const result = await adapter.loadAll();

      expect(result.polygons).toEqual([]);
      expect(result.groups).toEqual([]);
      expect(result.drafts).toEqual([]);
    });

    it('ポリゴンとグループをパースして返す', async () => {
      const polygons: MapPolygon[] = [{
        id: 'p1' as any,
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        display_name: 'Test Polygon',
        parent_id: null,
        metadata: {},
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      }];
      const groups: Group[] = [{
        id: 'g1' as any,
        display_name: 'Test Group',
        parent_id: null,
        metadata: {},
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      }];

      mockMapBinding.GetPolygonsJSON.mockResolvedValue(JSON.stringify(polygons));
      mockMapBinding.GetGroupsJSON.mockResolvedValue(JSON.stringify(groups));
      mockMapBinding.GetDraftsJSON.mockResolvedValue('[]');

      const result = await adapter.loadAll();

      expect(result.polygons).toHaveLength(1);
      expect(result.polygons[0].display_name).toBe('Test Polygon');
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].display_name).toBe('Test Group');
    });

    it('Go側のエラーを伝播する', async () => {
      mockMapBinding.GetPolygonsJSON.mockRejectedValue(new Error('storage error'));

      await expect(adapter.loadAll()).rejects.toThrow('storage error');
    });
  });

  describe('batchWrite', () => {
    it('ChangeSetをJSON化してGo側に送る', async () => {
      mockMapBinding.BatchWrite.mockResolvedValue(undefined);

      const changes: ChangeSet = {
        createdPolygons: [],
        deletedPolygonIds: [],
        modifiedPolygons: [],
        createdGroups: [],
        deletedGroupIds: [],
        modifiedGroups: [],
      };

      await adapter.batchWrite(changes);

      expect(mockMapBinding.BatchWrite).toHaveBeenCalledWith(
        JSON.stringify(changes)
      );
    });
  });

  describe('saveDraft / deleteDraft', () => {
    it('下書きを保存できる', async () => {
      mockMapBinding.SaveDraft.mockResolvedValue(undefined);

      const draft: PersistedDraft = {
        id: 'd1' as any,
        points: [{ lat: 35.0, lng: 140.0 }],
        isClosed: false,
        metadata: {},
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      };

      await adapter.saveDraft(draft);

      expect(mockMapBinding.SaveDraft).toHaveBeenCalledWith(
        JSON.stringify(draft)
      );
    });

    it('下書きを削除できる', async () => {
      mockMapBinding.DeleteDraft.mockResolvedValue(undefined);

      await adapter.deleteDraft('d1' as any);

      expect(mockMapBinding.DeleteDraft).toHaveBeenCalledWith('d1');
    });
  });
});
