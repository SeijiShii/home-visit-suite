import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCommandHistory } from "./useCommandHistory";
import type { DeleteCommand } from "../services/command-history";

function makeCmd(id: string): DeleteCommand {
  return {
    type: "delete",
    targetType: "region",
    targetId: id,
    entries: [{ entityType: "region", id }],
  };
}

describe("useCommandHistory", () => {
  it("初期状態はundo/redoともにfalse", () => {
    const { result } = renderHook(() => useCommandHistory());
    expect(result.current.snapshot.canUndo).toBe(false);
    expect(result.current.snapshot.canRedo).toBe(false);
    expect(result.current.snapshot.peekUndo).toBeNull();
  });

  it("pushでsnapshotが更新される", () => {
    const { result } = renderHook(() => useCommandHistory());

    act(() => {
      result.current.history.push(makeCmd("NRT"));
    });

    expect(result.current.snapshot.canUndo).toBe(true);
    expect(result.current.snapshot.canRedo).toBe(false);
    expect(result.current.snapshot.peekUndo?.targetId).toBe("NRT");
  });

  it("undo/redoでsnapshotが更新される", () => {
    const { result } = renderHook(() => useCommandHistory());

    act(() => {
      result.current.history.push(makeCmd("NRT"));
    });

    act(() => {
      result.current.history.undo();
    });

    expect(result.current.snapshot.canUndo).toBe(false);
    expect(result.current.snapshot.canRedo).toBe(true);

    act(() => {
      result.current.history.redo();
    });

    expect(result.current.snapshot.canUndo).toBe(true);
    expect(result.current.snapshot.canRedo).toBe(false);
  });
});
