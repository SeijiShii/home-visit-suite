// desktop/frontend/src/hooks/usePolygonEditor.ts からの移植。
// wails-storage-adapter を lib/map-storage（localStorage 版）に置き換えた。

import { useEffect, useRef, useState } from "react";
import { NetworkPolygonEditor } from "map-polygon-editor";
import type { MapBindingAPI } from "../lib/map-storage";
import { NetworkStorageAdapter } from "../lib/map-storage";
import { PolygonService } from "../services/polygon-service";
import type { PolygonBindingAPI } from "../services/polygon-service";

export function usePolygonEditor(
  mapBinding: MapBindingAPI,
  regionAPI: PolygonBindingAPI,
) {
  const editorRef = useRef<NetworkPolygonEditor | null>(null);
  const serviceRef = useRef<PolygonService | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const adapter = new NetworkStorageAdapter(mapBinding);
      const editor = new NetworkPolygonEditor(adapter);
      await editor.init();

      if (cancelled) return;

      editorRef.current = editor;
      serviceRef.current = new PolygonService(editor, regionAPI);
      setReady(true);
    };

    init().catch((err) => {
      console.error("NetworkPolygonEditor initialization failed:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [mapBinding, regionAPI]);

  return {
    editor: editorRef.current,
    polygonService: serviceRef.current,
    ready,
  };
}
