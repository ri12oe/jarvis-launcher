import { describe, expect, it } from "vitest";
import { readStartApps, START_APPS_ARGS } from "../src/discovery/start-apps";
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
    await expect(readStartApps("linux")).resolves.toEqual([]);
  });
});
