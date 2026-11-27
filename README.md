# Jarvis Launcher

A full-screen JARVIS-style launcher for Windows. It is an Electron window, not a shell replacement. It does not change Explorer, `explorer.exe`, logon shell keys, or any other system setting.

Click a tile to open that app or folder. The launcher only reads Start Menu shortcuts, the uninstall program list, and the Start menu app list. It never deletes, moves, or edits your files. The only file it writes is its own `config.json`.

## UI

The HUD is the MARIO OS design from Figma (`MARIO OS UI`, frame `4:2`). It is drawn on a fixed 1192 x 670 canvas and scaled to fill the screen, so every panel sits where it does in the design. The scale is the same on both axes, so circles stay round. On a screen that is not 16:9 (a 3:2 laptop, a 5:4 monitor, an ultrawide) there are no black bars: the header stays on the top edge, the bottom row on the bottom edge, and the panels between spread out to share the extra room. Panels keep their size, and only the gaps between them grow. Text in the slots is copied from the design as it is written there, including spellings such as `Copiiolt`, `Gemmi`, `V3 Code`, `Mircosoft Doc`, and `Spoftiy`.

Named slots open real apps:

| Slot | Opens |
| --- | --- |
| Claude, Copiiolt, Grok | The discovered Claude, Copilot, and Grok apps |
| Gemmi | Gemini when it is installed, otherwise `https://gemini.google.com/` |
| V3 Code, Mircosoft Doc | Visual Studio Code and Word, when installed |
| Microsoft Edge, File Explorer | The built-in tiles |
| Spoftiy, Outlook | Spotify and Outlook, when installed |
| GitHub | GitHub Desktop when it is installed, otherwise `https://github.com/` |
| x | `https://x.com/` |

A slot whose app is not installed is still drawn. Clicking it shows `LAUNCH FAILED  <app> not found` in the status bar at the bottom left. Every other tile (ChatGPT, Cursor, Perplexity, Ollama, LM Studio, Desktop, Documents, Downloads, Pictures, pinned folders, and extra tiles) goes on the reactor plates that are blank in the design, eight per page. The labelled plates (`TEN OPF`, `CCRP`, and so on) and the small labels around the reactor are decoration, as in the design.

The readings are live:

| Design element | Shows |
| --- | --- |
| Big clock, date line, day block, analog clock | The local time and date |
| Reactor centre number and the large gauge | CPU load in percent |
| Small gauge | System drive use in percent |
| `wifi: 88%` ring, SSID line, and `WAN` | Wi-Fi signal and network name, from `netsh wlan show interfaces` |
| Rates on either side of `WAN` | Download and upload rate, from `netstat -e` |
| `100%` and `AC LINE` | Battery level and charging state (a desktop reads 100% on AC) |
| Percentage under `100%` | System drive use |
| Tall meter by the rail | Battery charge when running on battery, CPU load otherwise |
| `Used:` / `Free:` by RAM | Memory in use and free |
| `Empty` by BIN | Recycle Bin item count and size |
| `0d 0h 55m UP` | Time since Windows started |
| Weather panel | Open-Meteo forecast for the `weather` location in `config.json` |

Anything the PC cannot report shows `--`. The weather panel reads `--` until a location is set.

### Icons

The top programs and the left list use a HUD icon set: a glowing chamfered frame with a neon glyph for each kind of app, not each brand. So any app gets a matching icon with no new artwork: Chrome and Firefox get the same browser glyph as Edge, Discord gets chat, Steam gets game. The kinds are `browser`, `files`, `music`, `mail`, `repo`, `social`, `chat`, `ai-spark`, `ai-chat`, `ai-orbit`, `ai-neural`, `code`, `document`, `spreadsheet`, `slides`, `notes`, `pdf`, `design`, `video`, `call`, `game`, `terminal`, `settings`, `store`, `photos`, `camera`, `calendar`, `calculator`, `cloud`, `maps`, `security`, and `app` for anything unknown.

Pick a different icon for a tile by its id or label, or go back to each app's own icon:

```json
{
  "icons": { "chrome": "browser", "claude": "ai-orbit" },
  "iconStyle": "app"
}
```

### System controls

| Design element | Does |
| --- | --- |
| `OPRNLAIS` | Sleep |
| `NETUAT` | Restart |
| `REFUET` | Shut down |
| `NRSAAET` | Sign out |
| `LCOOST` | Lock |
| Thin slider after `LCOOST` | Screen brightness. Drag it, scroll on it, or focus it and press Up/Down. Laptops and some all-in-ones support this; most desktop monitors do not, and there the slider is disabled. |
| `(−)` `(+)` knobs by the identity panel | Volume down and up by 5 |
| Track bar, `0:00`, and the three buttons, bottom right | The track Windows is playing (Spotify, a browser tab, and so on): title and artist above the bar, time, click the bar to seek, previous, play/pause, next |
| Second bar under the track bar | Volume. Drag it, click it, scroll on it, or focus it and press Left/Right. |
| Big dial, bottom right | Shows the volume. Click to mute or unmute. |
| Small dial with the red ring | Lights red when the microphone is muted. Click to mute or unmute it. |
| `RAM` | Opens Task Manager |
| `BIN` | Opens the Recycle Bin. Right-click it to empty the bin: the first right-click turns it amber and asks, a second right-click within 5 seconds empties it. |
| Check and cross box | The check clears the status message. The cross hides Jarvis. |
| Gear in the dock, or the badge in the identity panel | Opens Settings |
| Emblem (the glowing circle, top left) | Push to talk: starts listening without "hey Jarvis". Click again while it listens to cancel. It glows while listening and pulses while thinking or speaking. It needs a key and voice turned on, and works even if the wake word model did not load. |
| Big clock, the date block, or the analog clock | Hides Jarvis, waits half a second for focus to settle, then opens the Windows calendar: the Notification Center on Windows 11, the date flyout (Win+Alt+D) on Windows 10. The message log records which one it opened. |
| Text list left of the reactor | Your 12 most recently opened files (from the Windows Recent folder), six above and six below the cyan `RECENT FILES` line. Click one to open it. Settings can switch it back to the design's text. |
| Status bar, bottom left | Shows short confirmations (`MUTED`, `VOLUME 45%`, `RECYCLE BIN EMPTIED`, `SETTINGS SAVED`) and failures. Click it to see this session's messages and any `config.json` warnings. With warnings and nothing else to say, it reads `2 CONFIG WARNINGS`. |
| `G` dial at the top of the reactor | Opens Google by default |
| `E` dial at the right of the reactor | Opens File Explorer by default |
| Google pill | A search box. Click it or press `/`, type, and press Enter to search Google in your default browser. Esc clears it. |

Restart, Shut down, and Sign out take two clicks: the first turns the button amber and the status bar reads, for example, `SHUT DOWN?  CLICK AGAIN TO CONFIRM`. A second click within 5 seconds runs it. Any key, or 5 seconds, cancels it. Sleep and Lock run on the first click. The HUD hides before any power action runs.

If the filter matches no tile, Enter searches Google for the filter text.

### Settings

Settings opens over the reactor from the dock's gear or the badge in the identity panel. It edits the hotkey (click the box and press the new combination), starting with Windows, starting hidden, the weather location (type a city and press FIND, then pick it), the four dock icons, and the twelve labelled reactor plates. Save checks the values with the same rules `config.json` uses and writes only those keys; tiles, folders, voice, labels, and anything else in the file stay as they are. Jarvis reloads at once. Esc or CANCEL closes it without saving. OPEN CONFIG.JSON opens the file for everything else.

The city search asks `geocoding-api.open-meteo.com` for the name you typed, only when you press FIND. USE MY LOCATION asks `ipapi.co` for the approximate city of your internet address, only when you press it, and fills the fields for you to check and save. A `config.json` with a syntax error is never overwritten; Save says so instead.

The media, volume, mic, brightness, and sleep controls go through one Windows PowerShell process that starts on the first reading and stays open while Jarvis runs. It uses the Windows Core Audio API for volume and mute, `WmiMonitorBrightnessMethods` for brightness, and the Windows media session (the same one the volume flyout shows) for the track. With no media session, the transport buttons send the media keys instead. Shut down, Restart, and Sign out run `shutdown.exe`, and Lock runs `rundll32.exe user32.dll,LockWorkStation`. A failed control shows `SYSTEM FAILED` and a reason in the status bar.

The four buttons in the tray at the bottom are Refresh, Hide, Quit, and Voice (blue when voice is on). The up and down arrows on the rail change the reactor page, as do PageUp and PageDown.

Keyboard: focus starts on Microsoft Edge. Left and Right move within the top tabs, the left column, or the reactor plates, and wrap. Up and Down move through the left column, then on to the next group. Enter launches the focused slot. Typing filters by the design text or the real app name: matches stay bright, the rest dim, and the status bar shows `FILTER  <text>` or `NO MATCH`. Esc clears the filter, then hides the window. Launch and voice failures show in the status bar in amber until the next key, click, refresh, or hide.

The reactor's slanted ring turns slowly. While voice is listening the tick ring pulses, while thinking the slanted ring spins faster, and while speaking the blue ring pulses. What was heard and the reply show inside the reactor below the centre. `prefers-reduced-motion` turns all of that motion off. The fonts (Roboto Condensed, Archivo Black, Oswald, Exo 2, Share Tech, all under the SIL Open Font License) are bundled, so the HUD looks the same on every PC. The Microsoft, Alienware, and app logos in the design are replaced with plain shapes or the app's own installed icon.

The Vite dev server, opened without Electron, fills the HUD with sample tiles and sample readings so the layout can be checked against the design.

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

Keyboard focus, the filter, and the status bar are covered in [UI](#ui). A failed launch stays in the status bar as `LAUNCH FAILED` plus the reason until the next key, click, refresh, or hide.

A click launches the app immediately. Jarvis stays full screen behind it and is not always on top, so the centered window can sit in front. Esc and the hotkey still hide it. On Windows one PowerShell helper starts with Jarvis and stays up for the life of the app. It is compiled once. Commands go in on stdin and JSON comes back on stdout, and the helper waits on stdin while it has nothing to do. It exits when that pipe closes, including a crash, Ctrl+C, or Task Manager ending Jarvis, and it also exits if Jarvis's process is gone. Quitting asks it to exit and kills the process tree only if it is still running. The click does not wait for the helper to start. If a fresh window list is not ready, which is only in the moment right after Jarvis itself starts, the click waits at most about 300ms, launches the app, and then hides Jarvis without trying to center. Once the helper is ready, the list taken at the click is the before list: windows already open at that moment.

A window from the before list is moved only when it is the foreground window and its executable or Store app id matches the tile. Waiting longer does not make an old background window eligible. File Explorer is the exception: only a new Explorer window is moved, never one that was already open. A window that appears after the click is moved when its executable matches. A different executable is accepted only when the tile has nothing to match, or the tile is a stub launcher: a Store app opened with `shell:AppsFolder`, an unresolved `.lnk`, or an Update.exe-style launcher. A resolved `.lnk` uses the target executable, so an updater dialog for that app is left alone. A packaged app whose window is hosted by ApplicationFrameHost does not carry the app id on that window, so it is matched as a new window instead of by AUMID. Owned popups are skipped. The helper sets per-monitor DPI awareness, then restores, resizes, and brings the chosen window forward (`ShowWindow`, `SetWindowPos`, `SetForegroundWindow`). The desktop and the taskbar are refused. Nothing is written to the registry, and `explorer.exe` is not restarted or set as a shell. Jarvis hides only when no matching window turns up or the move fails. A click before the helper is ready hides as soon as the app has been launched, without waiting out the watch. A window that was placed stays in front of the full-screen launcher. `"launchWindow": { "mode": "default" }` leaves the app's own size and leaves Jarvis up.

The tray menu is Show, Hide, Refresh, and Quit. The Refresh button in the bottom tray runs that same reload. A second click does nothing while a reload is already running, and the status bar reads REFRESHING until it finishes. The first scan, and any later scan that is not a button click, shows SCANNING in the status bar until the list is ready. A reload that throws shows REFRESH FAILED and leaves the previous list in place. Opening the window uses the list already in memory. Saving `config.json` re-reads it too.

`npm test` runs the unit tests. `npm run typecheck` typechecks the main process and the renderer.

## Voice

Jarvis can listen for "hey jarvis" and answer out loud. While voice is on, the microphone stays open and the wake word is detected on this PC, including when the window is hidden. That always-on audio is not uploaded. After the wake word, one utterance is sent to [Groq](https://console.groq.com) for speech-to-text (Whisper). The chat request also sends the tile labels and the last 8 messages and replies. The spoken reply is made on this PC by the voice built into Windows, so speaking costs nothing and nothing is uploaded for it. Groq's free plan needs no card. It is rate limited, which is far more than a personal launcher uses. The API key stays in the Electron main process. It is never written into the window, the renderer bundle, or the log.

Create a free key at [console.groq.com/keys](https://console.groq.com/keys). Set it for your Windows user, then open a new terminal so the app can see it:

```powershell
setx GROQ_API_KEY "your-key-here"
```

`setx` does not put the key in this repo. Do not paste it into `config.json`. `voice.apiKeyEnv` can name `GROQ_API_KEY` or another variable that starts with `GROQ_`. Anything else is ignored. The value is still read from the environment.

With a key present, voice starts on and the Voice button in the bottom tray is blue. Click it to save `voice.enabled` as `false` (grey) or `true`. With no key, the button stays grey, its tooltip reads `Voice: no key`, and the app keeps running. A failure stays in the status bar as `VOICE FAILED` plus a short reason, the same way a bad launch stays as `LAUNCH FAILED`. The reason never includes the key.

Say "hey jarvis". The window shows if it was hidden, and the reactor marks listening. Then:

- `open <name>` matches a tile label, including a fuzzy name, and launches it through the same path as a click, including the centered window on Windows
- `hide` hides the window
- `refresh` reloads the tile list
- `stop` or `cancel`, said in the utterance after the wake word, ends the turn without calling Groq. Saying "hey jarvis" again, including while a reply is still being written or played, is heard on this PC and starts a new listen. That second phrase is not uploaded by itself
- anything else goes to the Groq model (`openai/gpt-oss-120b` by default), and Jarvis speaks the answer. It remembers the last ten exchanges, so follow-up questions work. It can also:
  - look things up on the web with Groq's built-in browser search, for news, weather, scores, and prices
  - change the volume, mute the speakers or the mic, play, pause, or skip media, and set the brightness. Sleep, restart, shut down, sign out, and emptying the Recycle Bin are never offered to the voice, so a misheard word cannot lose work

Web searches use more of Groq's free per-minute token limit. If it runs out, the status bar says `Groq is busy, try again in a minute`.

### The jarvis terminal command

With the MARIO OS terminal pack installed, type requests to the running Jarvis from any PowerShell window:

```powershell
jarvis what's the weather tomorrow
jarvis open figma
jarvis -speak write a hello world python file
```

The reply is printed; `-speak` also says it out loud. Typed requests go through the same commands, chat, web search, and PC tasks as speech, and the HUD shows them. Jarvis listens on a named pipe for your Windows account only, and each start writes a fresh random token to `cli.json` next to `config.json`; requests without it are refused.

### Startup greeting

When Jarvis starts, it greets you out loud in the MARIO OS voice: "Good morning, Rio. It's Friday, November 27. It's 38 degrees and cloudy in Indianapolis, with a high of 39. All systems online." The weather part needs a location in `weather`. Set your name and how often it greets in `config.json`:

```json
"greeting": { "mode": "daily", "name": "Rio" }
```

`mode` is `"daily"` (the first start of each day, the default), `"launch"` (every start), or `"off"`. Turning voice off (`"voice": { "enabled": false }`) also turns the greeting off.

### Computer control (Windows)

Jarvis can also work the PC for you. It says its plan out loud and does it in front of you, with each window it opens centered over the HUD:

- "Open VS Code and write a hello world Python file": VS Code opens a new file in `Documents\Jarvis Projects`, the code is typed in live, and the file is saved. That folder has its own `.vscode/settings.json` that turns off auto-closing brackets, auto-indent, and suggestions, so VS Code types exactly what Jarvis sends. Your other folders are not affected. An existing file is never overwritten; a second `hello.py` becomes `hello-2.py`
- "Draft an email to my TA at ta@iu.edu about the lab": Outlook opens a new draft with the recipient and subject, and the message is typed in. Jarvis never sends it; you review it and press Send. Outlook must be the default email app (Settings > Apps > Default apps). If Jarvis does not know the address, it asks
- "Play Blinding Lights on Spotify": Spotify opens on the search results, and you press play
- "Switch to dark mode", "open Bluetooth settings", "set the volume to 30"
- "Hide the taskbar" turns on taskbar auto-hide (the same switch as Settings > Personalization > Taskbar > Taskbar behaviors), and "show the taskbar" turns it off
- "Open Figma", "open Discord": any app in the Start menu opens, Store apps and desktop installs alike
- "Open Microsoft Edge and go to YouTube", "search YouTube for lofi beats", "open iu.edu": the site opens in Microsoft Edge. Jarvis knows YouTube, Google, Bing, Wikipedia, GitHub, Reddit, Amazon, Google Maps, Gmail, Outlook on the web, Canvas, Netflix, Twitch, X, LinkedIn, Stack Overflow, ChatGPT, Claude, and Spotify by name, and can open any other http or https address. Say "in my default browser" to use that instead
- "Open Notepad and write a short poem": any installed app opens, and Jarvis types into it

Safety:

- Jarvis only types into the window it opened for the task. Before every line it checks which window is in front, and stops if anything else is, so a click elsewhere can never send keystrokes to the wrong place
- Saying "hey jarvis" again stops a task between steps and between typed lines
- It cannot send emails or messages, delete files, close apps, or buy anything. Keys are an allow list that leaves out send and close shortcuts (Ctrl+Enter, Alt+S, Alt+F4, Ctrl+W), select-all, and Delete
- A task is limited to 6 rounds with the model and 12 actions

### Deep think (Claude Code)

Big jobs go to Claude Code, a much stronger AI, which works on its own for a few minutes in a project folder while Jarvis stays free. Jarvis hands off by itself when you ask for something big, or whenever you say "deep think":

- "Build me a portfolio website with a dark futuristic theme, an about page, and a projects page"
- "Deep think, design a mobile app screen for a habit tracker in Figma"
- "Make a two-week study plan for my chemistry final"
- "Change the portfolio colors to purple": the same project name continues the earlier work

Each project gets its own folder in `FA26\jarvis-builds` (or `Documents\jarvis-builds` when there is no FA26 folder). While it works, a `DEEP THINK` line under the orb shows the project, the time, and the current step. When it finishes, Jarvis says what was made and opens it: a plan file, the Figma file, or a website in Edge. Websites are served from a small preview server at `http://127.0.0.1:5510` that only this PC can reach, so built React and Vite sites work (browsers block their JavaScript when a page is opened straight from disk). Say "open my portfolio site" later to see a project again. Ask "how is deep think going?" or "cancel deep think" anytime. The `jarvis` terminal command works too: `jarvis deep think build a landing page for my club`.

Set up once:

1. Install Claude Code: in PowerShell, `irm https://claude.ai/install.ps1 | iex`
2. Run `claude` once in a terminal and sign in with your Claude account. Deep think uses your Claude plan
3. For Figma designs, connect Figma to Claude Code: `claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp`, then run `claude`, type `/mcp`, pick figma, and choose Authenticate

What it may do on its own: write files inside its project folder, run `npm`, `npx`, `node`, `python`, and `pip`, use git locally, search the web, and use Figma. It cannot push to GitHub, deploy, publish, or download with `curl` or PowerShell's `Invoke-WebRequest`; anything else that needs permission is skipped and noted in its summary. Each project keeps `.jarvis/last-run.jsonl` (the full log) and `.jarvis/summary.md` (its last reply). A run stops after 45 minutes.

Optional `deep` fields in `config.json`:

```json
"deep": {
  "enabled": true,
  "workspace": "C:\\Users\\you\\FA26\\jarvis-builds",
  "model": "opus",
  "maxMinutes": 45,
  "permissionMode": "acceptEdits",
  "openResult": true
}
```

`model` is any Claude Code model name or alias; leave it out to use your Claude Code default. `permissionMode` `"auto"` lets Claude Code's safety classifier approve more commands where your plan offers auto mode. `command` is the full path to `claude.exe` if it is somewhere unusual.

What was heard and the reply show inside the reactor, below the centre number. The text stays clear of the tiles. The model may also ask to open a tile. Only a tile id that is on screen is accepted.

Optional `voice` fields in `config.json`:

```json
"voice": {
  "apiKeyEnv": "GROQ_API_KEY",
  "model": "openai/gpt-oss-120b",
  "voiceId": "george",
  "sttModel": "whisper-large-v3-turbo"
}
```

Jarvis listens until you pause for about 1.6 seconds (a little longer once you've talked for a few seconds), and a request can be up to a minute long. Tap the emblem while you're talking to send right away. `"pauseMs": 2200` in `voice` makes it wait longer before it decides you're done (700 to 4000).

`model` is a Groq chat model that supports tool calls. `sttModel` is a Groq speech-to-text model, `whisper-large-v3-turbo` or `whisper-large-v3`. `voiceId` is part of the name of a Windows voice, such as `george`, `david`, `mark`, or `zira`. The default, `george`, is a British male voice from the English (United Kingdom) speech pack: in Windows Settings > Time & language > Speech, under Manage voices, click Add voices and pick English (United Kingdom). If the voice is not installed, David speaks. `effect` is `"jarvis"` (the default), which plays replies through an AI-style filter (a clean comms tone, a light metallic sheen, and a faint echo), or `"none"` for the plain voice. Jarvis is told the PC's local date and time with each question, so "what day is it" and "what time is it" are answered correctly. A config from the old xAI setup still loads: Grok model names and the `eve` voice fall back to these defaults. Leave `enabled` out to turn voice on when a key is present.

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
    "apiKeyEnv": "GROQ_API_KEY",
    "model": "openai/gpt-oss-120b",
    "voiceId": "george",
    "sttModel": "whisper-large-v3-turbo"
  },
  "weather": { "latitude": 39.77, "longitude": -86.16, "label": "Indianapolis, IN", "units": "fahrenheit" },
  "dock": ["downloads", "spotify", null, "projects"],
  "plates": { "TEN OPF": "chatgpt", "CCRP": "cursor" }
}
```

- `dock` sets what the four icons under the Google box open, left to right: a tile id or `null` for an empty slot. The default is `["downloads", null, null, null]`. The icons stay as the design draws them; hover shows the tile's name. Clicking an empty slot says so in the status bar. The fifth icon, the gear, opens Settings.
- `plates` puts a tile on one of the twelve reactor plates that carry design text: `TEN OPF`, `EDAE TIEUE`, `BARDA DBCM`, `APL DIT`, `APLE`, `CNHBS`, `CMBS`, `LOPE`, `ASNEX`, `ETTAL`, `SEPA`, `CCRP`. Case and extra spaces do not matter. The plate keeps its design text, becomes clickable and part of arrow-key navigation, and the tile leaves the open plates. A tile that already has a named slot (a top tab or a left button) stays there. Each tile can be on one plate.
- `leftList` is `"recent"` (the default: your recent files) or `"design"` (the design's text).
- `dials` sets what the two small dials on the reactor open: `{ "G": "google", "E": "explorer" }` by default. Use `null` to make a dial do nothing. A tile on a dial stays off the open plates, the same as a labelled plate. Settings has a REACTOR DIALS section for these.
- For both, a tile id is any discovered app, built-in, web fallback, pinned folder, or extra tile id. To put any other program or folder on the HUD, add it to `extraTiles` or `pinnedFolders` and use its `id`. An id with no tile (a typo, or a tile in `disabled`) leaves the slot empty and adds a config warning.
- `weather` is optional. With it set, the launcher asks `api.open-meteo.com` for the forecast every 15 minutes. That request carries only these coordinates and no key. `units` is `"fahrenheit"` (the default) or `"celsius"`. Leave `weather` out and nothing is sent.
- `pinnedFolders` adds folder tiles. `kind` is not used; they always open the path.
- `extraTiles` adds a tile that opens a file, shortcut, or folder. `kind` is `"app"` or `"folder"` and only affects the label on the tile.
- `disabled` removes a tile. Built-in ids: `edge`, `explorer`, `desktop`, `documents`, `downloads`, `pictures`. Discovered ids: `chatgpt`, `claude`, `cursor`, `grok`, `copilot`, `perplexity`, `ollama`, `lm-studio`, `gemini`, `vscode`, `word`, `spotify`, `outlook`, `github`. Web fallback ids: `gemini-web`, `github-web`, `x`, `google`.
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

A match needs a name like ChatGPT, Claude, Cursor, Grok, Copilot, Perplexity, Ollama, LM Studio, Gemini, Visual Studio Code, Word, Spotify, Outlook, or GitHub Desktop. Cursor matches the name `Cursor`, and Copilot matches `Copilot` or `Microsoft Copilot`. A Start Menu shortcut is preferred, then a Store app, then the registry. A registry hit is used only when `DisplayIcon` points at an `.exe`. Shortcuts and registry entries whose name or target looks like an uninstaller are ignored. Uninstall strings are ignored.

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
- Refresh reloads the list. The status bar reads SCANNING during the first scan, and REFRESH FAILED if a reload throws
- Arrow keys move through the top tabs, the left column, and the reactor plates. PageUp, PageDown, and the rail arrows change pages when the plate tiles do not fit. Enter launches the focused tile. Esc clears a filter and then hides. Typing highlights matching tiles and dims the rest
- A click leaves Jarvis up and opens the app in a centered window about 70% of the work area on that display. The window list is taken at the click from the helper that stays running for the life of Jarvis. An app that is already open is restored only when its window is in front. File Explorer moves only a new Explorer window. Jarvis stays full screen behind the app and never hides for a launch. When the new window cannot be told apart, such as a web page that opens as a tab in a browser that was already running, the window that comes to the front is centered instead. The same goes for web searches, recent files, Task Manager, the Recycle Bin, and everything a voice task opens. Only the hide button, Escape, power actions, and the calendar hide Jarvis. `"launchWindow": { "mode": "default" }` leaves the app's own size and leaves Jarvis up

## Windows smoke test for voice

On a machine with a microphone and `GROQ_API_KEY` set in the environment the app actually runs in:

- The Voice button is blue. With the variable removed and the app restarted, it is grey with the tooltip `Voice: no key`, and Jarvis does not crash
- Hide the window, say "hey jarvis", and the HUD comes back. The reactor shows listening, then thinking, then speaking. The subtitle shows what you said and the reply
- "open edge" opens Microsoft Edge in the centered window, and Jarvis says it is opening
- "hide" hides the window. "refresh" reloads the tiles. "stop" or "cancel", said after the wake word instead of a question, ends the turn. Saying "hey jarvis" again, including while a reply is still being written or played, is heard on this PC and starts a new listen. That second phrase is not uploaded by itself
- A question that is not a command gets a spoken answer
- Volume: the `(−)` `(+)` knobs, dragging the volume bar, and the big dial (mute) all change what the Windows volume flyout shows, and the HUD follows when the volume is changed from the keyboard
- Media: with Spotify or a YouTube tab playing, the title, artist, and time show, play/pause, next, previous, and seeking work. With nothing playing, the buttons still send the media keys
- Mic dial turns red when the microphone is muted from Windows sound settings, and clicking it toggles that same setting
- Brightness slider changes the screen on a laptop and is disabled on a desktop monitor
- Lock locks at once. Sleep sleeps at once. Restart, Shut down, and Sign out need the second click, and waiting 5 seconds cancels them
- `/` focuses the Google box, Enter opens the search in the default browser and hides the HUD, and Esc in the box clears it without hiding the HUD
- Turning the Voice button off stops the microphone and survives a restart. Turning it on starts it again
- A rejected key shows `VOICE FAILED` in the status bar and the key itself is not on screen

The Linux and Windows CI jobs do not have a microphone, so they do not run this list. They do run the unit tests, typecheck, and the production build.

## Tests

```powershell
npm test
```

Matching, config validation, shortcut scanning, registry parsing, Start menu app parsing, launch plans, the refresh gate, status hints, the MARIO OS slot layout, keyboard navigation, the system-stat parsers, the Open-Meteo mapping, and window placement are covered. A browser test renders the built HUD at four screen sizes and checks that the canvas fits and no slot label is clipped. Voice tests cover the command parser, fuzzy tile matching, the voice block in config, the listen/think/speak state machine, the Groq client with a mocked `fetch`, and the Windows speech helper's request and reply lines. Those tests check that the API key is not written into an error or a log line. Launch tests mock `openPath`, `openExternal`, and `spawn`. The placement tests mock the window list, so they do not need Windows. The Windows CI job also starts the helper, reads a real window list, moves a window that the test created, and checks that closing stdin exits the helper. The wake-word model is not asserted in CI. A real microphone is not available there.
