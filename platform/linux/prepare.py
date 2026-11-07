import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'build' / 'src'
STAMPS = ROOT / 'build' / 'linux-prepare'
UNGOOGLED = ROOT / 'ungoogled-chromium'
sys.path.insert(0, str(UNGOOGLED / 'utils'))
import domain_substitution
import patches
import prune_binaries
sys.path.pop(0)
sys.path.insert(0, str(ROOT))
from build import _copy_branding, _link_overlay
sys.path.pop(0)

TOOL_URL_FIXES = {
    'commondatastorage.9oo91eapis.qjz9zk': (
        'commondatastorage.googleapis.com',
        ['build/linux/sysroot_scripts/sysroots.json',
         'tools/clang/scripts/update.py',
         'tools/clang/scripts/build.py']),
    'chromium.9oo91esource.qjz9zk': (
        'chromium.googlesource.com',
        ['tools/clang/scripts/build.py',
         'tools/rust/build_rust.py',
         'tools/rust/build_bindgen.py']),
    'chrome-infra-packages.8pp2p8t.qjz9zk': (
        'chrome-infra-packages.appspot.com',
        ['tools/rust/build_rust.py']),
}

HOST_TOOL_LINKS = {
    'node': 'third_party/node/linux/node-linux-x64/bin/node',
    'gperf': 'third_party/gperf/cipd/bin/gperf',
    'go': 'third_party/dawn/tools/golang/linux-amd64/bin/go',
    'clang-format': 'buildtools/linux64-format/clang-format',
}


def once(name, step):
    stamp = STAMPS / name
    if stamp.exists():
        print('skip', name)
        return
    print('run', name)
    step()
    STAMPS.mkdir(parents=True, exist_ok=True)
    stamp.touch()


def prune():
    pruning_list = (UNGOOGLED / 'pruning.list').read_text(encoding='utf-8').splitlines()
    unremovable = prune_binaries.prune_files(SOURCE, pruning_list)
    if unremovable:
        raise RuntimeError('Files could not be pruned: {}'.format(unremovable))


def apply_series(series_dir):
    patches.apply_patches(
        patches.generate_patches_from_series(series_dir, resolve=True), SOURCE)


def apply_patch_sets():
    apply_series(UNGOOGLED / 'patches')
    apply_series(ROOT / 'platform' / 'linux' / 'patches')
    apply_series(ROOT / 'patches')


def substitute_domains():
    domain_substitution.apply_substitution(
        UNGOOGLED / 'domain_regex.list', UNGOOGLED / 'domain_substitution.list', SOURCE, None)


def restore_tool_urls():
    for substituted, (original, files) in TOOL_URL_FIXES.items():
        for relative in files:
            path = SOURCE / relative
            text = path.read_text(encoding='utf-8')
            path.write_text(text.replace(substituted, original), encoding='utf-8')


def apply_rail_shell():
    patches.apply_patches([ROOT / 'patches' / 'rail-shell.patch'], SOURCE)


def install_toolchain():
    python = sys.executable
    subprocess.run([python, 'tools/rust/update_rust.py'], cwd=SOURCE, check=True)
    subprocess.run([python, 'tools/clang/scripts/update.py'], cwd=SOURCE, check=True)
    subprocess.run([python, 'build/linux/sysroot_scripts/install-sysroot.py', '--arch=amd64'],
                   cwd=SOURCE, check=True)


def link_host_tools():
    for tool, relative in HOST_TOOL_LINKS.items():
        executable = shutil.which(tool)
        if executable is None:
            raise RuntimeError('{} is missing; run platform/linux/host-deps.sh first'.format(tool))
        link = SOURCE / relative
        link.parent.mkdir(parents=True, exist_ok=True)
        link.unlink(missing_ok=True)
        link.symlink_to(executable)
    esbuild = SOURCE / 'third_party/devtools-frontend/src/node_modules/esbuild'
    if esbuild.is_symlink():
        esbuild.unlink()
    elif esbuild.exists():
        shutil.rmtree(esbuild)
    esbuild.symlink_to(Path('/usr/lib/node_modules/esbuild'), target_is_directory=True)


def main():
    parser = argparse.ArgumentParser(
        description='Prepare the Linux Chromium tree that ungoogled clone.py checked out')
    parser.parse_args()
    if not sys.platform.startswith('linux'):
        parser.error('run this on the Linux build host')
    if not (SOURCE / 'BUILD.gn').is_file():
        parser.error('build/src is missing; run ungoogled-chromium/utils/clone.py -p linux first')
    os.environ.setdefault('DEPOT_TOOLS_UPDATE', '0')
    once('pruned', prune)
    once('patched', apply_patch_sets)
    once('domains-substituted', substitute_domains)
    once('tool-urls-restored', restore_tool_urls)
    once('rail-shell-applied', apply_rail_shell)
    install_toolchain()
    link_host_tools()
    _link_overlay(SOURCE)
    _copy_branding(SOURCE)


if __name__ == '__main__':
    main()
