<div align="center">
  <img width="64" height="64" src="logo-icon.svg" alt="Rail logo">
  <h1>Rail</h1>
  <p>A sidebar-first desktop browser built on Chromium.</p>
  <p><a href="https://railbrowser.app">railbrowser.app</a> · <a href="https://railbrowser.app/download">Download for Windows</a> · <a href="https://github.com/Frenvius/rail-browser/releases/latest">Download for macOS</a></p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-11-0078D4" alt="Windows 11">
  <img src="https://img.shields.io/badge/macOS-Apple%20silicon-000000" alt="macOS on Apple silicon">
  <img src="https://img.shields.io/badge/Linux-later-lightgrey" alt="Linux later">
  <img src="https://img.shields.io/badge/Chromium-155-4285F4" alt="Chromium 155">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-BSD--3--Clause-green" alt="BSD-3-Clause"></a>
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="Rail on Windows 11: favorites, pinned rows and tabs in the sidebar, the page filling the rest of the window">
</p>

> [!NOTE]
> Rail is early. Every release ships for Windows 11 and for macOS on Apple
> silicon; Linux comes later. The macOS build is ad hoc signed and not
> notarized, so Gatekeeper asks for confirmation on first launch: see
> `INSTALL-macOS.txt` on the release page.

Yet another Arc-like browser. At least this one started on Windows.

## What Rail is

A browser built around the vertical tabs experience: tabs, spaces and
navigation live in the sidebar, so the page gets as much of the window as
possible.

The engine is a full Chromium checkout with the ungoogled-chromium patch set.
The product chrome is a privileged WebUI rendered by Chromium itself. Why
WebUI? Because in Chromium, WebUI is native: it is what `chrome://settings`
and `chrome://history` are built with, and Chromium now ships an experimental
browser shell on it, which Rail extends. Tabs, rendering, input, IME,
accessibility, extensions, and process management stay on Chromium's native
paths. It is not Electron, CEF, or a WebView wrapper.

```text
Native Views window (Win32 / Cocoa)
└── WebUIBrowserWindow
    ├── chrome://webui-browser/     privileged product shell (the rail)
    └── content region
        └── real WebContents        renderer, GPU, input, AX, IME
```

## Highlights

| Feature | Description |
|---|---|
| **Spaces** | Separate contexts with their own color, icon and tabs. Switch with a shortcut, reorder by drag. |
| **Profile per space** | A space can run on its own Chromium profile: cookies, logins and extensions stay apart. |
| **Favorites and pinned rows** | Favorites sit on top and span every space; pinned rows belong to one space and reopen at their home URL. |
| **Folders and tab groups** | Collapsible folders inside a space, plus tab groups mirrored from Chromium's own. |
| **Tab trails** | Tabs opened from a link nest under their opener, with a way back to it. |
| **Sleep and archive** | Idle tabs sleep to free memory, stale ones move to a restorable archive instead of vanishing. |
| **Command bar** | `Ctrl+T`, `Ctrl+L` or `Ctrl+K`: one input for URLs, search, open tabs, history and browser commands. |
| **Library** | Downloads, spaces and archived tabs in one place. |
| **Site-colored top bar** | The thin bar above the page takes the page's own color. |
| **Site panel** | Permissions, extensions and the link for the current site, behind the address. |
| **Mini window** | Links opened from other apps land in a small window first and become a tab only if you want. |
| **Content blocking** | uBlock Origin ships preinstalled. |
| **Windows native** | Mica and acrylic backdrops, system-style window controls. |
| **macOS native** | Command-key shortcuts, the macOS app menu, Keychain-backed import and the system share sheet. |

## Browser automation

Open **Settings → General → Browser Automation** and turn on **Allow local agents
to connect**. Rail remembers the choice and asks you to approve each incoming
connection. Turn on **Approve connections automatically** to skip that prompt,
for agents driven while you are away from the computer; any local program can
then control the browser without asking. To connect the Chrome DevTools MCP
server to the running Rail instance, configure your MCP client on the same
computer:

```json
{
  "mcpServers": {
    "rail": {
      "command": "bunx",
      "args": [
        "chrome-devtools-mcp@1.12.0",
        "--autoConnect",
        "--user-data-dir=PATH_TO_RAIL_USER_DATA"
      ]
    }
  }
}
```

Find the user data directory in `chrome://version`: it is the parent of the
listed Profile Path. For a local Dev build it is `build/profile`. A connection
can inspect tabs from every Rail profile in the same browser instance. Turn
browser automation off in Rail Settings when done.
If Rail was started with remote debugging flags, those launch options control
the port independently of this setting.
Selecting a page with `bringToFront` also brings its Rail Space and profile
into view. New pages open in the active Space and profile.

The stock server lists pages but knows nothing about Spaces. `tools/rail-mcp`
in this repository is the same server with Spaces added: `list_spaces`,
`select_space` to switch the window to a Space, a `space` label and filter on
`list_pages`, and a `space` argument on `new_page` that opens the tab with
that Space's cookies and logins. Every other tool and flag is unchanged. Run `bun install` in `tools/rail-mcp` once, then point the
MCP client at it:

```json
{
  "mcpServers": {
    "rail": {
      "command": "bun",
      "args": [
        "run",
        "PATH_TO_RAIL_CHECKOUT/tools/rail-mcp/src/main.ts",
        "--autoConnect",
        "--user-data-dir=PATH_TO_RAIL_USER_DATA"
      ]
    }
  }
}
```

Sleeping tabs are not loaded, so they are not listed as pages until you open
them in the browser.

## Privacy

Rail inherits ungoogled-chromium, which strips Google's background services
from the engine: no browser sign-in or sync, no usage and crash reports, no
field-trial header on requests, and no Safe Browsing lookups.

A few things are turned back on because a daily browser needs them, and each
is visible and yours to change:

- Google is available in the search engine list, and search suggestions are on,
  so what you type in the command bar goes to the search engine you picked.
- Extensions install from the Chrome Web Store.
- uBlock Origin ships preinstalled and blocks ads and trackers from the first
  launch.
- Tidy, which groups tabs with an AI model, is bring-your-own-key (BYOK): it
  stays off until you add your own OpenRouter API key, which is stored
  encrypted in your profile, and only then sends tab titles and site domains to
  the model you choose.

## Quick start

Windows 11 with Visual Studio's C++ toolchain.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe .\build.py --prepare-only --7z-path "C:\Program Files\7-Zip\7z.exe"
.\.venv\Scripts\python.exe .\build.py --dev --reuse --target chrome -j 20
.\scripts\run.ps1 -FreshProfile
```

The first build takes hours. Later builds are incremental.

On macOS (Apple silicon, Xcode and the macOS 15.4 SDK), from a prepared tree:

```sh
.venv/bin/python platform/macos/build.py -j 6
```

`docs/BUILDING.md` covers both hosts.

## Layout

```text
build.py                      build driver, resolves platform/<host>
src/                          Rail's own WebUI and native files
patches/                      Rail's own patches, applied on every platform
  series                        order of the product layer
platform/windows/             everything that only matters on Windows
  patches/ungoogled/            Windows patches from upstream
  patches/toolchain/            local toolchain fixes
  flags.dev.gn                  GN config for local iteration
  flags.release.gn              GN config for distribution builds
  downloads.ini, revision.txt   pinned Chromium version
  pruning.list, domain_substitution.list
  clone.py, package.py
platform/macos/               everything that only matters on macOS
  build.py                      build driver for the Apple silicon host
  flags.gn, flags.release.gn    GN config for development and release
  package.py                    ad hoc signed DMG, macOS update feed, checksums
scripts/run.ps1               launch the local build
ungoogled-chromium/           submodule: core ungoogled patch set
build/                        untracked: Chromium checkout and build output
```

Patches apply in three layers: the ungoogled submodule set, then
`platform/<host>/patches`, then `patches/`. macOS was added as
`platform/macos/` without moving anything; Linux will follow the same way.

The path `build/src` is frozen. Relocating the project directory invalidates the
entire build cache and costs a full rebuild.

## Attribution and license

Rail's build system is derived from `ungoogled-chromium-windows` and depends on
`ungoogled-chromium`. See `NOTICE.md`. Licensed under the terms in `LICENSE`.
uBlock Origin is distributed under GPLv3; see `THIRD_PARTY.md`.
