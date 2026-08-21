# Rail Browser

A sidebar-first desktop browser built on Chromium.

If you are looking for an Arc alternative, that is the gap Rail is built for.

The engine is a full Chromium checkout with the ungoogled-chromium patch set.
The product chrome is a privileged WebUI rendered by Chromium itself, so tabs,
rendering, input, IME, accessibility, extensions, and process management stay on
Chromium's native paths.


```text
Native Views/Win32 window
└── WebUIBrowserWindow
    ├── chrome://webui-browser/     privileged product shell (the rail)
    └── content region
        └── real WebContents        renderer, GPU, input, AX, IME
```

Status: early. Windows first, other platforms after. The architecture is proven
and the shell builds and runs; the product feature set is being structured.

## Quick start

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe .\build.py --prepare-only --7z-path "C:\Program Files\7-Zip\7z.exe"
.\.venv\Scripts\python.exe .\build.py --dev --reuse --target chrome -j 20
.\scripts\run.ps1 -FreshProfile
```

The first build takes hours. Later builds are incremental.

## Layout

```text
build.py                      build driver, resolves platform/<host>
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
scripts/run.ps1               launch the local build
ungoogled-chromium/           submodule: core ungoogled patch set
build/                        untracked: Chromium checkout and build output
```

Patches apply in three layers: the ungoogled submodule set, then
`platform/<host>/patches`, then `patches/`. A second platform adds a
`platform/<name>/` directory and nothing else moves.

The path `build/src` is frozen. Relocating the project directory invalidates the
entire build cache and costs a full rebuild.

## Attribution and license

Rail's build system is derived from `ungoogled-chromium-windows` and depends on
`ungoogled-chromium`. See `NOTICE.md`. Licensed under the terms in `LICENSE`.
