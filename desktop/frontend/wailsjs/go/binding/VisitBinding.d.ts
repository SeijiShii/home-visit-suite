// このファイルは手動で作成されたスタブ。wails generate 実行時に上書き再生成される想定。
// Go 側 desktop/internal/binding/visit.go の公開メソッドに対応する。
import { models } from "../models";

export function RecordVisit(
  arg1: string,
  arg2: string,
  arg3: string,
  arg4: string,
  arg5: string,
  arg6: string,
): Promise<models.VisitRecord>;

export function ListVisitRecords(arg1: string): Promise<Array<models.VisitRecord>>;

export function ListMyVisitHistory(
  arg1: string,
  arg2: string,
): Promise<Array<models.VisitRecord>>;

export function GetLastMetDate(arg1: string): Promise<string>;

export function DeleteVisitRecord(arg1: string): Promise<void>;
