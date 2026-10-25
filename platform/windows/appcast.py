import argparse
import base64
import email.utils
import os
import xml.etree.ElementTree as ET
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

SPARKLE_NAMESPACE = 'http://www.andymatuschak.org/xml-namespaces/sparkle'
PUBLIC_KEY_PATH = Path(__file__).resolve().parent / 'update_public_key.txt'


def load_signing_key(variable):
    seed = os.environ.get(variable)
    if not seed:
        raise SystemExit('{} is not set'.format(variable))
    key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(seed))
    public_key = base64.b64encode(
        key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode('ascii')
    if public_key != PUBLIC_KEY_PATH.read_text(encoding='utf-8').strip():
        raise SystemExit('{} does not match {}'.format(variable, PUBLIC_KEY_PATH.name))
    return key


def build_appcast(installer, version, repository, key):
    tag = 'v' + version
    sparkle = '{' + SPARKLE_NAMESPACE + '}'
    ET.register_namespace('sparkle', SPARKLE_NAMESPACE)

    rss = ET.Element('rss', {'version': '2.0'})
    channel = ET.SubElement(rss, 'channel')
    ET.SubElement(channel, 'title').text = 'Rail'
    item = ET.SubElement(channel, 'item')
    ET.SubElement(item, 'title').text = 'Rail ' + version
    ET.SubElement(item, 'pubDate').text = email.utils.formatdate(usegmt=True)
    ET.SubElement(item, sparkle + 'version').text = version
    ET.SubElement(item, sparkle + 'releaseNotesLink').text = (
        'https://github.com/{}/releases/tag/{}'.format(repository, tag))
    payload = installer.read_bytes()
    ET.SubElement(item, 'enclosure', {
        'url': 'https://github.com/{}/releases/download/{}/{}'.format(
            repository, tag, installer.name),
        'length': str(len(payload)),
        'type': 'application/octet-stream',
        sparkle + 'os': 'windows',
        sparkle + 'edSignature': base64.b64encode(key.sign(payload)).decode('ascii'),
    })
    ET.indent(rss)
    return ET.tostring(rss, encoding='utf-8', xml_declaration=True)


def main():
    parser = argparse.ArgumentParser(description='Write a signed update feed for one Rail release')
    parser.add_argument('--installer', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--key-variable', default='RAIL_UPDATE_ED25519_KEY')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()

    key = load_signing_key(args.key_variable)
    args.output.write_bytes(build_appcast(args.installer, args.version, args.repository, key))


if __name__ == '__main__':
    main()
