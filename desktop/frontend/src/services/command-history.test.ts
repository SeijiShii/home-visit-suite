import { describe, it, expect, vi } from "vitest";
import { CommandHistory, type DeleteCommand } from "./command-history";

function makeDeleteCmd(id: string): DeleteCommand {
  return {
    type: "delete",
    targetType: "region",
    targetId: id,
    entries: [{ entityType: "region", id }],
  };
}

describe("CommandHistory", () => {
  it("初期状態はundo/redoともに空", () => {
    const h = new CommandHistory();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.peekUndo()).toBeNull();
  });

  it("push後にcanUndoがtrue、canRedoはfalse", () => {
    const h = new CommandHistory();
    h.push(makeDeleteCmd("NRT"));
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
    expect(h.peekUndo()?.targetId).toBe("NRT");
  });

  it("undo後にcanRedoがtrue、canUndoはfalse", () => {
    const h = new CommandHistory();
    h.push(makeDeleteCmd("NRT"));
    const cmd = h.undo();
    expect(cmd?.targetId).toBe("NRT");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it("redo後にcanUndoがtrue、canRedoはfalse", () => {
    const h = new CommandHistory();
    h.push(makeDeleteCmd("NRT"));
    h.undo();
    const cmd = h.redo();
    expect(cmd?.targetId).toBe("NRT");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("新しいpushでredoスタックがクリアされる", () => {
    const h = new CommandHistory();
    h.push(makeDeleteCmd("NRT"));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(makeDeleteCmd("SAK"));
    expect(h.canRedo).toBe(false);
    expect(h.peekUndo()?.targetId).toBe("SAK");
  });

  it("空スタックのundoはnullを返す", () => {
    const h = new CommandHistory();
    expect(h.undo()).toBeNull();
  });

  it("空スタックのredoはnullを返す", () => {
    const h = new CommandHistory();
    expect(h.redo()).toBeNull();
  });

  it("複数undo/redoサイクルが正しく動作する", () => {
    const h = new CommandHistory();
    h.push(makeDeleteCmd("A"));
    h.push(makeDeleteCmd("B"));
    h.push(makeDeleteCmd("C"));

    expect(h.undo()?.targetId).toBe("C");
    expect(h.undo()?.targetId).toBe("B");
    expect(h.redo()?.targetId).toBe("B");
    expect(h.undo()?.targetId).toBe("B");
    expect(h.undo()?.targetId).toBe("A");
    expect(h.undo()).toBeNull();
  });

  it("上限50を超えると古いコマンドが削除される", () => {
    const h = new CommandHistory();
    for (let i = 0; i < 55; i++) {
      h.push(makeDeleteCmd(`R${i}`));
    }
    // 50回undoできる
    let count = 0;
    while (h.undo()) count++;
    expect(count).toBe(50);
  });

  it("onChangeがpush/undo/redoで発火する", () => {
    const h = new CommandHistory();
    const listener = vi.fn();
    h.onChange(listener);

    h.push(makeDeleteCmd("NRT"));
    expect(listener).toHaveBeenCalledTimes(1);

    h.undo();
    expect(listener).toHaveBeenCalledTimes(2);

    h.redo();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("onChangeのunsubscribeが機能する", () => {
    const h = new CommandHistory();
    const listener = vi.fn();
    const unsub = h.onChange(listener);

    h.push(makeDeleteCmd("NRT"));
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    h.push(makeDeleteCmd("SAK"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
