import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapState, MapMode } from "./useMapState";

describe("useMapState", () => {
  it("初期状態はIdle", () => {
    const { result } = renderHook(() => useMapState());
    expect(result.current.snapshot.mode).toBe(MapMode.Idle);
  });

  it("startDrawingでDrawingモードに遷移", () => {
    const { result } = renderHook(() => useMapState());

    act(() => {
      result.current.actions.startDrawing();
    });

    expect(result.current.snapshot.mode).toBe(MapMode.Drawing);
  });

  it("endDrawingでIdleに戻る", () => {
    const { result } = renderHook(() => useMapState());

    act(() => {
      result.current.actions.startDrawing();
    });
    act(() => {
      result.current.actions.endDrawing();
    });

    expect(result.current.snapshot.mode).toBe(MapMode.Idle);
  });

  it("startEditingでEditingモードに遷移", () => {
    const { result } = renderHook(() => useMapState());

    act(() => {
      result.current.actions.startEditing("p1" as any);
    });

    expect(result.current.snapshot.mode).toBe(MapMode.Editing);
    expect(result.current.snapshot.selectedPolygonId).toBe("p1");
  });
});
