import argparse
import email.utils
import hashlib
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from build import _UBLOCK_VERSION

OUTPUT = ROOT / 'build' / 'src' / 'out' / 'RailRelease'
SPARKLE_NAMESPACE = 'http://www.andymatuschak.org/xml-namespaces/sparkle'


def build_appcast(version, repository, dmg):
    ET.register_namespace('sparkle', SPARKLE_NAMESPACE)
    rss = ET.Element('rss', {'version': '2.0'})
    channel = ET.SubElement(rss, 'channel')
    ET.SubElement(channel, 'title').text = 'Rail for macOS'
    item = ET.SubElement(channel, 'item')
    ET.SubElement(item, 'title').text = 'Rail ' + version
    ET.SubElement(item, 'pubDate').text = email.utils.formatdate(usegmt=True)
    ET.SubElement(item, '{' + SPARKLE_NAMESPACE + '}version').text = version
    ET.SubElement(item, 'enclosure', {
        'url': f'https://github.com/{repository}/releases/download/v{version}/{dmg.name}',
        'length': str(dmg.stat().st_size),
        'type': 'application/octet-stream',
        '{' + SPARKLE_NAMESPACE + '}os': 'macos',
    })
    ET.indent(rss)
    return ET.tostring(rss, encoding='utf-8', xml_declaration=True)


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--repository', default='Frenvius/rail-browser')
    args = parser.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
        parser.error('version must be MAJOR.MINOR.PATCH')
    signer = OUTPUT / 'Rail Packaging' / 'sign_chrome.py'
    if not signer.is_file():
        parser.error('build chrome and chrome/installer/mac:mac first')
    source = ROOT / 'build' / 'download_cache' / f'uBlock-{_UBLOCK_VERSION}.tar.gz'
    if not source.is_file():
        parser.error(f'missing {source}')
    assets = ROOT / 'build' / 'release' / 'mac' / args.version
    assets.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix='rail-package-', dir=assets.parent) as tmp:
        staged = Path(tmp) / 'input'
        shutil.copytree(OUTPUT / 'Rail.app', staged / 'Rail.app', symlinks=True)
        shutil.copytree(OUTPUT / 'Rail Packaging', staged / 'Rail Packaging',
                        symlinks=True)
        shutil.copy2(ROOT / 'branding' / 'chrome' / 'app' / 'theme' /
                     'chromium' / 'mac' / 'app.icns',
                     staged / 'Rail.app' / 'Contents' / 'Resources' / 'app.icns')
        info_path = staged / 'Rail.app' / 'Contents' / 'Info.plist'
        with info_path.open('rb') as file:
            info = plistlib.load(file)
        info.pop('CFBundleIconName', None)
        with info_path.open('wb') as file:
            plistlib.dump(info, file)
        bundled = staged / 'Rail.app' / 'Contents' / 'MacOS' / 'default_apps'
        bundled.rename(staged / 'Rail.app' / 'Contents' / 'Resources' / 'default_apps')
        bundled.symlink_to('../Resources/default_apps', target_is_directory=True)
        signed = Path(tmp) / 'signed'
        subprocess.run([
            str(ROOT / '.venv' / 'bin' / 'python'), str(signer),
            '--input', str(staged), '--output', str(signed),
            '--identity', '-', '--ad-hoc', '--disable-packaging',
        ], check=True)
        apps = list(signed.glob('*/Rail.app'))
        if len(apps) != 1:
            raise RuntimeError(f'expected one signed Rail.app, found {len(apps)}')
        volume = Path(tmp) / 'volume'
        volume.mkdir()
        shutil.move(apps[0], volume / 'Rail.app')
        (volume / 'Applications').symlink_to('/Applications', target_is_directory=True)
        (volume / '.background').mkdir()
        shutil.copy2(ROOT / 'platform' / 'macos' / 'dmg_background.png',
                     volume / '.background' / 'background.png')
        shutil.copy2(ROOT / 'platform' / 'macos' / 'dmg_layout.DS_Store',
                     volume / '.DS_Store')
        dmg = assets / f'Rail-{args.version}-macos-arm64.dmg'
        subprocess.run(['hdiutil', 'create', '-quiet', '-ov', '-volname', 'Rail',
                        '-srcfolder', str(volume), '-format', 'UDZO', str(dmg)],
                       check=True)
        subprocess.run(['hdiutil', 'verify', str(dmg)], check=True,
                       stdout=subprocess.DEVNULL)

    feed = assets / 'macos-appcast.xml'
    feed.write_bytes(build_appcast(args.version, args.repository, dmg))
    shutil.copy2(source, assets / f'uBlock-{_UBLOCK_VERSION}-source.tar.gz')
    instructions = assets / 'INSTALL-macOS.txt'
    shutil.copy2(ROOT / 'platform' / 'macos' / 'INSTALL.txt', instructions)
    files = [dmg, feed, instructions]
    sums = assets / 'SHA256SUMS-macos'
    sums.write_text(''.join(
        f'{sha256_file(path)}  {path.name}\n'
        for path in files), encoding='utf-8')
    print(assets)


if __name__ == '__main__':
    main()
