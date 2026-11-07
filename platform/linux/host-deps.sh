#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "host-deps.sh must run as root" >&2
  exit 1
fi

source_tree="${1:?usage: host-deps.sh <prepared build/src>}"
node_major=24
sccache_version=0.17.0
go_version=1.26.10
go_sha256=ccfe7ae822d2c2f41f4fe7c956199967a4dac22d0ee0d2b2bfdb440aab3b20c5
appimagetool_version=1.9.0
appimagetool_sha256=46fdd785094c7f6e545b61afcfb0f3d98d8eab243f644b4b17698c01d06083d1

export DEBIAN_FRONTEND=noninteractive

"$source_tree/build/install-build-deps.sh" --no-prompt --no-arm --no-chromeos-fonts --no-nacl

apt-get install -y -q gperf clang-format ninja-build desktop-file-utils squashfs-tools file xz-utils
apt-get remove -y -q golang golang-go || true

if ! /usr/local/go/bin/go version 2>/dev/null | grep -q " go${go_version} "; then
  archive="$(mktemp)"
  curl -fsSL -o "$archive" "https://go.dev/dl/go${go_version}.linux-amd64.tar.gz"
  echo "${go_sha256}  ${archive}" | sha256sum -c -
  rm -rf /usr/local/go
  tar -xzf "$archive" -C /usr/local
  rm -f "$archive"
fi
ln -sf /usr/local/go/bin/go /usr/local/bin/go

if ! node --version 2>/dev/null | grep -q "^v${node_major}\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${node_major}.x" | bash -
  apt-get install -y -q nodejs
fi
npm install -g typescript esbuild

if ! sccache --version 2>/dev/null | grep -q " ${sccache_version}$"; then
  archive="sccache-v${sccache_version}-x86_64-unknown-linux-musl"
  workdir="$(mktemp -d)"
  curl -fsSL "https://github.com/mozilla/sccache/releases/download/v${sccache_version}/${archive}.tar.gz" \
    | tar -xz -C "$workdir"
  install -m 0755 "$workdir/$archive/sccache" /usr/local/bin/sccache
  rm -rf "$workdir"
fi

if ! echo "${appimagetool_sha256}  /usr/local/bin/appimagetool" | sha256sum -c --status - 2>/dev/null; then
  archive="$(mktemp)"
  curl -fsSL -o "$archive" \
    "https://github.com/AppImage/appimagetool/releases/download/${appimagetool_version}/appimagetool-x86_64.AppImage"
  echo "${appimagetool_sha256}  ${archive}" | sha256sum -c -
  install -m 0755 "$archive" /usr/local/bin/appimagetool
  rm -f "$archive"
fi

go version
node --version
tsc --version
sccache --version
