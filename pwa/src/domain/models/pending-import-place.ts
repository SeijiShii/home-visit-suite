// AI 地図取込で下書き生成された場所番号のうち、まだ Place 化していないもの。
// 取込ポリゴンは生成時点で区域未紐付けのため、ポリゴン ID で束ねて保持し、
// ポリゴンが区域へ紐付いた後に区域の Place として取り込む（docs/wants/03 Phase 1.1）。

import type { Coordinate } from "./geometry";

export interface PendingImportPlace {
  id: string;
  /** どの取込ポリゴンの内側にある場所か。 */
  polygonId: string;
  coord: Coordinate;
  /** 地図に書かれていた場所番号。 */
  number: number;
  label: string;
  address: string;
}
