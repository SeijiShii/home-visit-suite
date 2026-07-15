// デバイスディレクトリ（ロスターのラベル更新）のサービスロケータ。
//
// ラベルの SoT はユーザー鍵署名のデバイスロスター（docs/wants/01「ラベルの同期」）。
// 再署名と兄弟端末への announce は @linkself/core を要するため linkself-services
// （動的 import・重量級）側が実装を登録し、main バンドルの identity-service は
// この軽量モジュール経由で呼ぶ（直接 import すると sqlite-wasm ごと main に載る）。

export interface DeviceDirectory {
  /**
   * ロスター上の該当デバイスのラベルを変更し、再署名（rev+1）・永続・
   * 接続中の兄弟端末への即時 announce まで行う。
   */
  setLabel(deviceDID: string, label: string): Promise<void>;
  /**
   * 該当デバイスをロスターから失効（rev+1 再署名・永続・残る兄弟への
   * announce）し、除外後ロスターを対象端末宛にも送る（store-and-forward、
   * best-effort）。対象端末は受理時に全初期化する（docs/wants/01「削除の意味」）。
   */
  removeDevice(deviceDID: string): Promise<void>;
}

let directory: DeviceDirectory | null = null;

/** linkself-services がネットワーク配線時に実装を登録する（stop 時は null）。 */
export function registerDeviceDirectory(d: DeviceDirectory | null): void {
  directory = d;
}

/** 登録済みのディレクトリ実装（スタンドアロン時は null）。 */
export function getDeviceDirectory(): DeviceDirectory | null {
  return directory;
}
