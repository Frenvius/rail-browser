import tempfile
import plistlib
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import package
from package import SPARKLE_NAMESPACE, build_appcast, sha256_file


class PackageTest(unittest.TestCase):
    def test_package_uses_ad_hoc_signing_and_writes_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output = root / 'out'
            signer = output / 'Rail Packaging' / 'sign_chrome.py'
            signer.parent.mkdir(parents=True)
            signer.touch()
            bundled = output / 'Rail.app' / 'Contents' / 'MacOS' / 'default_apps'
            bundled.mkdir(parents=True)
            (bundled / 'uBlock.crx').write_bytes(b'crx')
            (output / 'Rail.app' / 'Contents' / 'Resources').mkdir()
            (output / 'Rail.app' / 'Contents' / 'Info.plist').write_bytes(
                plistlib.dumps({'CFBundleIconFile': 'app.icns',
                                'CFBundleIconName': 'AppIcon'}))
            icon = root / 'branding' / 'chrome' / 'app' / 'theme' / 'chromium' / 'mac' / 'app.icns'
            icon.parent.mkdir(parents=True)
            icon.write_bytes(b'rail-icon')
            source = root / 'build' / 'download_cache' / f'uBlock-{package._UBLOCK_VERSION}.tar.gz'
            source.parent.mkdir(parents=True)
            source.write_bytes(b'source')
            instructions = root / 'platform' / 'macos' / 'INSTALL.txt'
            instructions.parent.mkdir(parents=True)
            instructions.write_text('Open Anyway', encoding='utf-8')
            (instructions.parent / 'dmg_background.png').write_bytes(b'png')
            (instructions.parent / 'dmg_layout.DS_Store').write_bytes(b'layout')

            def package_command(command, check, **kwargs):
                self.assertTrue(check)
                if command[0] == 'hdiutil':
                    if command[1] == 'create':
                        self.assertIn('-ov', command)
                        volume = Path(command[command.index('-srcfolder') + 1])
                        self.assertTrue((volume / 'Applications').is_symlink())
                        self.assertEqual((volume / '.background' / 'background.png').read_bytes(), b'png')
                        self.assertEqual((volume / '.DS_Store').read_bytes(), b'layout')
                        Path(command[-1]).write_bytes(b'dmg')
                    return
                self.assertEqual(command[-4:],
                                 ['--identity', '-', '--ad-hoc', '--disable-packaging'])
                staged = Path(command[command.index('--input') + 1])
                self.assertEqual((staged / 'Rail.app' / 'Contents' / 'Resources' /
                                  'app.icns').read_bytes(), b'rail-icon')
                info = plistlib.loads((staged / 'Rail.app' / 'Contents' /
                                       'Info.plist').read_bytes())
                self.assertEqual(info['CFBundleIconFile'], 'app.icns')
                self.assertNotIn('CFBundleIconName', info)
                moved = staged / 'Rail.app' / 'Contents' / 'MacOS' / 'default_apps'
                self.assertTrue(moved.is_symlink())
                self.assertEqual(moved.readlink(), Path('../Resources/default_apps'))
                self.assertEqual((moved.parent / moved.readlink() / 'uBlock.crx').read_bytes(), b'crx')
                destination = Path(command[command.index('--output') + 1])
                (destination / 'stable' / 'Rail.app').mkdir(parents=True)

            with patch.object(package, 'ROOT', root), \
                 patch.object(package, 'OUTPUT', output), \
                 patch.object(package.subprocess, 'run', side_effect=package_command), \
                 patch.object(package.sys, 'argv', ['package.py', '--version', '0.2.0']):
                package.main()

            assets = root / 'build' / 'release' / 'mac' / '0.2.0'
            self.assertEqual((assets / 'Rail-0.2.0-macos-arm64.dmg').read_bytes(), b'dmg')
            self.assertEqual((assets / 'INSTALL-macOS.txt').read_text(), 'Open Anyway')
            self.assertIn('Rail-0.2.0-macos-arm64.dmg',
                          (assets / 'SHA256SUMS-macos').read_text())

    def test_mac_feed_targets_the_mac_dmg(self):
        with tempfile.TemporaryDirectory() as tmp:
            dmg = Path(tmp) / 'Rail-0.2.0-macos-arm64.dmg'
            dmg.write_bytes(b'dmg')
            rss = ET.fromstring(build_appcast('0.2.0', 'Frenvius/rail-browser', dmg))
            item = rss.find('channel/item')
            self.assertEqual(item.find('{' + SPARKLE_NAMESPACE + '}version').text,
                             '0.2.0')
            enclosure = item.find('enclosure')
            self.assertEqual(enclosure.attrib['{' + SPARKLE_NAMESPACE + '}os'],
                             'macos')
            self.assertEqual(enclosure.attrib['length'], '3')
            self.assertEqual(enclosure.attrib['url'],
                             'https://github.com/Frenvius/rail-browser/releases/'
                             'download/v0.2.0/Rail-0.2.0-macos-arm64.dmg')
            self.assertEqual(sha256_file(dmg),
                             '00cbbd0ddbda2762798f7009838ed34ca1f12b93965813c7df22943bc62166d1')


if __name__ == '__main__':
    unittest.main()
