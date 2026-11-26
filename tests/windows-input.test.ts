import { describe, expect, it } from "vitest";
import {
  inputHelperScript,
  inputRequestLine,
  parseForeground,
} from "../src/main/windows-input";

describe("Windows keyboard helper", () => {
  it("is one line with no quotes or backticks that would break it", () => {
    const script = inputHelperScript();
    expect(script.includes("\n")).toBe(false);
    expect(script.includes("`")).toBe(false);
    const csharp = script.slice(
      script.indexOf("-TypeDefinition '") + 17,
      script.indexOf("';"),
    );
    expect(csharp.includes("'")).toBe(false);
    expect(script).toContain("SendInput");
  });

  it("sends ASCII-only requests and reads the window in front", () => {
    const line = inputRequestLine({ id: 1, op: "type", text: "café “quotes”" });
    expect(/^[\x20-\x7e]+$/.test(line)).toBe(true);
    expect(JSON.parse(line).text).toBe("café “quotes”");
    expect(
      parseForeground("123|45|Code|hello.py - Visual Studio Code"),
    ).toEqual({
      hwnd: 123,
      pid: 45,
      process: "Code",
      title: "hello.py - Visual Studio Code",
    });
    expect(parseForeground(null)).toBeUndefined();
  });
});
