import { describe, expect, it } from "vitest";
import { loginItemOptions } from "../src/shared/login-item";

describe("login item path", () => {
  it("points a portable build at the real exe", () => {
    expect(
      loginItemOptions(true, { PORTABLE_EXECUTABLE_FILE: "D:\\Apps\\JarvisLauncher-portable.exe" }),
    ).toEqual({
      openAtLogin: true,
      path: "D:\\Apps\\JarvisLauncher-portable.exe",
    });
  });

  it("leaves path unset for a normal install", () => {
    expect(loginItemOptions(false, {})).toEqual({ openAtLogin: false });
    expect(loginItemOptions(true, { PORTABLE_EXECUTABLE_FILE: "  " })).toEqual({ openAtLogin: true });
  });
});
