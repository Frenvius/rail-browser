# Notices and attribution

Rail is a derivative work. This file records what it is built from.

## ungoogled-chromium-windows

The build driver in this repository (`build.py`, `package.py`, `downloads.ini`,
`revision.txt`, `pruning.list`, `domain_substitution.list`, `platform/windows/flags.release.gn`,
`devutils/`, and `platform/windows/patches/ungoogled/`) originates from
`ungoogled-software/ungoogled-chromium-windows`, forked at commit `da71820`
("Update to 150.0.7871.186"). It carries the license in `LICENSE`.

Rail's fork modifies `build.py` for local toolchain discovery, adds
`platform/windows/clone.py`, and appends `patches/` to `patches/series`.

Upstream: https://github.com/ungoogled-software/ungoogled-chromium-windows

## ungoogled-chromium

Vendored as the `ungoogled-chromium/` submodule at commit `fd0378e`
("Update to Chromium 150.0.7871.186"). It provides the platform-independent
patch set, `pruning.list`, and `domain_substitution.list` inputs.

Upstream: https://github.com/ungoogled-software/ungoogled-chromium

## Chromium

The engine is Chromium `150.0.7871.186`, downloaded at build time into `build/`
and never redistributed in this repository. Chromium is licensed under its own
terms; see the `LICENSE` file inside the Chromium checkout.

The product shell builds on Chromium's experimental `Webium` WebUI browser
surface, which is upstream Chromium code.

## Name

"Rail" is this project's name. It is unrelated to Ruby on Rails, Railway, or
any other project using the word.
