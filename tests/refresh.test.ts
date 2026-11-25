import { describe, expect, it } from "vitest";
import {
  acceptRefreshClick,
  createRefreshGate,
  isMainFrameSender,
  refreshControlLabel,
  startRefreshIfTrusted,
} from "../src/shared/refresh";

describe("footer refresh", () => {
  it("accepts a click only when a refresh is idle", () => {
    expect(acceptRefreshClick(false)).toBe(true);
    expect(acceptRefreshClick(true)).toBe(false);
  });

  it("labels the control while a refresh is running", () => {
    expect(refreshControlLabel(false)).toBe("REFRESH");
    expect(refreshControlLabel(true)).toBe("REFRESHING");
  });
});

describe("refresh gate", () => {
  it("coalesces overlapping callers into one run", async () => {
    let started = 0;
    let release: () => void = () => {};
    const gate = createRefreshGate(
      () =>
        new Promise<void>((resolve) => {
          started += 1;
          release = resolve;
        }),
    );

    const first = gate.requestRefresh();
    const second = gate.requestRefresh();
    const third = gate.requestRefresh();
    expect(started).toBe(1);
    expect(first).toBe(second);
    expect(second).toBe(third);

    release();
    await first;
    expect(started).toBe(1);
  });

  it("queues one follow-up when config changes during a run", async () => {
    let started = 0;
    let release: () => void = () => {};
    const gate = createRefreshGate(
      () =>
        new Promise<void>((resolve) => {
          started += 1;
          release = resolve;
        }),
    );

    const first = gate.requestRefresh();
    expect(started).toBe(1);
    gate.queueConfigEdit();
    gate.queueConfigEdit();
    gate.queueConfigEdit();
    expect(started).toBe(1);

    release();
    await first;
    expect(started).toBe(2);

    release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(started).toBe(2);
  });

  it("accepts another refresh after a run fails", async () => {
    let started = 0;
    const gate = createRefreshGate(async () => {
      started += 1;
      if (started === 1) throw new Error("refresh failed");
    });

    await expect(gate.requestRefresh()).rejects.toThrow("refresh failed");
    await gate.requestRefresh();
    expect(started).toBe(2);
  });
});

describe("sender frame", () => {
  it("rejects a sender that is not the launcher main frame", async () => {
    let started = 0;
    const requestRefresh = async () => {
      started += 1;
    };
    const main = { id: "main" };
    const child = { id: "child" };

    expect(isMainFrameSender(null, main)).toBe(false);
    expect(isMainFrameSender(main, null)).toBe(false);
    expect(isMainFrameSender(child, main)).toBe(false);
    expect(isMainFrameSender(main, main)).toBe(true);

    expect(startRefreshIfTrusted(null, main, requestRefresh)).toBeUndefined();
    expect(startRefreshIfTrusted(main, null, requestRefresh)).toBeUndefined();
    expect(startRefreshIfTrusted(child, main, requestRefresh)).toBeUndefined();
    expect(started).toBe(0);

    await startRefreshIfTrusted(main, main, requestRefresh);
    expect(started).toBe(1);
  });
});
