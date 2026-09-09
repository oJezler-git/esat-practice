import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({
  applyExchangeResponse: vi.fn().mockResolvedValue(false),
  buildExchangeRequest: vi.fn(),
  clearCloudDocument: vi.fn(),
  createRandomSyncKey: vi.fn(),
  createSyncKeyWithWords: vi.fn(),
  exchangeWithCloud: vi.fn(),
  getSyncKey: vi.fn(() => "amber-forest-1234" as string | null),
  getSyncMeta: vi.fn().mockResolvedValue({
    migrationComplete: true,
    lastSuccessfulSync: 123,
  }),
  queueInitialSyncSnapshot: vi.fn(),
  saveLocalBackup: vi.fn(),
  setSyncKey: vi.fn(),
  setSyncRetryCount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./cloudSync", () => ({
  ...cloud,
  SyncHttpError: class SyncHttpError extends Error {
    retryable = false;
  },
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    count: vi.fn().mockResolvedValue(0),
  }),
}));

describe("sync coordinator exchange loop", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cloud.getSyncKey.mockReturnValue("amber-forest-1234");
    cloud.getSyncMeta.mockResolvedValue({ migrationComplete: true, lastSuccessfulSync: 123, retryCount: 0 });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("continues paginated exchanges with the cursor produced by the prior page", async () => {
    cloud.buildExchangeRequest
      .mockResolvedValueOnce({ version: 2, deviceId: "d", epoch: 1, cursor: 0, mutations: [] })
      .mockResolvedValueOnce({ version: 2, deviceId: "d", epoch: 1, cursor: 2, mutations: [] });
    cloud.exchangeWithCloud
      .mockResolvedValueOnce({ version: 2, epoch: 1, cursor: 2, hasMore: true })
      .mockResolvedValueOnce({ version: 2, epoch: 1, cursor: 3, hasMore: false });

    const { syncNow, getSyncStatus } = await import("./syncCoordinator");
    await syncNow("manual");

    expect(cloud.exchangeWithCloud).toHaveBeenCalledTimes(2);
    expect(cloud.applyExchangeResponse).toHaveBeenCalledTimes(2);
    expect(getSyncStatus().status).toBe("saved");
  });

  it("fails a hasMore response that does not advance its cursor", async () => {
    vi.useFakeTimers();
    cloud.buildExchangeRequest.mockResolvedValue({
      version: 2, deviceId: "d", epoch: 1, cursor: 4, mutations: [],
    });
    cloud.exchangeWithCloud.mockResolvedValue({
      version: 2, epoch: 1, cursor: 4, hasMore: true,
    });

    const { syncNow, getSyncStatus } = await import("./syncCoordinator");
    await syncNow("manual");

    expect(cloud.applyExchangeResponse).not.toHaveBeenCalled();
    expect(getSyncStatus()).toMatchObject({
      status: "error",
      error: expect.stringMatching(/did not advance/),
    });
  });

  it("coalesces overlapping requests into one network exchange", async () => {
    let resolveExchange!: (value: unknown) => void;
    cloud.buildExchangeRequest.mockResolvedValue({
      version: 2, deviceId: "d", epoch: 1, cursor: 0, mutations: [],
    });
    cloud.exchangeWithCloud.mockReturnValue(new Promise((resolve) => {
      resolveExchange = resolve;
    }));

    const { syncNow } = await import("./syncCoordinator");
    const first = syncNow("manual");
    const second = syncNow("manual");
    await Promise.resolve();
    await Promise.resolve();
    expect(cloud.exchangeWithCloud).toHaveBeenCalledTimes(1);

    resolveExchange({ version: 2, epoch: 1, cursor: 1, hasMore: false });
    await Promise.all([first, second]);
    expect(cloud.exchangeWithCloud).toHaveBeenCalledTimes(1);
  });
});
