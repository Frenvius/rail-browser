import argparse
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLATFORM = ROOT / 'platform' / 'linux'
BRANDING = ROOT / 'branding' / 'chrome' / 'app' / 'theme' / 'chromium'
ARCH = 'x86_64'
INSTALL_DIR = Path('opt') / 'rail'
ICON_SIZES = (16, 24, 48, 64, 128, 256)
STRIP = ROOT / 'build' / 'src' / 'third_party' / 'llvm-build' / 'Release+Asserts' / 'bin' / 'llvm-strip'
EXECUTABLES = (
    'chrome',
    'chrome_crashpad_handler',
    'libEGL.so',
    'libGLESv2.so',
    'libqt5_shim.so',
    'libqt6_shim.so',
    'libvk_swiftshader.so',
    'libvulkan.so.1',
)
PAYLOAD = (
    'chrome',
    'chrome_100_percent.pak',
    'chrome_200_percent.pak',
    'chrome_crashpad_handler',
    'icudtl.dat',
    'libEGL.so',
    'libGLESv2.so',
    'libqt5_shim.so',
    'libqt6_shim.so',
    'libvk_swiftshader.so',
    'libvulkan.so.1',
    'product_logo_48.png',
    'resources.pak',
    'v8_context_snapshot.bin',
    'vk_swiftshader_icd.json',
)


def stage_payload(output, target):
    target.mkdir(parents=True)
    for name in PAYLOAD:
        shutil.copy2(output / name, target / name)
    subprocess.run([str(STRIP), '--strip-unneeded',
                    *(str(target / name) for name in EXECUTABLES)], check=True)
    (target / 'locales').mkdir()
    for pak in sorted((output / 'locales').glob('*.pak')):
        shutil.copy2(pak, target / 'locales' / pak.name)
    shutil.copytree(output / 'default_apps', target / 'default_apps')
    shutil.copy2(PLATFORM / 'rail', target / 'rail')
    (target / 'rail').chmod(0o755)
    shutil.copy2(PLATFORM / 'rail.desktop', target / 'rail.desktop')
    for size in ICON_SIZES:
        shutil.copy2(BRANDING / f'product_logo_{size}.png', target / f'product_logo_{size}.png')


def make_tarball(payload, name, destination):
    archive = destination / f'{name}.tar.xz'
    with tempfile.TemporaryDirectory(prefix='rail-tar-', dir=destination) as tmp:
        top = Path(tmp) / name
        shutil.copytree(payload, top, symlinks=True)
        subprocess.run(['tar', '--owner=0', '--group=0', '--numeric-owner',
                        '-I', 'xz -T0 -9', '-cf', str(archive), '-C', tmp, name],
                       check=True)
    return archive


def make_appimage(payload, name, destination, appimagetool):
    image = destination / f'{name}.AppImage'
    with tempfile.TemporaryDirectory(prefix='rail-appdir-', dir=destination) as tmp:
        appdir = Path(tmp) / 'Rail.AppDir'
        shutil.copytree(payload, appdir / INSTALL_DIR, symlinks=True)
        (appdir / 'AppRun').symlink_to(INSTALL_DIR / 'rail')
        shutil.copy2(PLATFORM / 'rail.desktop', appdir / 'rail.desktop')
        shutil.copy2(BRANDING / 'product_logo_256.png', appdir / 'rail.png')
        (appdir / '.DirIcon').symlink_to('rail.png')
        for size in ICON_SIZES:
            icons = appdir / 'usr' / 'share' / 'icons' / 'hicolor' / f'{size}x{size}' / 'apps'
            icons.mkdir(parents=True)
            shutil.copy2(BRANDING / f'product_logo_{size}.png', icons / 'rail.png')
        env = os.environ.copy()
        env['ARCH'] = ARCH
        env['APPIMAGE_EXTRACT_AND_RUN'] = '1'
        subprocess.run([appimagetool, '--no-appstream', str(appdir), str(image)],
                       check=True, env=env)
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--output', type=Path,
                        default=ROOT / 'build' / 'src' / 'out' / 'Release')
    parser.add_argument('--assets', type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
        parser.error('version must be MAJOR.MINOR.PATCH')
    if not (args.output / 'chrome').is_file():
        parser.error(f'build chrome in {args.output} first')
    if not STRIP.is_file():
        parser.error('Chromium clang is missing; run platform/linux/prepare.py')
    appimagetool = shutil.which('appimagetool')
    if appimagetool is None:
        parser.error('appimagetool is missing; run platform/linux/host-deps.sh')
    assets = args.assets or ROOT / 'build' / 'release' / 'linux' / args.version
    if assets.exists():
        shutil.rmtree(assets)
    assets.mkdir(parents=True)
    name = f'Rail-{args.version}-{ARCH}'
    with tempfile.TemporaryDirectory(prefix='rail-package-', dir=assets.parent) as tmp:
        payload = Path(tmp) / 'rail'
        stage_payload(args.output, payload)
        make_tarball(payload, f'{name}-linux', assets)
        make_appimage(payload, name, assets, appimagetool)
    print(assets)


if __name__ == '__main__':
    main()
