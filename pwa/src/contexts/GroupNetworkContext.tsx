// グループ招待/参加ファサード（GroupNetworkService）をアプリへ配線するコンテキスト。
// ネットワーク配線が有効なときのみ実体が入る（リレー未設定/スタンドアロンでは null）。
// UI 側は null のとき「リレー未設定のため招待機能は無効」と案内する。

import { createContext, useContext, type ReactNode } from "react";
import type { GroupNetworkService } from "../lib/linkself/group-network";

const GroupNetworkContext = createContext<GroupNetworkService | null>(null);

interface GroupNetworkProviderProps {
  children: ReactNode;
  service: GroupNetworkService | null;
}

export function GroupNetworkProvider({
  children,
  service,
}: GroupNetworkProviderProps) {
  return (
    <GroupNetworkContext.Provider value={service}>
      {children}
    </GroupNetworkContext.Provider>
  );
}

/** グループ招待/参加ファサード。ネットワーク未配線なら null。 */
export function useGroupNetwork(): GroupNetworkService | null {
  return useContext(GroupNetworkContext);
}
