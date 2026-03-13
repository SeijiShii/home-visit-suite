import { useRef, useMemo, useSyncExternalStore } from "react";
import { CommandHistory, type Command } from "../services/command-history";

export interface CommandHistorySnapshot {
  canUndo: boolean;
  canRedo: boolean;
  peekUndo: Command | null;
}

function takeSnapshot(h: CommandHistory): CommandHistorySnapshot {
  return {
    canUndo: h.canUndo,
    canRedo: h.canRedo,
    peekUndo: h.peekUndo(),
  };
}

export function useCommandHistory() {
  const historyRef = useRef(new CommandHistory());
  const history = historyRef.current;

  const snapshotRef = useRef<CommandHistorySnapshot>(takeSnapshot(history));

  const subscribe = useMemo(
    () => (onStoreChange: () => void) => {
      return history.onChange(() => {
        snapshotRef.current = takeSnapshot(history);
        onStoreChange();
      });
    },
    [history],
  );

  const snapshot = useSyncExternalStore(subscribe, () => snapshotRef.current);

  return { snapshot, history };
}
