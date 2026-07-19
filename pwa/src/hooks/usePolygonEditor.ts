// desktop/frontend/src/hooks/usePolygonEditor.ts からの移植。
// wails-storage-adapter を lib/map-storage（localStorage 版）に置き換えた。

import { useEffect, useState } from "react";
import { NetworkPolygonEditor } from "map-polygon-editor";
import type { MapBindingAPI } from "../lib/map-storage";
import { NetworkStorageAdapter } from "../lib/map-storage";
import { PolygonService } from "../services/polygon-service";
import type { PolygonBindingAPI } from "../services/polygon-service";
// 一時診断（原因特定後に削除）
import { mapDebugLog } from "../lib/map-debug";

export function usePolygonEditor(
  mapBinding: MapBindingAPI,
  regionAPI: PolygonBindingAPI,
  /**
   * 増分するとエディタをストレージから再初期化する（ScopeNetwork 受信で
   * map_* テーブルが更新されたときに他端末の編集を取り込む用途）。
   */
  reloadKey = 0,
) {
  const [wired, setWired] = useState<{
    editor: NetworkPolygonEditor;
    polygonService: PolygonService;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      mapDebugLog("editor: init start");
      const adapter = new NetworkStorageAdapter(mapBinding);
      const editor = new NetworkPolygonEditor(adapter);
      await editor.init();

      if (cancelled) return;
      mapDebugLog("editor: init done");

      setWired({
        editor,
        polygonService: new PolygonService(editor, regionAPI),
      });
    };

    init().catch((err) => {
      mapDebugLog(`editor: init FAILED ${String(err).slice(0, 200)}`);
      console.error("NetworkPolygonEditor initialization failed:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [mapBinding, regionAPI, reloadKey]);

  return {
    editor: wired?.editor ?? null,
    polygonService: wired?.polygonService ?? null,
    ready: wired != null,
  };
}
