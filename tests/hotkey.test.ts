import { describe, expect, it } from "vitest";
import { DEFAULT_HOTKEY } from "../src/shared/config";
import { hotkeyRegistrationWarnings } from "../src/shared/hotkey";

describe("hotkey registration warnings", () => {
  it("is empty when the requested hotkey registered", () => {
    expect(hotkeyRegistrationWarnings(DEFAULT_HOTKEY, DEFAULT_HOTKEY)).toEqual([]);
  });

  it("keeps the fallback warning when only the default registered", () => {
    expect(hotkeyRegistrationWarnings("CommandOrControl+Space", DEFAULT_HOTKEY)).toEqual([
      `Could not register CommandOrControl+Space; trying ${DEFAULT_HOTKEY}`,
    ]);
  });

  it("keeps the failure warning when nothing registered", () => {
    expect(hotkeyRegistrationWarnings("CommandOrControl+Space", "")).toEqual([
      `Could not register CommandOrControl+Space; trying ${DEFAULT_HOTKEY}`,
      "No global hotkey is registered",
    ]);
  });
});
