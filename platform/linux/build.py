import argparse
import fcntl
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'build' / 'src'
PLATFORM = ROOT / 'platform' / 'linux'
sys.path.insert(0, str(ROOT))
from build import _copy_branding, _install_ublock_origin, _link_overlay, _snapshot_ninja_state
sys.path.pop(0)


def run(*command, env):
    subprocess.run([str(part) for part in command], cwd=SOURCE, env=env, check=True)


def build_env():
    env = os.environ.copy()
    clang_bin = SOURCE / 'third_party' / 'llvm-build' / 'Release+Asserts' / 'bin'
    env['CC'] = str(clang_bin / 'clang')
    env['CXX'] = str(clang_bin / 'clang++')
    env['AR'] = str(clang_bin / 'llvm-ar')
    env['NM'] = str(clang_bin / 'llvm-nm')
    env.setdefault('SCCACHE_DIR', str(Path.home() / 'rail' / 'sccache'))
    env.setdefault('SCCACHE_CACHE_SIZE', '40G')
    env.setdefault('SCCACHE_IDLE_TIMEOUT', '0')
    env.setdefault('SCCACHE_SERVER_PORT', '4227')
    env.setdefault('DEPOT_TOOLS_UPDATE', '0')
    return env


def write_args(output, release, rail_version):
    flags_file = 'flags.release.gn' if release else 'flags.dev.gn'
    text = (ROOT / 'ungoogled-chromium' / 'flags.gn').read_text(encoding='utf-8')
    text += '\n' + (PLATFORM / flags_file).read_text(encoding='utf-8')
    if rail_version:
        text += '\nrail_version="{}"\n'.format(rail_version)
    (output / 'args.gn').write_text(text, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-j', '--jobs', type=int, default=20)
    parser.add_argument('--regenerate', action='store_true')
    parser.add_argument('--target', action='append', default=None)
    parser.add_argument('--release', action='store_true')
    parser.add_argument('--rail-version')
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error('jobs must be positive')
    if args.rail_version and not re.fullmatch(r'\d+\.\d+\.\d+', args.rail_version):
        parser.error('--rail-version must be MAJOR.MINOR.PATCH')
    if args.rail_version and not args.regenerate:
        parser.error('--rail-version requires --regenerate')
    if not (SOURCE / 'BUILD.gn').is_file():
        parser.error('the prepared Chromium tree is missing; run platform/linux/prepare.py')
    if not (SOURCE / 'third_party' / 'llvm-build' / 'Release+Asserts' / 'bin' / 'clang').is_file():
        parser.error('Chromium clang is missing; run platform/linux/prepare.py')
    python = ROOT / '.venv' / 'bin' / 'python'
    if not python.is_file():
        parser.error('create .venv and install requirements-dev.txt first')
    output_name = 'Release' if args.release else 'Dev'
    output = SOURCE / 'out' / output_name
    env = build_env()
    ninja = SOURCE / 'third_party' / 'ninja' / 'ninja'
    if not ninja.is_file():
        found = shutil.which('ninja', path=env['PATH'])
        if found is None:
            parser.error('ninja is missing')
        ninja = Path(found)
    lock_path = ROOT / 'build' / 'linux-build.lock'
    with lock_path.open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        _link_overlay(SOURCE)
        _copy_branding(SOURCE)
        output.mkdir(parents=True, exist_ok=True)
        if args.regenerate or not (output / 'args.gn').exists():
            write_args(output, args.release, args.rail_version)
        expected_debug_flag = 'is_debug=false'
        if expected_debug_flag not in (output / 'args.gn').read_text(encoding='utf-8').split():
            parser.error('{} lacks {}; rerun with --regenerate'.format(
                output / 'args.gn', expected_debug_flag))
        gn = output / 'gn'
        if not gn.is_file():
            run(python, 'tools/gn/bootstrap/bootstrap.py', '-o', gn,
                '--skip-generate-buildfiles', env=env)
        if args.regenerate or not (output / 'build.ninja').is_file():
            run(gn, 'gen', output, '--fail-on-unused-args',
                '--script-executable=' + str(python.absolute()), env=env)
        _install_ublock_origin(SOURCE, ROOT / 'build' / 'download_cache', Path('out') / output_name)
        targets = args.target or ['chrome']
        run(ninja, '-C', output, '-j', args.jobs, *targets, env=env)
        _snapshot_ninja_state(output, ROOT / 'build' / 'ninja-state' / output_name)


if __name__ == '__main__':
    main()
