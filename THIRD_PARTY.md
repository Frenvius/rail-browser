# Third-party software redistributed by Rail

Rail ships one third-party component that is not part of the Chromium source
tree: uBlock Origin, bundled as a preinstalled extension. This file records what
is shipped, under which license, and what each Rail release has to carry to stay
compliant.

## uBlock Origin

| | |
|---|---|
| Version | 1.74.0 |
| Artifact | `uBlock0_1.74.0.chromium.crx` |
| SHA-256 | `b6be71ed3e3e85eaad8f02710b9071d06428e141d942c43d5f65d4526e82dc3e` |
| Extension ID | `fkgkibajhfbepljeaefdnfnegdcjomkh` |
| Upstream | https://github.com/gorhill/uBlock |
| Binary release | https://github.com/gorhill/uBlock/releases/tag/1.74.0 |
| Copyright | Raymond Hill & contributors |
| License | GNU General Public License, version 3 |

The CRX is the release asset published by the upstream project, byte for byte.
Rail does not modify, repack, or re-sign it. `LICENSE.txt`, the full GPLv3 text,
travels inside the CRX and reaches the user with the extension.

The ID is not the `cjpalhdlnbpafiamejdnhcphjbkeiagm` that the Chrome Web Store
listing carries. An extension ID is derived from the key that signed the CRX,
and the release asset is signed by the upstream project rather than by the
store, so it installs under its own ID. Rail has no store-installed copy to
migrate from, so nothing depends on the two matching.

## How it reaches the user

`build.py` downloads the CRX into `build/download_cache`, verifies the SHA-256
above, copies it to `<out>/default_apps/`, and writes the matching
`<out>/default_apps/external_extensions.json` next to it. `rail::EnsureBundledExtensions`
installs the CRX from that directory into each new Rail profile; see ARCHITECTURE.md,
Bundled extensions. The same step leaves the upstream source
archive in `build/download_cache`, which obligation 2 below covers; it is not
part of the build and nothing links against it.

Rail writes that JSON instead of patching
`chrome/browser/resources/default_apps/external_extensions.json` because the GN
target that would copy the upstream file into the output directory,
`preinstalled_apps` in `chrome/BUILD.gn`, is guarded by `is_chrome_branded`.
Rail is Chromium-branded, so the target does not exist in this build and the
upstream file never reaches `<out>`. Writing the file directly also keeps the
extension list in Rail's own tree rather than in an upstream patch.

Upstream `chrome/installer/mini_installer/chrome.release` lists
`default_apps\*.crx` and `default_apps\external_extensions.json` only under
`[GOOGLE_CHROME]`, a section `create_installer_archive.py` stages only for
Chrome-branded builds, so a Rail installer used to ship without them and the
extension never reached any machine but the one that built it.
`patches/preinstall-ublock-origin.patch` adds both lines to `[GENERAL]`, and
adds `default_apps/*` to `chrome/tools/build/win/FILES.cfg` so the zip package
carries them too.

The extension is user-visible in `chrome://extensions` and the user can disable
or remove it. It installs on profile creation only: `EnsureBundledExtensions`
runs from `OnProfileCreated`, and no later run reinstalls it, so removing it
makes it stay removed.

## Why the CRX runs at all

uBlock Origin 1.74.0 is a Manifest V2 extension and holds `webRequestBlocking`.
Upstream Chromium 150 refuses to run MV2 extensions; ungoogled-chromium's patch
to `ShouldDisableLegacyExtensions` in
`extensions/browser/manifest_v2_experiment_manager.cc` is what keeps them
loading. Nothing else in the install path objects:
`GetExternalVerifierFormat` in `extensions/common/verifier_formats.cc` asks for
plain `CRX3`, so a self-signed CRX needs no publisher proof from the store, and
`InstallVerifier` only enforces under `GOOGLE_CHROME_BRANDING`.

A Chromium rebase that removes the MV2 loading path, rather than the flags that
gate it, takes this feature with it.

## GPLv3 obligations, per release

1. Ship the CRX unmodified. Repacking it would make Rail a distributor of a
   modified work under GPLv3 section 5, would require publishing the changes,
   and would forfeit the uBlock Origin name. It would also change the signing
   key and therefore the extension ID.
2. Publish the corresponding source for the exact version shipped. Rail relies
   on GPLv3 section 6(d), which permits pointing at a different server as long
   as clear directions sit next to the object code and the source stays
   available for as long as needed. Because that availability obligation is
   Rail's and not upstream's, the source archive goes up as an asset of the Rail
   release, next to the installer and the zip, rather than as a link to
   upstream. `build.py` leaves it at
   `build/download_cache/uBlock-<version>.tar.gz`, fetched from the same tag as
   the CRX, so publishing means uploading a file that already exists on disk.
   Its hash is not pinned: GitHub generates these archives on demand and has
   changed their compression before, so a pinned hash would fail the build over
   something outside Rail's control. The CRX, which is the artifact that ships,
   is pinned.
3. Keep the directions reachable from the product, not only from this file.
   The About section of Rail's settings lists uBlock Origin with its version,
   license, and the name of the source archive on the Rail release page.
4. Add no term to Rail's own licensing that restricts use, copying, or
   modification of uBlock Origin.

uBlock Origin runs as an extension in its own process and talks to the browser
only through the extension APIs. That is aggregation, not linking, so Rail's own
code is not a derivative work and is not placed under the GPL.

## Bumping the version

Update `_UBLOCK_VERSION` and `_UBLOCK_SHA256` in `build.py`, this file, and
the About section in
`src/chrome/browser/resources/webui_browser/rail/settings.html.ts`, which names
the version and the source archive.
Confirm `_UBLOCK_EXTENSION_ID` still matches: the ID follows the signing key, so
it survives a version bump but not a key rotation, and Chromium calls
`set_expected_version` with `fail_install_if_unexpected`, so a mismatched
version or ID aborts the install with only a line in the extension error log.
The source archive follows the version constant, so the next build fetches the
matching one on its own.
