// アプリ全体で使うリポジトリ・サービスの束を配線する Context。
// 画面は useServices() 経由でサービスを呼ぶ（旧 Wails Binding の置き換え）。
// LinkSelf TS アダプタ完成時は createInMemoryServices の実装を差し替えるだけでよい。

import { createContext, useContext, type ReactNode } from "react";
import { InMemoryCheckoutRepository } from "../data/inmemory/inmemory-checkout-repository";
import { InMemoryCoverageRepository } from "../data/inmemory/inmemory-coverage-repository";
import { InMemoryNotificationRepository } from "../data/inmemory/inmemory-notification-repository";
import { InMemoryPendingImportPlaceRepository } from "../data/inmemory/inmemory-pending-import-place-repository";
import { InMemoryPersonalRepository } from "../data/inmemory/inmemory-personal-repository";
import { LocalStoragePersonalRepository } from "../data/localstorage/localstorage-personal-repository";
import { InMemoryPlaceRepository } from "../data/inmemory/inmemory-place-repository";
import { InMemoryRegionRepository } from "../data/inmemory/inmemory-region-repository";
import { InMemoryUserRepository } from "../data/inmemory/inmemory-user-repository";
import type { CheckoutRepository } from "../domain/repositories/checkout-repository";
import type { CoverageRepository } from "../domain/repositories/coverage-repository";
import type { NotificationRepository } from "../domain/repositories/notification-repository";
import type { PersonalRepository } from "../domain/repositories/personal-repository";
import type { PlaceRepository } from "../domain/repositories/place-repository";
import type { RegionRepository } from "../domain/repositories/region-repository";
import type { UserRepository } from "../domain/repositories/user-repository";
import { AuthServiceImpl, type AuthService } from "../services/auth-service";
import {
  CheckoutServiceImpl,
  type CheckoutService,
} from "../services/checkout-service";
import { RegionRepositoryBindingAdapter } from "../services/region-binding-adapter";
import { PersonalRepositorySettingsAdapter } from "../services/settings-binding-adapter";
import { SettingsService } from "../services/settings-service";
import { PlaceService } from "../services/place-service";
import { PlaceRepositoryBindingAdapter } from "../services/place-binding-adapter";
import { PlaceImportService } from "../services/place-import-service";
import { VisitService } from "../services/visit-service";
import { VisitBindingAdapter } from "../services/visit-binding-adapter";
import type { RegionBindingAPI } from "../services/region-service";
import { LocalStorageMapBinding, type MapBindingAPI } from "../lib/map-storage";

export interface AppServices {
  // リポジトリ（画面から直接使うのは読み取り系のみに留める）
  userRepo: UserRepository;
  regionRepo: RegionRepository;
  checkoutRepo: CheckoutRepository;
  coverageRepo: CoverageRepository;
  notificationRepo: NotificationRepository;
  personalRepo: PersonalRepository;
  placeRepo: PlaceRepository;

  // サービス
  authService: AuthService;
  checkoutService: CheckoutService;
  settingsService: SettingsService;
  placeService: PlaceService;
  placeImportService: PlaceImportService;
  visitService: VisitService;

  // 地図編集用のアダプタ（旧 Wails RegionBinding / MapBinding 相当）
  regionBindingApi: RegionBindingAPI;
  mapBinding: MapBindingAPI;
}

/** インメモリ実装一式でサービス束を構築する（LinkSelf TS アダプタ完成までの暫定）。 */
export interface CreateServicesOptions {
  /**
   * true で全ドメインデータ + 個人設定を localStorage に永続化する（runtime 用。
   * 再読み込みでも状態を保持）。省略時は全てインメモリ（テスト用）。
   * LinkSelf TS アダプタ完成までの暫定ブリッジ。
   * ※ユーザー（identity）は毎起動でシードされるため永続化しない。
   */
  persist?: boolean;
}

export function createInMemoryServices(
  opts: CreateServicesOptions = {},
): AppServices {
  const prefix = opts.persist ? "hvs" : undefined;
  const sub = (name: string) => (prefix ? `${prefix}:${name}` : undefined);

  const userRepo = new InMemoryUserRepository(sub("user"));
  const regionRepo = new InMemoryRegionRepository(sub("region"));
  const checkoutRepo = new InMemoryCheckoutRepository(sub("checkout"));
  const coverageRepo = new InMemoryCoverageRepository(sub("coverage"));
  const notificationRepo = new InMemoryNotificationRepository(
    sub("notification"),
  );
  const personalRepo = opts.persist
    ? new LocalStoragePersonalRepository()
    : new InMemoryPersonalRepository();
  const placeRepo = new InMemoryPlaceRepository(undefined, sub("place"));

  const checkoutService = new CheckoutServiceImpl(
    checkoutRepo,
    userRepo,
    notificationRepo,
    regionRepo,
  );
  const authService = new AuthServiceImpl(userRepo);
  const settingsService = new SettingsService(
    new PersonalRepositorySettingsAdapter(personalRepo),
  );
  const placeService = new PlaceService(
    new PlaceRepositoryBindingAdapter(placeRepo),
  );
  const pendingImportPlaceRepo = new InMemoryPendingImportPlaceRepository(
    sub("pendingImportPlace"),
  );
  const placeImportService = new PlaceImportService(
    pendingImportPlaceRepo,
    placeService,
  );
  const visitService = new VisitService(
    new VisitBindingAdapter(checkoutService, checkoutRepo),
  );

  const regionBindingApi = new RegionRepositoryBindingAdapter(regionRepo);
  const mapBinding = new LocalStorageMapBinding();

  return {
    userRepo,
    regionRepo,
    checkoutRepo,
    coverageRepo,
    notificationRepo,
    personalRepo,
    placeRepo,
    authService,
    checkoutService,
    settingsService,
    placeService,
    placeImportService,
    visitService,
    regionBindingApi,
    mapBinding,
  };
}

const ServicesContext = createContext<AppServices | null>(null);

interface ServicesProviderProps {
  children: ReactNode;
  services: AppServices;
}

export function ServicesProvider({
  children,
  services,
}: ServicesProviderProps) {
  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within ServicesProvider");
  return ctx;
}
