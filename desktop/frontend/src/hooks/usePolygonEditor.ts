import { useEffect, useRef, useState } from "react";
import { MapPolygonEditor } from "map-polygon-editor";
import type { MapBindingAPI } from "../lib/wails-storage-adapter";
import { WailsStorageAdapter } from "../lib/wails-storage-adapter";
import { PolygonService } from "../services/polygon-service";
import type { PolygonBindingAPI } from "../services/polygon-service";

export function usePolygonEditor(
  mapBinding: MapBindingAPI,
  regionAPI: PolygonBindingAPI,
) {
  const editorRef = useRef<MapPolygonEditor | null>(null);
  const serviceRef = useRef<PolygonService | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const adapter = new WailsStorageAdapter(mapBinding);
      const editor = new MapPolygonEditor({ storageAdapter: adapter });
      await editor.initialize();

      if (cancelled) return;

      editorRef.current = editor;
      serviceRef.current = new PolygonService(editor, regionAPI);
      setReady(true);
    };

    init().catch((err) => {
      console.error("MapPolygonEditor initialization failed:", err);
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
