# Jarvis Launcher

A full-screen JARVIS-style launcher that sits on top of Windows. It is an Electron window, not a shell replacement. It does not change Explorer, `explorer.exe`, logon shell keys, or any other system setting.

Click a tile to open that app or folder. The launcher only reads Start Menu shortcuts, the uninstall program list, and the Start menu app list. It never deletes, moves, or edits your files. The only file it writes is its own `config.json`.

## Install

You need Node.js 20 or newer.

```powershell
npm install
```

## Run in development

```powershell
npm run dev
```

That starts the renderer, compiles the Electron main process, and opens the launcher. The default hotkey is **Ctrl+Alt+J** (`CommandOrControl+Alt+J` in the config). Press it again, or Esc, to hide the window. The process keeps running so the hotkey still works. Quit from the tray icon or the QUIT control.

The tray menu is Show, Hide, Refresh, and Quit. Refresh re-reads `config.json` and the installed apps. Opening the window uses the list already in memory. Saving `config.json` re-reads it too.

`npm test` runs the unit tests. `npm run typecheck` typechecks the main process and the renderer.

On Linux or macOS the window still opens, with Microsoft Edge, File Explorer, and the standard folder tiles. Scanning Start Menu `.lnk` files, packaged apps, and the uninstall registry happens only on Windows, so those systems will not list installed AI apps.

## Build a Windows installer and a portable exe

On a Windows machine:

```powershell
npm run dist:win
```

`electron-builder` writes:

- `release/JarvisLauncher-Setup.exe` — NSIS installer (you pick the directory)
- `release/JarvisLauncher-portable.exe` — portable build

The build does not turn on code signing (`signAndEditExecutable` is false).

## Autostart

The launcher does not write shell registry keys. Two ways to start it at login:

**Config flag.** Set `"openAtLogin": true` in `config.json`. On Windows and macOS, Electron's login-item API registers or removes the app. On Windows that is the normal per-user startup entry, not `Winlogon\Shell`. A portable exe passes `PORTABLE_EXECUTABLE_FILE` as the login path, so Windows does not start the temporary unpacked copy. Saving the file applies the flag. Set it back to `false` to remove that entry. The setting is applied at startup and when the config value changes. Showing the window does not re-read the file.

**Startup folder shortcut.** In File Explorer, open:

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

Create a shortcut there that points at `Jarvis Launcher.exe` (the installed app, or the portable exe). Remove that shortcut to stop autostart. Leave the registry alone.

`"startHidden": true` keeps the window hidden until the hotkey or the tray shows it. Useful with autostart.

## Config

First launch creates the file if it is missing:

```text
%APPDATA%\jarvis-launcher\config.json
```

A broken file is left as it is. The launcher uses defaults in memory until the JSON is valid again.

```json
{
  "hotkey": "CommandOrControl+Alt+J",
  "openAtLogin": false,
  "startHidden": false,
  "pinnedFolders": [
    { "id": "projects", "label": "Projects", "path": "C:\\Users\\Mario\\Projects" }
  ],
  "extraTiles": [
    { "id": "notes", "label": "Notes", "path": "D:\\Notes\\todo.txt", "kind": "app" }
  ],
  "disabled": ["copilot"],
  "order": ["cursor", "claude", "edge", "explorer"],
  "labels": { "cursor": "Cursor IDE" }
}
```

- `pinnedFolders` adds folder tiles. `kind` is not used; they always open the path.
- `extraTiles` adds a tile that opens a file, shortcut, or folder. `kind` is `"app"` or `"folder"` and only affects the label on the tile.
- `disabled` removes a tile. Built-in ids: `edge`, `explorer`, `desktop`, `documents`, `downloads`, `pictures`. Discovered ids: `chatgpt`, `claude`, `cursor`, `grok`, `copilot`, `perplexity`, `ollama`, `lm-studio`.
- `order` pulls those ids to the front. Anything you leave out stays in the default order after them.
- `labels` renames a tile. Ids and paths must be absolute (`C:\...`, `\\server\share`, or `/...`). Custom ids cannot reuse a built-in or discovered id.

Discovered apps are added automatically when a Start Menu shortcut, a packaged Start app, or an uninstall entry matches. You do not have to list them.

## What it detects

Shortcut names (and, when Windows can read them, shortcut targets) under:

- `%ProgramData%\Microsoft\Windows\Start Menu\Programs`
- `%AppData%\Microsoft\Windows\Start Menu\Programs`

Packaged Store apps such as ChatGPT and Copilot often have no `.lnk` and no uninstall entry. Those are read with `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -Command` running `Get-StartApps` (an argument array, not a shell command line). If that call fails, the launcher shows a warning and still lists shortcuts and uninstall matches. A match launches with `%SystemRoot%\explorer.exe shell:AppsFolder\<AppID>`.

Plus display names in these uninstall keys, read with `reg query` only:

- `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
- `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`
- `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`

A match needs a name like ChatGPT, Claude, Cursor, Grok, Copilot, Perplexity, Ollama, or LM Studio. Cursor matches the name `Cursor`, and Copilot matches `Copilot` or `Microsoft Copilot`. A Start Menu shortcut is preferred, then a Store app, then the registry. A registry hit is used only when `DisplayIcon` points at an `.exe`. Shortcuts and registry entries whose name or target looks like an uninstaller are ignored. Uninstall strings are ignored.

Fixed tiles:

| Tile | What a click does |
| --- | --- |
| Microsoft Edge | Opens `msedge.exe` when it is installed, otherwise the `microsoft-edge:` protocol |
| File Explorer | Starts `%SystemRoot%\explorer.exe` |
| Desktop, Documents, Downloads, Pictures | Opens that folder |
| Pinned folder | Opens the path from the config |

A tile shows the file icon when the platform can read one. A Store app has no file to read, and Microsoft Edge uses a small placeholder when `msedge.exe` is not in the usual install folders.

## Tests

```powershell
npm test
```

Matching, config validation, shortcut scanning, registry-output parsing, and launch plans are covered. Launch tests mock `openPath`, `openExternal`, and `spawn`, so they do not need Windows.
