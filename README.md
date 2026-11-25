# Jarvis Launcher

A full-screen JARVIS-style launcher for Windows. It is an Electron window, not a shell replacement. It does not change Explorer, `explorer.exe`, logon shell keys, or any other system setting.

Click a tile to open that app or folder. The launcher only reads Start Menu shortcuts, the uninstall program list, and the Start menu app list. It never deletes, moves, or edits your files. The only file it writes is its own `config.json`.

## UI

The window is a full-screen HUD. Every tile — discovered AI apps, Microsoft Edge, File Explorer, the standard folders, pinned folders, and extra tiles — is a segment on a ring around an arc reactor. The reactor is a cyan core with concentric rings, tick marks, and arcs. A static mark in the center of the core is reserved for a later mic or voice indicator. It does not listen, record, or change state.

Segments sit on up to three rings. The first segment on a ring is at the top and the rest run clockwise, in config order. Each segment's radius comes from its label width and icon size, so a label does not cover a neighbor. When the tiles fit, the ring fills about 85–90% of the screen height. When they still do not fit, the rest move to another page. PageUp and PageDown change pages and focus a tile on that page. The previous and next arc buttons beside the core also change pages, and they keep the keyboard focus so Enter can page again. A page indicator sits under the reactor. Pages that contain a filter match are highlighted. Focusing a tile on another page shows that page. Esc clears a filter and leaves the current page up, with focus still on a tile.

The only side panel is the clock and the date, at the top left. The footer keeps the status line and the REFRESH and QUIT controls. The status is SCANNING, REFRESHING, REFRESH FAILED, LAUNCH FAILED with the reason, the filter text, NO MATCH when the filter hits nothing, or a warning. LAUNCH FAILED is shown in amber.

Left and Right move around the current ring. They wrap, and they skip dimmed segments. Up and Down move to the nearest lit segment on the next ring, wrapping from the inner ring to the outer ring and back. On a single ring, Up and Down move around that ring as well. Enter launches the focused segment. Typing filters by name: matching segments stay bright, the rest dim, and the footer shows the text (`FILTER  EDGE`). A filter that matches nothing shows `NO MATCH`. Backspace edits the filter. Space activates the focused button. Esc clears the filter, and hides the window when the filter is already empty. Hiding from the hotkey clears the filter too. A failed launch stays in the footer until the next key, a tile click, refresh, or hide. A launch leaves Jarvis up.

The rings turn slowly, a scan line crosses the display, and a short boot sequence plays when the window opens. Motion is CSS transforms and opacity. `prefers-reduced-motion` turns that motion off, including the boot overlay. The Vite dev server, opened without Electron, fills the ring with sample tiles (ChatGPT, Claude, Cursor, Grok, Copilot, Perplexity, Ollama, LM Studio, plus the built-ins) so the HUD can be viewed in a browser.

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

Keyboard focus, the filter, and the footer are covered in [UI](#ui). A failed launch stays in the footer as `LAUNCH FAILED` plus the reason until the next key, click, refresh, or hide.

A click launches the app immediately. Jarvis stays full screen behind it and is not always on top, so the centered window can sit in front. Esc and the hotkey still hide it. On Windows one PowerShell helper starts with Jarvis and stays up for the life of the app. It is compiled once. Commands go in on stdin and JSON comes back on stdout, and the helper waits on stdin while it has nothing to do. It exits when that pipe closes, including a crash, Ctrl+C, or Task Manager ending Jarvis, and it also exits if Jarvis's process is gone. Quitting asks it to exit and kills the process tree only if it is still running. The click does not wait for the helper to start. If a fresh window list is not ready, which is only in the moment right after Jarvis itself starts, the click waits at most about 300ms, launches the app, and then hides Jarvis without trying to center. Once the helper is ready, the list taken at the click is the before list: windows already open at that moment.

A window from the before list is moved only when it is the foreground window and its executable or Store app id matches the tile. Waiting longer does not make an old background window eligible. File Explorer is the exception: only a new Explorer window is moved, never one that was already open. A window that appears after the click is moved when its executable matches. A different executable is accepted only when the tile has nothing to match, or the tile is a stub launcher: a Store app opened with `shell:AppsFolder`, an unresolved `.lnk`, or an Update.exe-style launcher. A resolved `.lnk` uses the target executable, so an updater dialog for that app is left alone. A packaged app whose window is hosted by ApplicationFrameHost does not carry the app id on that window, so it is matched as a new window instead of by AUMID. Owned popups are skipped. The helper sets per-monitor DPI awareness, then restores, resizes, and brings the chosen window forward (`ShowWindow`, `SetWindowPos`, `SetForegroundWindow`). The desktop and the taskbar are refused. Nothing is written to the registry, and `explorer.exe` is not restarted or set as a shell. Jarvis hides only when no matching window turns up or the move fails. A click before the helper is ready hides as soon as the app has been launched, without waiting out the watch. A window that was placed stays in front of the full-screen launcher. `"launchWindow": { "mode": "default" }` leaves the app's own size and leaves Jarvis up.

The tray menu is Show, Hide, Refresh, and Quit. The footer REFRESH control runs that same reload. A second click does nothing while a reload is already running, and the control reads REFRESHING until it finishes. The first scan, and any later scan that is not a button click, shows SCANNING in the footer until the list is ready. A reload that throws shows REFRESH FAILED and leaves the previous list in place. Opening the window uses the list already in memory. Saving `config.json` re-reads it too.

`npm test` runs the unit tests. `npm run typecheck` typechecks the main process and the renderer.

## Voice

Jarvis can listen for "hey jarvis" and answer out loud. While voice is on, the microphone stays open and the wake word is detected on this PC, including when the window is hidden. That always-on audio is not uploaded. After the wake word, one utterance is sent to xAI for speech-to-text. The chat request also sends the tile labels and the last 8 messages and replies. The spoken reply is synthesized by xAI from the reply text. The API key stays in the Electron main process. It is never written into the window, the renderer bundle, or the log.

Set the key for your Windows user, then open a new terminal so the app can see it:

```powershell
setx XAI_API_KEY "your-key-here"
```

`setx` does not put the key in this repo. Do not paste it into `config.json`. `voice.apiKeyEnv` can name `XAI_API_KEY` or another variable that starts with `XAI_`. Anything else is ignored. The value is still read from the environment.

With a key present, voice starts on. The footer reads `VOICE ON`. Click it to save `voice.enabled` as `false` (`VOICE OFF`) or `true`. With no key, the footer reads `VOICE: NO KEY` and the app keeps running. A failure stays in the footer as `VOICE FAILED` plus a short reason, the same way a bad launch stays as `LAUNCH FAILED`. The reason never includes the key.

Say "hey jarvis". The window shows if it was hidden, and the reactor marks listening. Then:

- `open <name>` matches a tile label, including a fuzzy name, and launches it through the same path as a click, including the centered window on Windows
- `hide` hides the window
- `refresh` reloads the tile list
- `stop` or `cancel` ends the turn without calling Grok. Saying "hey jarvis" or "stop" while a reply is still being written cuts that request off. Saying "hey jarvis" again while a reply is playing listens again
- anything else is a short chat with Grok, and Jarvis speaks the answer

What was heard and the reply sit in a panel centered under the ring, above the footer. A long reply scrolls inside that panel. Grok may also ask to open a tile. Only a tile id that is on screen is accepted.

Optional `voice` fields in `config.json`:

```json
"voice": {
  "apiKeyEnv": "XAI_API_KEY",
  "model": "grok-4.7",
  "voiceId": "eve",
  "sttModel": "grok-voice-transcribe-2.0"
}
```

`model` is the chat model for `POST /v1/chat/completions`. `voiceId` is a built-in text-to-speech voice such as `eve`, `ara`, `leo`, `rex`, or `sal`. `sttModel` is the speech-to-text model. Leave `enabled` out to turn voice on when a key is present.

The microphone permission is granted only for this app's own window, and only for `media`. The wake-word files under `assets/wake` are openWakeWord pre-trained models (CC BY-NC-SA 4.0, David Scripka). The openWakeWord code is Apache-2.0. The models are not, and they stay on the machine. See `assets/wake/NOTICE`.

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
  "launchWindow": { "mode": "centered", "widthPct": 70, "heightPct": 70 },
  "pinnedFolders": [
    { "id": "projects", "label": "Projects", "path": "C:\\Users\\Mario\\Projects" }
  ],
  "extraTiles": [
    { "id": "notes", "label": "Notes", "path": "D:\\Notes\\todo.txt", "kind": "app" }
  ],
  "disabled": ["copilot"],
  "order": ["cursor", "claude", "edge", "explorer"],
  "labels": { "cursor": "Cursor IDE" },
  "voice": {
    "apiKeyEnv": "XAI_API_KEY",
    "model": "grok-4.7",
    "voiceId": "eve",
    "sttModel": "grok-voice-transcribe-2.0"
  }
}
```

- `pinnedFolders` adds folder tiles. `kind` is not used; they always open the path.
- `extraTiles` adds a tile that opens a file, shortcut, or folder. `kind` is `"app"` or `"folder"` and only affects the label on the tile.
- `disabled` removes a tile. Built-in ids: `edge`, `explorer`, `desktop`, `documents`, `downloads`, `pictures`. Discovered ids: `chatgpt`, `claude`, `cursor`, `grok`, `copilot`, `perplexity`, `ollama`, `lm-studio`.
- `order` pulls those ids to the front. Anything you leave out stays in the default order after them.
- `labels` renames a tile. A custom id cannot reuse a built-in or discovered id.
- An id is 1 to 64 characters. It starts with a letter or digit. The rest can be letters, digits, `.`, `_`, or `-`.
- A path is absolute (`C:\...`, `\\server\share`, or `/...`).
- A label is 1 to 80 characters after trimming.
- `hotkey` is an Electron accelerator with at least one modifier. Shift cannot be the only modifier.
- `launchWindow.mode` is `"centered"` (the default) or `"default"`. `centered` is the Windows placement above. `default` does not resize the app. `widthPct` and `heightPct` are percents of the work area, from 10 to 100. The default is 70 and 70. Other platforms ignore this and still leave Jarvis up.

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

A tile shows the file icon at 32px inside a thin cyan ring when the platform can read one. A Store app uses the placeholder. `Get-StartApps` does not return a logo path, and the launcher does not open the package folder. Microsoft Edge uses that same placeholder when `msedge.exe` is not in the usual install folders.

## Windows smoke test

Check both `JarvisLauncher-Setup.exe` and `JarvisLauncher-portable.exe` where it applies:

- ChatGPT or Copilot is listed when it is installed, and a click opens it
- File Explorer opens
- Microsoft Edge opens
- Desktop, Documents, Downloads, and Pictures open those folders
- Ctrl+Alt+J shows and hides the window
- Autostart works for the NSIS install and the portable exe (`openAtLogin`, or a shortcut in the Startup folder)
- REFRESH reloads the list. The footer reads SCANNING during the first scan, and REFRESH FAILED if a reload throws
- Arrow keys move around the ring, PageUp and PageDown change pages when the tiles do not fit, Enter launches the focused segment, Esc clears a filter and then hides, and typing highlights matching segments and dims the rest
- A click leaves Jarvis up and opens the app in a centered window about 70% of the work area on that display. The window list is taken at the click from the helper that stays running for the life of Jarvis. An app that is already open is restored only when its window is in front. File Explorer moves only a new Explorer window. Jarvis stays full screen behind a placed window, and hides only if that window cannot be found or the move fails. A click in the moment after Jarvis starts, before the helper has compiled, launches the app and hides Jarvis without centering. `"launchWindow": { "mode": "default" }` leaves the app's own size and leaves Jarvis up

## Windows smoke test for voice

On a machine with a microphone and `XAI_API_KEY` set in the environment the app actually runs in:

- The footer reads `VOICE ON`. With the variable removed and the app restarted, it reads `VOICE: NO KEY` and Jarvis does not crash
- Hide the window, say "hey jarvis", and the HUD comes back. The reactor shows listening, then thinking, then speaking. The subtitle shows what you said and the reply
- "open edge" opens Microsoft Edge in the centered window, and Jarvis says it is opening
- "hide" hides the window. "refresh" reloads the tiles. "stop" or "cancel", said after the wake word instead of a question, ends the turn. Saying "hey jarvis" again while a reply is playing cuts it off and listens again
- A question that is not a command gets a spoken answer
- `VOICE OFF` stops the microphone and survives a restart. `VOICE ON` starts it again
- A rejected key shows `VOICE FAILED` in the footer and the key itself is not on screen

The Linux and Windows CI jobs do not have a microphone, so they do not run this list. They do run the unit tests, typecheck, and the production build.

## Tests

```powershell
npm test
```

Matching, config validation, shortcut scanning, registry parsing, Start menu app parsing, launch plans, the refresh gate, footer hints, ring layout, ring navigation, and window placement are covered. Voice tests cover the command parser, fuzzy tile matching, the voice block in config, the listen/think/speak state machine, and the xAI client with a mocked `fetch`. Those tests check that the API key is not written into an error or a log line. Launch tests mock `openPath`, `openExternal`, and `spawn`. The placement tests mock the window list, so they do not need Windows. The Windows CI job also starts the helper, reads a real window list, moves a window that the test created, and checks that closing stdin exits the helper. The wake-word model is not asserted in CI. A real microphone is not available there.
