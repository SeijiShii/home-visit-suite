import { useEffect, useRef, useState } from "react";
import { NetworkPolygonEditor } from "map-polygon-editor";
import type { PolygonSnapshot } from "map-polygon-editor";
import type { MapBindingAPI } from "../lib/wails-storage-adapter";
import { WailsStorageAdapter } from "../lib/wails-storage-adapter";
import { PolygonService } from "../services/polygon-service";
import type { PolygonBindingAPI } from "../services/polygon-service";

/** edgeIds をソートして結合したキーを返す */
function edgeKey(snap: PolygonSnapshot): string {
  return [...snap.edgeIds].sort().join(",");
}

/**
 * init() 後にポリゴンIDが変わるため、旧ID→新IDのマッピングを構築し
 * Go 側の区域紐付けを更新する。
 */
async function remapPolygonIds(
  oldPolygons: PolygonSnapshot[],
  newPolygons: PolygonSnapshot[],
  regionAPI: PolygonBindingAPI,
): Promise<void> {
  // edgeKey → 旧ID
  const oldByKey = new Map<string, string>();
  for (const p of oldPolygons) {
    oldByKey.set(edgeKey(p), p.id as string);
  }

  // edgeKey → 新ID
  const newByKey = new Map<string, string>();
  for (const p of newPolygons) {
    newByKey.set(edgeKey(p), p.id as string);
  }

  // 旧ID→新IDのマッピングを構築（IDが変わったもののみ）
  const idMap = new Map<string, string>();
  for (const [key, oldId] of oldByKey) {
    const newId = newByKey.get(key);
    if (newId && newId !== oldId) {
      idMap.set(oldId, newId);
    }
  }

  if (idMap.size === 0) return;

  // Go 側の区域紐付けを更新: 旧IDで解除 → 新IDで再紐付け
  // BindPolygonToArea(areaId, polygonId) / UnbindPolygonFromArea(areaId)
  // 紐付け済みの区域を特定するため、loadTree 相当の情報が必要だが
  // ここでは regionAPI しか持たないので、直接 Wails API を呼ぶ
  // → PolygonBindingAPI を拡張して polygonId から areaId を逆引きするか、
  //   BindPolygonToArea を polygonId ベースで呼び直す

  // 簡易実装: UnbindPolygonFromArea は areaId が必要だが、ここでは
  // BindPolygonToArea(areaId, newPolygonId) で上書きすれば良い。
  // ただし areaId が分からない。

  // より堅実なアプローチ: regionAPI に remapPolygonId メソッドを追加
  await regionAPI.RemapPolygonIds(
    Object.fromEntries(idMap),
  );
}

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
      const adapter = new WailsStorageAdapter(mapBinding);

      // init() 前に旧ポリゴンデータを取得
      const oldData = await adapter.loadAll();
      const oldPolygons = oldData?.polygons ?? [];

      const editor = new NetworkPolygonEditor(adapter);
      await editor.init();

      if (cancelled) return;

      // init() 後の新ポリゴンIDで areas を更新
      const newPolygons = editor.getPolygons();
      await remapPolygonIds(oldPolygons, newPolygons, regionAPI);

      // 新しいIDで保存
      await editor.save();

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
