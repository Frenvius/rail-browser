import argparse
import fcntl
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'build' / 'src'
RUST_SDK = Path('/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk')
sys.path.insert(0, str(ROOT))
from build import _copy_branding, _install_ublock_origin, _link_overlay


def run(*command, env):
    subprocess.run([str(part) for part in command], cwd=SOURCE, env=env, check=True)


def compile_asset_catalog(env):
    theme = SOURCE / 'chrome' / 'app' / 'theme' / 'chromium' / 'mac'
    with tempfile.TemporaryDirectory(prefix='rail-assets-') as tmp:
        run('xcrun', 'actool', theme / 'Assets.xcassets', '--compile', tmp,
            '--platform', 'macosx', '--minimum-deployment-target', '13.0',
            '--app-icon', 'AppIcon',
            '--output-partial-info-plist', Path(tmp) / 'partial.plist', env=env)
        shutil.copy2(Path(tmp) / 'Assets.car', theme / 'Assets.car')


def build_crubit(env):
    rust = SOURCE / 'third_party' / 'rust-toolchain'
    crubit = rust / 'crubit'
    binary = crubit / 'bin' / 'cc_bindings_from_rs'
    if binary.is_file():
        return
    target = SOURCE / 'out' / 'crubit'
    cargo_env = env.copy()
    cargo_env['CARGO_HOME'] = str(target / 'cargo_home')
    cargo_env['RUSTC'] = str(rust / 'bin' / 'rustc')
    cargo_env['RUSTFLAGS'] = '-Clink-args=-Wl,-rpath,@loader_path/../../rustc/lib'
    run(rust / 'bin' / 'cargo', 'build', '--release', '--locked',
        '-p', 'cc_bindings_from_rs', '--bin', 'cc_bindings_from_rs',
        '--manifest-path', crubit / 'lib' / 'third_party' / 'crubit' / 'Cargo.toml',
        '--target-dir', target, env=cargo_env)
    binary.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target / 'release' / 'cc_bindings_from_rs', binary)
    run(binary, '--help', env=env)


def enable_symbols(text):
    text, count = re.subn(r'^symbol_level=\d+[ \t]*$', 'symbol_level=1', text, flags=re.M)
    if count != 1:
        raise RuntimeError('expected exactly one symbol_level assignment in args.gn')
    text, count = re.subn(r'^enable_dsyms=\w+[ \t]*$', 'enable_dsyms=true', text, flags=re.M)
    if count == 0:
        text += '\nenable_dsyms=true\n'
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-j', '--jobs', type=int, default=6)
    parser.add_argument('--regenerate', action='store_true')
    parser.add_argument('--target', action='append', default=None)
    parser.add_argument('--release', action='store_true')
    parser.add_argument('--rail-version')
    parser.add_argument('--symbols', action='store_true')
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error('jobs must be positive')
    if args.rail_version and not re.fullmatch(r'\d+\.\d+\.\d+', args.rail_version):
        parser.error('--rail-version must be MAJOR.MINOR.PATCH')
    if args.release != bool(args.rail_version):
        parser.error('--release requires --rail-version and vice versa')
    if args.rail_version and not args.regenerate:
        parser.error('--rail-version requires --regenerate')
    if args.symbols and not (args.release and args.regenerate):
        parser.error('--symbols requires --release and --regenerate')
    if not (SOURCE / 'BUILD.gn').is_file():
        parser.error('the prepared Chromium tree is missing')
    if not RUST_SDK.is_dir():
        parser.error('macOS 15.4 SDK is missing for bindgen')
    output = SOURCE / 'out' / ('RailRelease' if args.release else 'Rail')
    python = ROOT / '.venv' / 'bin' / 'python'
    if not python.is_file():
        parser.error('create .venv and install requirements-dev.txt first')
    env = os.environ.copy()
    env['PATH'] = '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:' + env.get('PATH', '')
    ninja = shutil.which('ninja', path=env['PATH'])
    if ninja is None:
        parser.error('ninja is missing')
    lock_path = ROOT / 'build' / 'mac-build.lock'
    with lock_path.open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        _link_overlay(SOURCE)
        _copy_branding(SOURCE)
        compile_asset_catalog(env)
        output.mkdir(parents=True, exist_ok=True)
        flags = output / 'args.gn'
        if args.regenerate or not flags.exists():
            platform_flags = 'flags.release.gn' if args.release else 'flags.gn'
            gn_flags = (
                (ROOT / 'ungoogled-chromium' / 'flags.gn').read_text()
                + (ROOT / 'platform' / 'macos' / platform_flags).read_text()
                + (f'\nrail_version="{args.rail_version}"\n'
                   if args.rail_version else ''))
            if args.symbols:
                gn_flags = enable_symbols(gn_flags)
            flags.write_text(gn_flags, encoding='utf-8')
        gn = SOURCE / 'out' / 'Rail' / 'gn' if args.release else output / 'gn'
        if not gn.is_file():
            gn = output / 'gn'
            run(python, 'tools/gn/bootstrap/bootstrap.py', '-o', gn,
                '--skip-generate-buildfiles', env=env)
        if not (SOURCE / 'third_party/rust-toolchain/bin/bindgen').is_file():
            rust_env = env.copy()
            rust_env['SDKROOT'] = str(RUST_SDK)
            run(python, 'tools/rust/build_bindgen.py', '--skip-test', env=rust_env)
        build_crubit(env)
        if args.regenerate or not (output / 'build.ninja').is_file():
            run(gn, 'gen', output, '--fail-on-unused-args',
                '--script-executable=' + str(python.resolve()), env=env)
        run(ninja, '-C', output, '-j', args.jobs, *(args.target or ['chrome']), env=env)
        if args.target is None or 'chrome' in args.target:
            _install_ublock_origin(
                SOURCE, ROOT / 'build' / 'download_cache',
                Path(f'out/{output.name}/Rail.app/Contents/MacOS'))


if __name__ == '__main__':
    main()
