export interface DeleteEntry {
  entityType: "region" | "parentArea" | "area";
  id: string;
}

export interface DeleteCommand {
  type: "delete";
  targetType: "region" | "parentArea" | "area";
  targetId: string;
  entries: DeleteEntry[];
}

export type Command = DeleteCommand;

const MAX_HISTORY = 50;

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  peekUndo(): Command | null {
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1]
      : null;
  }

  push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notify();
  }

  undo(): Command | null {
    const cmd = this.undoStack.pop() ?? null;
    if (cmd) {
      this.redoStack.push(cmd);
      this.notify();
    }
    return cmd;
  }

  redo(): Command | null {
    const cmd = this.redoStack.pop() ?? null;
    if (cmd) {
      this.undoStack.push(cmd);
      this.notify();
    }
    return cmd;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
