#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Copyright (c) 2019 The ungoogled-chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.
"""
ungoogled-chromium build script for Microsoft Windows
"""

import sys
import time
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import ctypes
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'ungoogled-chromium' / 'utils'))
import downloads
import domain_substitution
import prune_binaries
import patches
from _common import ENCODING, USE_REGISTRY, ExtractorEnum, get_logger
sys.path.pop(0)


def _host_platform():
    if sys.platform.startswith('win'):
        return 'windows'
    if sys.platform == 'darwin':
        return 'macos'
    if sys.platform.startswith('linux'):
        return 'linux'
    raise RuntimeError('Unsupported host platform: ' + sys.platform)

_ROOT_DIR = Path(__file__).resolve().parent
_PLATFORM_DIR = _ROOT_DIR / 'platform' / _host_platform()
_PATCH_BIN_RELPATH = Path('third_party/git/usr/bin/patch.exe')


def _snapshot_ninja_state(build_dir, backup_dir):
    """Preserve the two files that decide whether a rebuild is incremental.

    Losing .ninja_log or .ninja_deps makes ninja treat every output as dirty,
    which costs a full rebuild even when nothing changed.
    """
    backup_dir.mkdir(parents=True, exist_ok=True)
    for name in ('.ninja_log', '.ninja_deps'):
        source = build_dir / name
        if source.exists():
            shutil.copy2(source, backup_dir / name)


def _link_overlay(source_tree):
    """Junction the first-party overlay into the Chromium checkout.

    Overlay sources live in <root>/src and are versioned by this repository.
    They are junctioned instead of copied so an edit needs no sync step, and
    junctioning keeps the in-checkout path identical, which the build cache
    depends on.
    """
    overlay_root = _ROOT_DIR / 'src'
    if not overlay_root.is_dir():
        return
    for current, subdirs, files in os.walk(overlay_root):
        if not files:
            continue
        relative = Path(current).relative_to(overlay_root)
        link = source_tree / relative
        if link.exists():
            if not _is_junction(link):
                raise RuntimeError(
                    'Overlay target is a real directory, refusing to replace: {}'.format(link))
            subdirs.clear()
            continue
        link.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(Path(current))],
                       check=True,
                       stdout=subprocess.DEVNULL)
        get_logger().info('Linked overlay %s', relative)
        subdirs.clear()


def _copy_branding(source_tree):
    """Overwrite upstream icon assets with Rail's.

    These targets live in directories Chromium already ships, so the overlay
    junction cannot claim them, and they are binary, so `patches/` cannot carry
    them either. Copying on every prepare keeps the checkout in sync with the
    files versioned here.
    """
    branding_root = _ROOT_DIR / 'branding'
    if not branding_root.is_dir():
        return
    for current, _, files in os.walk(branding_root):
        for name in files:
            source = Path(current) / name
            target = source_tree / source.relative_to(branding_root)
            if not target.parent.is_dir():
                raise RuntimeError('Branding target directory is missing: {}'.format(target.parent))
            shutil.copy2(source, target)
            get_logger().info('Branded %s', target.relative_to(source_tree))


def _is_junction(path):
    FILE_ATTRIBUTE_REPARSE_POINT = 0x400
    attributes = ctypes.windll.kernel32.GetFileAttributesW(str(path))
    return attributes != -1 and bool(attributes & FILE_ATTRIBUTE_REPARSE_POINT)


def _get_vcvars_path(name='64'):
    """
    Returns the path to the corresponding vcvars*.bat path

    As of VS 2017, name can be one of: 32, 64, all, amd64_x86, x86_amd64
    """
    vswhere_exe = '%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe'
    result = subprocess.run(
        '"{}" -products * -prerelease -latest -property installationPath'.format(vswhere_exe),
        shell=True,
        check=True,
        stdout=subprocess.PIPE,
        universal_newlines=True)
    vcvars_path = Path(result.stdout.strip(), 'VC/Auxiliary/Build/vcvars{}.bat'.format(name))
    if not vcvars_path.exists():
        raise RuntimeError(
            'Could not find vcvars batch script in expected location: {}'.format(vcvars_path))
    return vcvars_path


def _run_build_process(*args, **kwargs):
    """
    Runs the subprocess with the correct environment variables for building
    """
    # Add call to set VC variables
    vcvars_path = _get_vcvars_path()
    vs_install_path = vcvars_path.parents[3]
    # Some Windows sandbox/process launchers preserve both `Path` and `PATH`.
    # vcvarsall updates one spelling, then Chromium's parser can let the stale
    # duplicate overwrite it and lose cl.exe. Collapse them before activation.
    cmd_input = [
        '@echo off',
        'set "Path="',
        'set "PATH=%s"' % os.environ['PATH'],
        'call "%s" >nul' % vcvars_path,
    ]
    cmd_input.append('set DEPOT_TOOLS_WIN_TOOLCHAIN=0')
    cmd_input.append('set vs2026_install=%s' % vs_install_path)
    cmd_input.append('set GYP_MSVS_OVERRIDE_PATH=%s' % vs_install_path)
    cmd_input.append(' '.join(map('"{}"'.format, args)))
    cmd_input.append('exit\n')
    subprocess.run(('cmd.exe', '/k'),
                   input='\n'.join(cmd_input),
                   check=True,
                   encoding=ENCODING,
                   **kwargs)


def _run_build_process_timeout(*args, timeout):
    """
    Runs the subprocess with the correct environment variables for building
    """
    # Add call to set VC variables
    vcvars_path = _get_vcvars_path()
    vs_install_path = vcvars_path.parents[3]
    cmd_input = [
        '@echo off',
        'set "Path="',
        'set "PATH=%s"' % os.environ['PATH'],
        'call "%s" >nul' % vcvars_path,
    ]
    cmd_input.append('set DEPOT_TOOLS_WIN_TOOLCHAIN=0')
    cmd_input.append('set vs2026_install=%s' % vs_install_path)
    cmd_input.append('set GYP_MSVS_OVERRIDE_PATH=%s' % vs_install_path)
    cmd_input.append(' '.join(map('"{}"'.format, args)))
    cmd_input.append('exit\n')
    with subprocess.Popen(('cmd.exe', '/k'), encoding=ENCODING, stdin=subprocess.PIPE, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP) as proc:
        proc.stdin.write('\n'.join(cmd_input))
        proc.stdin.close()
        try:
            proc.wait(timeout)
            if proc.returncode != 0:
                raise RuntimeError('Build failed!')
        except subprocess.TimeoutExpired:
            print('Sending keyboard interrupt')
            for _ in range(3):
                ctypes.windll.kernel32.GenerateConsoleCtrlEvent(1, proc.pid)
                time.sleep(1)
            try:
                proc.wait(10)
            except:
                proc.kill()
            raise KeyboardInterrupt


def _make_tmp_paths():
    """Creates TMP and TEMP variable dirs so ninja won't fail"""
    tmp_path = Path(os.environ['TMP'])
    if not tmp_path.exists():
        tmp_path.mkdir()
    tmp_path = Path(os.environ['TEMP'])
    if not tmp_path.exists():
        tmp_path.mkdir()


def _install_python3_shim():
    """Expose the active interpreter under depot_tools' expected name."""
    if not sys.platform.startswith('win'):
        return
    os.environ.setdefault('windir', os.environ.get('SystemRoot', r'C:\Windows'))
    shim_dir = _ROOT_DIR / 'build' / 'tool_shims'
    shim_dir.mkdir(parents=True, exist_ok=True)
    (shim_dir / 'python3.bat').write_text(
        '@"{}" %*\n'.format(sys.executable), encoding=ENCODING)
    os.environ['PATH'] = str(shim_dir) + os.pathsep + os.environ['PATH']


def _ensure_chromium_clang(source_tree):
    """Install the exact Clang package pinned by this Chromium revision."""
    update_script = source_tree / 'tools' / 'clang' / 'scripts' / 'update.py'
    update_source = update_script.read_text(encoding=ENCODING)
    revision_match = re.search(r"^CLANG_REVISION = '([^']+)'$", update_source, re.MULTILINE)
    subrevision_match = re.search(r'^CLANG_SUB_REVISION = (\d+)$', update_source, re.MULTILINE)
    if not revision_match or not subrevision_match:
        raise RuntimeError('Could not read Chromium\'s pinned Clang revision')

    expected_revision = '{}-{}'.format(
        revision_match.group(1), subrevision_match.group(1))
    clang_dir = source_tree / 'third_party' / 'llvm-build' / 'Release+Asserts'
    stamp_file = clang_dir / 'cr_build_revision'
    installed_revision = (
        stamp_file.read_text(encoding=ENCODING).strip()
        if stamp_file.exists() else None)
    if installed_revision == expected_revision:
        return

    get_logger().info(
        'Replacing the generic Windows LLVM package with Chromium Clang %s...',
        expected_revision)
    clang_env = os.environ.copy()
    # Domain substitution intentionally rewrites the URL embedded in update.py.
    # The compiler is a build-time input, so use Chromium's official bucket while
    # keeping all browser runtime patches and services ungoogled.
    clang_env.setdefault(
        'CDS_CLANG_BUCKET_OVERRIDE',
        'https://commondatastorage.googleapis.com/chromium-browser-clang')
    subprocess.run(
        [sys.executable, str(update_script), '--output-dir', str(clang_dir)],
        check=True,
        env=clang_env)


def _ensure_chromium_clang_format(source_tree):
    """Install the clang-format binary pinned in Chromium's buildtools DEPS."""
    deps_file = source_tree / 'buildtools' / 'DEPS'
    deps_source = deps_file.read_text(encoding=ENCODING)
    win_format = re.search(
        r"'win-format':\s*\{.*?"
        r"'object_name':\s*'([0-9a-f]{40})'.*?"
        r"'sha256sum':\s*'([0-9a-f]{64})'.*?"
        r"'output_file':\s*'clang-format\.exe'",
        deps_source,
        re.DOTALL)
    if not win_format:
        raise RuntimeError('Could not read Chromium\'s pinned clang-format object')

    object_name, expected_sha256 = win_format.groups()
    output_file = source_tree / 'buildtools' / 'win' / 'clang-format.exe'
    if output_file.exists():
        installed_sha256 = hashlib.sha256(output_file.read_bytes()).hexdigest()
        if installed_sha256 == expected_sha256:
            return

    get_logger().info('Installing Chromium\'s pinned clang-format...')
    output_file.parent.mkdir(parents=True, exist_ok=True)
    download_file = output_file.with_suffix('.exe.download')
    url = ('https://storage.googleapis.com/chromium-clang-format/' +
           object_name)
    with urllib.request.urlopen(url, timeout=120) as response:
        with download_file.open('wb') as destination:
            shutil.copyfileobj(response, destination)
    installed_sha256 = hashlib.sha256(download_file.read_bytes()).hexdigest()
    if installed_sha256 != expected_sha256:
        download_file.unlink(missing_ok=True)
        raise RuntimeError('Downloaded clang-format failed Chromium\'s SHA-256 check')
    download_file.replace(output_file)


_UBLOCK_VERSION = '1.74.0'
_UBLOCK_SHA256 = 'b6be71ed3e3e85eaad8f02710b9071d06428e141d942c43d5f65d4526e82dc3e'
_UBLOCK_URL = 'https://github.com/gorhill/uBlock/releases/download/{}/{}'
_UBLOCK_SOURCE_URL = 'https://github.com/gorhill/uBlock/archive/refs/tags/{}.tar.gz'
_UBLOCK_EXTENSION_ID = 'fkgkibajhfbepljeaefdnfnegdcjomkh'


def _install_ublock_origin(source_tree, downloads_cache, output_dir):
    filename = 'uBlock0_{}.chromium.crx'.format(_UBLOCK_VERSION)
    cached_file = downloads_cache / filename
    if not cached_file.exists() or hashlib.sha256(
            cached_file.read_bytes()).hexdigest() != _UBLOCK_SHA256:
        get_logger().info('Downloading uBlock Origin %s...', _UBLOCK_VERSION)
        downloads_cache.mkdir(parents=True, exist_ok=True)
        download_file = cached_file.with_suffix('.crx.download')
        with urllib.request.urlopen(_UBLOCK_URL.format(_UBLOCK_VERSION, filename),
                                    timeout=300) as response:
            with download_file.open('wb') as destination:
                shutil.copyfileobj(response, destination)
        if hashlib.sha256(download_file.read_bytes()).hexdigest() != _UBLOCK_SHA256:
            download_file.unlink(missing_ok=True)
            raise RuntimeError('Downloaded uBlock Origin failed its SHA-256 check')
        download_file.replace(cached_file)

    source_archive = downloads_cache / 'uBlock-{}.tar.gz'.format(_UBLOCK_VERSION)
    if not source_archive.exists():
        get_logger().info('Downloading uBlock Origin %s sources...', _UBLOCK_VERSION)
        download_file = source_archive.parent / (source_archive.name + '.download')
        with urllib.request.urlopen(_UBLOCK_SOURCE_URL.format(_UBLOCK_VERSION),
                                    timeout=300) as response:
            with download_file.open('wb') as destination:
                shutil.copyfileobj(response, destination)
        download_file.replace(source_archive)

    target_dir = source_tree / output_dir / 'default_apps'
    target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(cached_file, target_dir / filename)
    (target_dir / 'external_extensions.json').write_text(
        json.dumps({
            _UBLOCK_EXTENSION_ID: {
                'external_crx': filename,
                'external_version': _UBLOCK_VERSION,
            }
        }, indent=2) + '\n',
        encoding=ENCODING)


def main():
    """CLI Entrypoint"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--disable-ssl-verification',
        action='store_true',
        help='Disables SSL verification for downloading')
    parser.add_argument(
        '--7z-path',
        dest='sevenz_path',
        default=USE_REGISTRY,
        help=('Command or path to 7-Zip\'s "7z" binary. If "_use_registry" is '
              'specified, determine the path from the registry. Default: %(default)s'))
    parser.add_argument(
        '--winrar-path',
        dest='winrar_path',
        default=USE_REGISTRY,
        help=('Command or path to WinRAR\'s "winrar.exe" binary. If "_use_registry" is '
              'specified, determine the path from the registry. Default: %(default)s'))
    parser.add_argument(
        '-j',
        type=int,
        dest='thread_count',
        help=('Number of CPU threads to use for compiling'))
    parser.add_argument(
        '--ci',
        action='store_true'
    )
    parser.add_argument(
        '--x86',
        action='store_true'
    )
    parser.add_argument(
        '--arm',
        action='store_true'
    )
    parser.add_argument(
        '--tarball',
        action='store_true'
    )
    parser.add_argument(
        '--dev',
        action='store_true',
        help='Use the incremental developer configuration and out/Dev')
    parser.add_argument(
        '--reuse',
        action='store_true',
        help='Reuse an already prepared source tree without resetting local product changes')
    parser.add_argument(
        '--regenerate',
        action='store_true',
        help='Rewrite args.gn and rerun GN while reusing the prepared source tree')
    parser.add_argument(
        '--prepare-only',
        action='store_true',
        help='Download, patch, and prepare Chromium sources, then stop before GN/Ninja')
    parser.add_argument(
        '--target',
        action='append',
        dest='targets',
        help=('Ninja target to build. May be repeated. Defaults to chrome in --dev mode; '
              'otherwise chrome, chromedriver, and mini_installer'))
    args = parser.parse_args()

    # Set common variables
    source_tree = _ROOT_DIR / 'build' / 'src'
    downloads_cache = _ROOT_DIR / 'build' / 'download_cache'
    output_name = 'Dev' if args.dev else 'Release'
    output_dir = Path('out') / output_name
    ninja_state_backup = _ROOT_DIR / 'build' / 'ninja-state' / output_name
    reuse = args.ci or args.reuse
    _install_python3_shim()

    if not reuse or not (source_tree / 'BUILD.gn').exists():
        # Setup environment
        source_tree.mkdir(parents=True, exist_ok=True)
        downloads_cache.mkdir(parents=True, exist_ok=True)
        _make_tmp_paths()

        # Extractors
        extractors = {
            ExtractorEnum.SEVENZIP: args.sevenz_path,
            ExtractorEnum.WINRAR: args.winrar_path,
        }

        # Prepare source folder
        if args.tarball:
            # Download chromium tarball
            get_logger().info('Downloading chromium tarball...')
            download_info = downloads.DownloadInfo([_ROOT_DIR / 'ungoogled-chromium' / 'downloads.ini'])
            downloads.retrieve_downloads(download_info, downloads_cache, None, True, args.disable_ssl_verification)
            try:
                downloads.check_downloads(download_info, downloads_cache, None)
            except downloads.HashMismatchError as exc:
                get_logger().error('File checksum does not match: %s', exc)
                exit(1)

            # Unpack chromium tarball
            get_logger().info('Unpacking chromium tarball...')
            downloads.unpack_downloads(download_info, downloads_cache, None, source_tree, extractors)
        else:
            # Clone sources
            clone_script = Path('ungoogled-chromium', 'utils', 'clone.py')
            if sys.platform.startswith('win'):
                clone_script = _PLATFORM_DIR / 'clone.py'
            subprocess.run([sys.executable, str(clone_script), '-o', 'build\\src', '-p', 'win32' if args.x86 else 'win-arm64' if args.arm else 'win64'], check=True)

        # Retrieve windows downloads
        get_logger().info('Downloading required files...')
        download_info_win = downloads.DownloadInfo([_PLATFORM_DIR / 'downloads.ini'])
        downloads.retrieve_downloads(download_info_win, downloads_cache, None, True, args.disable_ssl_verification)
        try:
            downloads.check_downloads(download_info_win, downloads_cache, None)
        except downloads.HashMismatchError as exc:
            get_logger().error('File checksum does not match: %s', exc)
            exit(1)

        # Prune binaries
        pruning_list = (_ROOT_DIR / 'ungoogled-chromium' / 'pruning.list') if args.tarball else (_PLATFORM_DIR / 'pruning.list')
        unremovable_files = prune_binaries.prune_files(
            source_tree,
            pruning_list.read_text(encoding=ENCODING).splitlines()
        )
        if unremovable_files:
            get_logger().error('Files could not be pruned: %s', unremovable_files)
            parser.exit(1)

        # Unpack downloads
        DIRECTX = source_tree / 'third_party' / 'microsoft_dxheaders' / 'src'
        ESBUILD = source_tree / 'third_party' / 'devtools-frontend' / 'src' / 'third_party' / 'esbuild'
        if DIRECTX.exists():
            shutil.rmtree(DIRECTX)
            DIRECTX.mkdir()
        if ESBUILD.exists():
            shutil.rmtree(ESBUILD)
            ESBUILD.mkdir()
        get_logger().info('Unpacking downloads...')
        downloads.unpack_downloads(download_info_win, downloads_cache, None, source_tree, extractors)

        # Apply patches
        # First, ungoogled-chromium-patches
        patches.apply_patches(
            patches.generate_patches_from_series(_ROOT_DIR / 'ungoogled-chromium' / 'patches', resolve=True),
            source_tree,
            patch_bin_path=(source_tree / _PATCH_BIN_RELPATH)
        )
        # Then platform-specific patches
        patches.apply_patches(
            patches.generate_patches_from_series(_PLATFORM_DIR / 'patches', resolve=True),
            source_tree,
            patch_bin_path=(source_tree / _PATCH_BIN_RELPATH)
        )
        # Finally the product patches
        patches.apply_patches(
            patches.generate_patches_from_series(_ROOT_DIR / 'patches', resolve=True),
            source_tree,
            patch_bin_path=(source_tree / _PATCH_BIN_RELPATH)
        )

        # Substitute domains
        domain_substitution_list = (_ROOT_DIR / 'ungoogled-chromium' / 'domain_substitution.list') if args.tarball else (_PLATFORM_DIR / 'domain_substitution.list')
        domain_substitution.apply_substitution(
            _ROOT_DIR / 'ungoogled-chromium' / 'domain_regex.list',
            domain_substitution_list,
            source_tree,
            None
        )

    # Check if rust-toolchain folder has been populated
    HOST_CPU_IS_64BIT = sys.maxsize > 2**32
    RUST_DIR_DST = source_tree / 'third_party' / 'rust-toolchain'
    RUST_DIR_SRC64 = source_tree / 'third_party' / 'rust-toolchain-x64'
    RUST_DIR_SRC86 = source_tree / 'third_party' / 'rust-toolchain-x86'
    RUST_DIR_SRCARM = source_tree / 'third_party' / 'rust-toolchain-arm'
    RUST_FLAG_FILE = RUST_DIR_DST / 'INSTALLED_VERSION'
    if not reuse or not RUST_FLAG_FILE.exists():
        # Directories to copy from source to target folder
        DIRS_TO_COPY = ['bin', 'lib']

        # Loop over all source folders
        for rust_dir_src in [RUST_DIR_SRC64, RUST_DIR_SRC86, RUST_DIR_SRCARM]:
            # Loop over all dirs to copy
            for dir_to_copy in DIRS_TO_COPY:
                # Copy bin folder for host architecture
                if (dir_to_copy == 'bin') and (HOST_CPU_IS_64BIT != (rust_dir_src == RUST_DIR_SRC64)):
                    continue

                # Create target dir
                target_dir = RUST_DIR_DST / dir_to_copy
                if not os.path.isdir(target_dir):
                    os.makedirs(target_dir)

                # Loop over all subfolders of the rust source dir
                for cp_src in rust_dir_src.glob(f'*/{dir_to_copy}/*'):
                    cp_dst = target_dir / cp_src.name
                    if cp_src.is_dir():
                        shutil.copytree(cp_src, cp_dst, dirs_exist_ok=True)
                    else:
                        shutil.copy2(cp_src, cp_dst)

        # Generate version file
        with open(RUST_FLAG_FILE, 'w') as f:
            subprocess.run([source_tree / 'third_party' / 'rust-toolchain-x64' / 'rustc' / 'bin' / 'rustc.exe', '--version'], stdout=f)

    _link_overlay(source_tree)
    _copy_branding(source_tree)
    _ensure_chromium_clang(source_tree)
    _ensure_chromium_clang_format(source_tree)

    if args.prepare_only:
        get_logger().info('Source preparation complete (--prepare-only)')
        return

    if args.regenerate or not reuse or not (source_tree / output_dir).exists():
        # Output args.gn
        (source_tree / output_dir).mkdir(parents=True, exist_ok=True)
        gn_flags = (_ROOT_DIR / 'ungoogled-chromium' / 'flags.gn').read_text(encoding=ENCODING)
        gn_flags += '\n'
        flags_file = 'flags.dev.gn' if args.dev else 'flags.release.gn'
        windows_flags = (_PLATFORM_DIR / flags_file).read_text(encoding=ENCODING)
        if args.x86:
            windows_flags = windows_flags.replace('x64', 'x86')
        elif args.arm:
            windows_flags = windows_flags.replace('x64', 'arm64')
        if args.tarball:
            windows_flags += '\nchrome_pgo_phase=0\n'
        gn_flags += windows_flags
        (source_tree / output_dir / 'args.gn').write_text(gn_flags, encoding=ENCODING)

    # Enter source tree to run build commands
    os.chdir(source_tree)

    gn_exe = output_dir / 'gn.exe'
    if not gn_exe.exists():
        # Run GN bootstrap
        _run_build_process(
            sys.executable, 'tools\\gn\\bootstrap\\bootstrap.py', '-o', str(gn_exe),
            '--skip-generate-buildfiles')

    if (args.regenerate or not reuse or
            not (source_tree / output_dir / 'build.ninja').exists()):
        # The dotfile asks for "python3", which GN resolves through PATH and
        # bakes as an absolute path into every action it writes. A version
        # manager moves that path between shells and upgrades, and each move
        # rewrites the buildflag headers every translation unit includes, so a
        # one-line edit costs a full rebuild. Pin the interpreter instead; GN
        # copies the switch into the regeneration command, which keeps later
        # implicit gens on the same path.
        _run_build_process(str(gn_exe), 'gen', str(output_dir), '--fail-on-unused-args',
                           '--script-executable={}'.format(
                               Path(sys.executable).resolve().as_posix()))

    if not reuse or not os.path.exists('third_party\\rust-toolchain\\bin\\bindgen.exe'):
        # Build bindgen
        _run_build_process(
            sys.executable,
            'tools\\rust\\build_bindgen.py', '--skip-test')

    # Ninja commandline
    ninja_commandline = ['third_party\\ninja\\ninja.exe']
    if args.thread_count is not None:
        ninja_commandline.append('-j')
        ninja_commandline.append(args.thread_count)
    ninja_commandline.append('-C')
    ninja_commandline.append(str(output_dir))
    targets = args.targets
    if targets is None:
        targets = ['chrome'] if args.dev else ['chrome', 'chromedriver', 'mini_installer']
    ninja_commandline.extend(targets)

    _install_ublock_origin(source_tree, downloads_cache, output_dir)

    # Run ninja
    if args.ci:
        _run_build_process_timeout(*ninja_commandline, timeout=3.5*60*60)
        _snapshot_ninja_state(source_tree / output_dir, ninja_state_backup)
        # package
        os.chdir(_ROOT_DIR)
        subprocess.run([sys.executable, str(_PLATFORM_DIR / 'package.py'), '--cpu-arch', '32bit' if args.x86 else 'arm' if args.arm else '64bit'])
    else:
        _run_build_process(*ninja_commandline)
        _snapshot_ninja_state(source_tree / output_dir, ninja_state_backup)


if __name__ == '__main__':
    main()
