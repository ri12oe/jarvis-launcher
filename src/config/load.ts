import fs from "node:fs";
import path from "node:path";
import { cloneDefaultConfig, parseConfigText, serializeConfig } from "../shared/config";
import type { JarvisConfig } from "../shared/types";

export interface LoadedConfig {
  config: JarvisConfig;
  warnings: string[];
  filePath: string;
}

/**
 * Load `config.json` from the app's user-data directory.
 * The file is created with defaults when it is missing.
 * A broken file is left untouched and defaults are used in memory.
 */
export function loadConfig(userDataDir: string): LoadedConfig {
  const filePath = path.join(userDataDir, "config.json");
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!missing) {
      return {
        config: cloneDefaultConfig(),
        warnings: ["Could not read config; using defaults"],
        filePath,
      };
    }
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(filePath, serializeConfig(cloneDefaultConfig()), "utf8");
    } catch {
      return {
        config: cloneDefaultConfig(),
        warnings: ["Could not create the default config file; using defaults"],
        filePath,
      };
    }
    return { config: cloneDefaultConfig(), warnings: [], filePath };
  }

  const parsed = parseConfigText(text);
  return { config: parsed.config, warnings: parsed.warnings, filePath };
}
