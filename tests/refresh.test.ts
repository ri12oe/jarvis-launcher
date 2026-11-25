import { describe, expect, it } from "vitest";
import { acceptRefreshClick, refreshControlLabel } from "../src/shared/refresh";

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
