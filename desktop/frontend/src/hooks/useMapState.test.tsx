import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapState, MapMode } from './useMapState';

describe('useMapState', () => {
  it('初期状態はViewing', () => {
    const { result } = renderHook(() => useMapState());
    expect(result.current.snapshot.mode).toBe(MapMode.Viewing);
    expect(result.current.snapshot.draft).toBeNull();
  });

  it('startDrawingでDrawingモードに遷移', () => {
    const { result } = renderHook(() => useMapState());

    act(() => {
      result.current.actions.startDrawing();
    });

    expect(result.current.snapshot.mode).toBe(MapMode.Drawing);
    expect(result.current.snapshot.draft).not.toBeNull();
  });

  it('cancelDrawingでViewingに戻る', () => {
    const { result } = renderHook(() => useMapState());

    act(() => {
      result.current.actions.startDrawing();
    });
    act(() => {
      result.current.actions.cancelDrawing();
    });

    expect(result.current.snapshot.mode).toBe(MapMode.Viewing);
    expect(result.current.snapshot.draft).toBeNull();
  });

  it('updateDraftでスナップショットが更新される', () => {
    const { result } = renderHook(() => useMapState());

    const mockDraft = { points: [{ lat: 35, lng: 140 }], isClosed: false } as any;
    act(() => {
      result.current.actions.updateDraft(mockDraft);
    });

    expect(result.current.snapshot.draft).toEqual(mockDraft);
  });
});
