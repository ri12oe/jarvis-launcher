import { describe, expect, it } from "vitest";
import { readStartApps, START_APPS_ARGS, START_APPS_FAILURE, windowsPowershellPath } from "../src/discovery/start-apps";
import { parseStartAppsJson } from "../src/shared/start-apps";

const CHATGPT = "OpenAI.ChatGPT-Desktop_2p2nqsdnc2c4m!App";
const COPILOT = "Microsoft.Copilot_8wekyb3d8bbwe!App";

describe("Get-StartApps parsing", () => {
  it("asks PowerShell with an argument array and no shell command", () => {
    expect([...START_APPS_ARGS]).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      expect.stringContaining("Get-StartApps"),
    ]);
    expect(START_APPS_ARGS[3]).not.toContain("\n");
  });

  it("builds the System32 Windows PowerShell path", () => {
    expect(windowsPowershellPath("D:\\Windows\\")).toBe(
      "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(windowsPowershellPath(undefined)).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
  });

  it("parses one object, an array, and drops bad ids", () => {
    expect(parseStartAppsJson(`{"Name":"ChatGPT","AppID":"${CHATGPT}"}`)).toEqual([
      { name: "ChatGPT", appId: CHATGPT },
    ]);
    expect(
      parseStartAppsJson(
        JSON.stringify([
          { Name: "Copilot", AppID: COPILOT },
          { Name: "Nope", AppID: "shell:cmd & calc" },
          { Name: "", AppID: COPILOT },
        ]),
      ),
    ).toEqual([{ name: "Copilot", appId: COPILOT }]);
    expect(parseStartAppsJson("")).toEqual([]);
    expect(parseStartAppsJson("not json")).toEqual([]);
    expect(parseStartAppsJson("null")).toEqual([]);
  });

  it("does not run PowerShell off Windows", async () => {
    let called = false;
    const read = await readStartApps("linux", process.env, async () => {
      called = true;
      return { stdout: "" };
    });
    expect(called).toBe(false);
    expect(read).toEqual({ apps: [] });
  });

  it("calls Windows PowerShell by its System32 path", async () => {
    let file = "";
    const read = await readStartApps("win32", { SystemRoot: "D:\\Windows\\" }, async (cmd, args) => {
      file = cmd;
      expect(args).toEqual([...START_APPS_ARGS]);
      return { stdout: `{"Name":"ChatGPT","AppID":"${CHATGPT}"}` };
    });
    expect(file).toBe("D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(read).toEqual({ apps: [{ name: "ChatGPT", appId: CHATGPT }] });
  });

  it("returns a warning when PowerShell fails", async () => {
    const read = await readStartApps("win32", { SystemRoot: "C:\\Windows" }, async () => {
      throw new Error("missing");
    });
    expect(read).toEqual({ apps: [], warning: START_APPS_FAILURE });
  });
});
