import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScheduleService, type ScheduleBindingAPI } from "./schedule-service";
import { models } from "../../wailsjs/go/models";

const period = (id: string, name = id): models.SchedulePeriod =>
  ({
    id,
    name,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-03-31"),
    approved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as models.SchedulePeriod;

const createMockAPI = (): ScheduleBindingAPI => ({
  ListSchedulePeriods: vi.fn().mockResolvedValue([]),
  GetSchedulePeriod: vi.fn().mockResolvedValue(period("sp-1")),
  CreateSchedulePeriod: vi.fn().mockResolvedValue(undefined),
  UpdateSchedulePeriod: vi.fn().mockResolvedValue(undefined),
  DeleteSchedulePeriod: vi.fn().mockResolvedValue(undefined),
  ApproveSchedulePeriod: vi.fn().mockResolvedValue(undefined),
  RevokeSchedulePeriodApproval: vi.fn().mockResolvedValue(undefined),
  ListScopes: vi.fn().mockResolvedValue([]),
  GetScope: vi.fn().mockResolvedValue({}),
  CreateScope: vi.fn().mockResolvedValue(undefined),
  UpdateScope: vi.fn().mockResolvedValue(undefined),
  DeleteScope: vi.fn().mockResolvedValue(undefined),
  CreateScopesFromGroups: vi.fn().mockResolvedValue([]),
  ListAreaAvailabilities: vi.fn().mockResolvedValue([]),
  CreateAreaAvailability: vi.fn().mockResolvedValue(undefined),
  UpdateAreaAvailability: vi.fn().mockResolvedValue(undefined),
  DeleteAreaAvailability: vi.fn().mockResolvedValue(undefined),
});

describe("ScheduleService", () => {
  let api: ReturnType<typeof createMockAPI>;
  let svc: ScheduleService;

  beforeEach(() => {
    api = createMockAPI();
    svc = new ScheduleService(api);
  });

  it("listPeriods は API を呼ぶ", async () => {
    (api.ListSchedulePeriods as ReturnType<typeof vi.fn>).mockResolvedValue([
      period("sp-1"),
      period("sp-2"),
    ]);
    const list = await svc.listPeriods();
    expect(list).toHaveLength(2);
    expect(api.ListSchedulePeriods).toHaveBeenCalledOnce();
  });

  it("listPeriods は null を空配列に正規化する", async () => {
    (api.ListSchedulePeriods as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const list = await svc.listPeriods();
    expect(list).toEqual([]);
  });

  it("createPeriod は API に委譲", async () => {
    const sp = period("sp-1");
    await svc.createPeriod(sp);
    expect(api.CreateSchedulePeriod).toHaveBeenCalledWith(sp);
  });

  it("approve は actorId と id を渡す", async () => {
    await svc.approve("admin-1", "sp-1");
    expect(api.ApproveSchedulePeriod).toHaveBeenCalledWith("admin-1", "sp-1");
  });

  it("revoke は actorId と id を渡す", async () => {
    await svc.revoke("admin-1", "sp-1");
    expect(api.RevokeSchedulePeriodApproval).toHaveBeenCalledWith("admin-1", "sp-1");
  });

  it("listScopes は null を空配列に正規化", async () => {
    (api.ListScopes as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const list = await svc.listScopes("sp-1");
    expect(list).toEqual([]);
  });

  it("createScopesFromGroups は API を呼んで結果を返す", async () => {
    const created = [{ id: "scope-1" }] as unknown as models.Scope[];
    (api.CreateScopesFromGroups as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const result = await svc.createScopesFromGroups("sp-1", ["g-1"]);
    expect(result).toEqual(created);
    expect(api.CreateScopesFromGroups).toHaveBeenCalledWith("sp-1", ["g-1"]);
  });

  it("listAvailabilities は null を空配列に正規化", async () => {
    (api.ListAreaAvailabilities as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const list = await svc.listAvailabilities("scope-1");
    expect(list).toEqual([]);
  });

  it("createAvailability は API に委譲", async () => {
    const aa = { id: "aa-1" } as unknown as models.AreaAvailability;
    await svc.createAvailability(aa);
    expect(api.CreateAreaAvailability).toHaveBeenCalledWith(aa);
  });
});
