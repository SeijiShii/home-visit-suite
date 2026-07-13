// サービス層テスト用の共通フィクスチャ。
// 参照実装のテスト: shared/service/*_test.go

import type { User } from "../domain/models/user";
import { InMemoryCheckoutRepository } from "../data/inmemory/inmemory-checkout-repository";
import { InMemoryCoverageRepository } from "../data/inmemory/inmemory-coverage-repository";
import { InMemoryNotificationRepository } from "../data/inmemory/inmemory-notification-repository";
import { InMemoryRegionRepository } from "../data/inmemory/inmemory-region-repository";
import { InMemoryUserRepository } from "../data/inmemory/inmemory-user-repository";
import { CheckoutServiceImpl, type CheckoutService } from "./checkout-service";

/** テストの固定現在時刻。 */
export const NOW = new Date("2026-07-07T12:00:00Z");

export const ADMIN = "did:test:admin";
export const EDITOR = "did:test:editor";
export const MEMBER1 = "did:test:member1";
export const MEMBER2 = "did:test:member2";

export interface Fixture {
  userRepo: InMemoryUserRepository;
  coRepo: InMemoryCheckoutRepository;
  covRepo: InMemoryCoverageRepository;
  notifRepo: InMemoryNotificationRepository;
  regionRepo: InMemoryRegionRepository;
  coSvc: CheckoutService;
}

function user(id: string, role: User["role"]): User {
  return { id, name: id, role, tagIds: [], joinedAt: "2026-01-01T00:00:00Z" };
}

/**
 * 標準フィクスチャ:
 * - ユーザー: admin / editor / member1 / member2
 * - 領域ツリー: region r1(NRT) > 親番 pa1(区域 a1, a2), pa2(区域 a3, a4)
 *   a1/a2/a3 はポリゴン紐付け済み、a4 は未紐付け（チェックアウト不可）
 * - チェックアウトのゲートは排他制約 + ポリゴン紐付けのみ（「チェックアウト可能期間」は廃止済み）
 */
export async function makeFixture(
  nowFn: () => Date = () => NOW,
): Promise<Fixture> {
  const userRepo = new InMemoryUserRepository();
  const coRepo = new InMemoryCheckoutRepository();
  const covRepo = new InMemoryCoverageRepository();
  const notifRepo = new InMemoryNotificationRepository();
  const regionRepo = new InMemoryRegionRepository();

  for (const u of [
    user(ADMIN, "admin"),
    user(EDITOR, "editor"),
    user(MEMBER1, "member"),
    user(MEMBER2, "member"),
  ]) {
    await userRepo.saveUser(u);
  }

  await regionRepo.saveRegion({
    id: "r1",
    name: "成田市",
    symbol: "NRT",
    approved: true,
    geometry: null,
    order: 0,
  });
  await regionRepo.saveParentArea({
    id: "pa1",
    regionId: "r1",
    number: "001",
    name: "加良部1丁目",
    geometry: null,
  });
  await regionRepo.saveParentArea({
    id: "pa2",
    regionId: "r1",
    number: "002",
    name: "加良部2丁目",
    geometry: null,
  });
  // a1/a2/a3 はポリゴン紐付け済み（チェックアウト可能）
  await regionRepo.saveArea({
    id: "a1",
    parentAreaId: "pa1",
    number: "01",
    polygonId: "poly-a1",
    geometry: null,
  });
  await regionRepo.saveArea({
    id: "a2",
    parentAreaId: "pa1",
    number: "02",
    polygonId: "poly-a2",
    geometry: null,
  });
  await regionRepo.saveArea({
    id: "a3",
    parentAreaId: "pa2",
    number: "01",
    polygonId: "poly-a3",
    geometry: null,
  });
  // a4 はポリゴン未紐付け（チェックアウト不可のテスト用）
  await regionRepo.saveArea({
    id: "a4",
    parentAreaId: "pa2",
    number: "02",
    geometry: null,
  });

  const coSvc = new CheckoutServiceImpl(
    coRepo,
    userRepo,
    notifRepo,
    regionRepo,
    nowFn,
  );

  return { userRepo, coRepo, covRepo, notifRepo, regionRepo, coSvc };
}
