import { useRef, useMemo, useSyncExternalStore } from "react";
import { MapState, MapMode } from "../lib/map-state";
import type { PolygonID } from "map-polygon-editor";

export interface MapStateSnapshot {
  mode: MapMode;
  selectedPolygonId: PolygonID | null;
}

function takeSnapshot(s: MapState): MapStateSnapshot {
  return {
    mode: s.mode,
    selectedPolygonId: s.selectedPolygonId,
  };
}

export function useMapState() {
  const stateRef = useRef(new MapState());
  const state = stateRef.current;

  const snapshotRef = useRef<MapStateSnapshot>(takeSnapshot(state));

  const subscribe = useMemo(
    () => (onStoreChange: () => void) => {
      return state.onChange(() => {
        snapshotRef.current = takeSnapshot(state);
        onStoreChange();
      });
    },
    [state],
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
  );

  return { snapshot, actions: state };
}

export { MapMode };
