import { describe, it, expect, beforeEach } from 'vitest';
import { MapState, MapMode } from './map-state';

describe('MapState', () => {
  let state: MapState;

  beforeEach(() => {
    state = new MapState();
  });

  describe('初期状態', () => {
    it('モードはviewing', () => {
      expect(state.mode).toBe(MapMode.Viewing);
    });

    it('選択中ポリゴンはない', () => {
      expect(state.selectedPolygonId).toBeNull();
    });

    it('ドラフトは空', () => {
      expect(state.draft).toBeNull();
    });
  });

  describe('モード遷移', () => {
    it('viewing → drawing に遷移できる', () => {
      state.startDrawing();
      expect(state.mode).toBe(MapMode.Drawing);
      expect(state.draft).not.toBeNull();
      expect(state.draft!.points).toEqual([]);
      expect(state.draft!.isClosed).toBe(false);
    });

    it('drawing → viewing にキャンセルできる', () => {
      state.startDrawing();
      state.cancelDrawing();
      expect(state.mode).toBe(MapMode.Viewing);
      expect(state.draft).toBeNull();
    });

    it('viewing → editing に遷移できる', () => {
      state.startEditing('p1' as any);
      expect(state.mode).toBe(MapMode.Editing);
      expect(state.selectedPolygonId).toBe('p1');
    });

    it('editing → viewing にキャンセルできる', () => {
      state.startEditing('p1' as any);
      state.cancelEditing();
      expect(state.mode).toBe(MapMode.Viewing);
      expect(state.selectedPolygonId).toBeNull();
    });
  });

  describe('ポリゴン選択', () => {
    it('viewingモードでポリゴンを選択できる', () => {
      state.selectPolygon('p1' as any);
      expect(state.selectedPolygonId).toBe('p1');
    });

    it('選択を解除できる', () => {
      state.selectPolygon('p1' as any);
      state.selectPolygon(null);
      expect(state.selectedPolygonId).toBeNull();
    });

    it('drawingモードでは選択を変更しない', () => {
      state.startDrawing();
      state.selectPolygon('p1' as any);
      expect(state.selectedPolygonId).toBeNull();
    });
  });

  describe('変更通知', () => {
    it('リスナーがモード変更を受け取る', () => {
      const changes: MapMode[] = [];
      state.onChange(() => changes.push(state.mode));

      state.startDrawing();
      state.cancelDrawing();

      expect(changes).toEqual([MapMode.Drawing, MapMode.Viewing]);
    });

    it('リスナーを解除できる', () => {
      let count = 0;
      const unsubscribe = state.onChange(() => count++);

      state.startDrawing();
      unsubscribe();
      state.cancelDrawing();

      expect(count).toBe(1);
    });
  });
});
