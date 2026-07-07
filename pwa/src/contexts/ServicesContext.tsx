// アプリ全体で使うリポジトリ・サービスの束を配線する Context。
// 画面は useServices() 経由でサービスを呼ぶ（旧 Wails Binding の置き換え）。
// LinkSelf TS アダプタ完成時は createInMemoryServices の実装を差し替えるだけでよい。

import { createContext, useContext, type ReactNode } from "react";
import { InMemoryCheckoutRepository } from "../data/inmemory/inmemory-checkout-repository";
import { InMemoryCoverageRepository } from "../data/inmemory/inmemory-coverage-repository";
import { InMemoryNotificationRepository } from "../data/inmemory/inmemory-notification-repository";
import { InMemoryRegionRepository } from "../data/inmemory/inmemory-region-repository";
import { InMemoryUserRepository } from "../data/inmemory/inmemory-user-repository";
import type { CheckoutRepository } from "../domain/repositories/checkout-repository";
import type { CoverageRepository } from "../domain/repositories/coverage-repository";
import type { NotificationRepository } from "../domain/repositories/notification-repository";
import type { RegionRepository } from "../domain/repositories/region-repository";
import type { UserRepository } from "../domain/repositories/user-repository";
import { AuthServiceImpl, type AuthService } from "../services/auth-service";
import {
  AvailablePeriodServiceImpl,
  type AvailablePeriodService,
} from "../services/available-period-service";
import { CheckoutServiceImpl, type CheckoutService } from "../services/checkout-service";

export interface AppServices {
  // リポジトリ（画面から直接使うのは読み取り系のみに留める）
  userRepo: UserRepository;
  regionRepo: RegionRepository;
  checkoutRepo: CheckoutRepository;
  coverageRepo: CoverageRepository;
  notificationRepo: NotificationRepository;

  // サービス
  authService: AuthService;
  availablePeriodService: AvailablePeriodService;
  checkoutService: CheckoutService;
}

/** インメモリ実装一式でサービス束を構築する（LinkSelf TS アダプタ完成までの暫定）。 */
export function createInMemoryServices(): AppServices {
  const userRepo = new InMemoryUserRepository();
  const regionRepo = new InMemoryRegionRepository();
  const checkoutRepo = new InMemoryCheckoutRepository();
  const coverageRepo = new InMemoryCoverageRepository();
  const notificationRepo = new InMemoryNotificationRepository();

  const availablePeriodService = new AvailablePeriodServiceImpl(
    coverageRepo,
    checkoutRepo,
    userRepo,
  );
  const checkoutService = new CheckoutServiceImpl(
    checkoutRepo,
    userRepo,
    notificationRepo,
    regionRepo,
    availablePeriodService,
  );
  const authService = new AuthServiceImpl(userRepo);

  return {
    userRepo,
    regionRepo,
    checkoutRepo,
    coverageRepo,
    notificationRepo,
    authService,
    availablePeriodService,
    checkoutService,
  };
}

/**
 * アプリ起動時の reconcile。
 * PWA はバックグラウンド常駐がないため、期限切れ AvailablePeriod 配下の
 * チェックアウト強制クローズを起動のたびに実行する
 * （docs/wants/09_継続的検討事項.md「バックグラウンドジョブの設計転換」）。
 */
export async function reconcileOnStartup(services: AppServices): Promise<void> {
  try {
    await services.availablePeriodService.forceCloseExpiredCheckouts(new Date());
  } catch (e) {
    console.error("startup reconcile failed", e);
  }
}

const ServicesContext = createContext<AppServices | null>(null);

interface ServicesProviderProps {
  children: ReactNode;
  services: AppServices;
}

export function ServicesProvider({ children, services }: ServicesProviderProps) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within ServicesProvider");
  return ctx;
}
