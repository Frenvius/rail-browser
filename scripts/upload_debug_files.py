import argparse
import hashlib
import http.client
import importlib.util
import json
import os
import sys
import time
import zlib
from pathlib import Path
from urllib.parse import quote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
RELEASE_LIST = ROOT / 'build' / 'src' / 'chrome' / 'installer' / 'mini_installer' / 'chrome.release'
PLATFORMS = ('windows-x64', 'windows-arm64', 'macos-arm64', 'macos-x64', 'linux-x64', 'linux-arm64')
WINDOWS_REQUIRED = ('chrome.exe', 'chrome.dll')
WINDOWS_WITHOUT_PDB = ('d3dcompiler_47.dll',)
CHUNK = 1 << 20
ATTEMPTS = 3
TIMEOUT = 600


class UploadError(Exception):
    pass


def windows_files(out_dir, release_list):
    listed = []
    for line in release_list.read_text(encoding='utf-8').splitlines():
        entry = line.split(':', 1)[0].strip()
        if line.startswith(('#', '[')) or ':' not in line:
            continue
        if '\\' in entry or '/' in entry or '*' in entry:
            continue
        if entry.lower().endswith(('.dll', '.exe')) and entry not in listed:
            listed.append(entry)
    missing = [name for name in WINDOWS_REQUIRED if name in listed and not (out_dir / name).is_file()]
    files = []
    for name in listed:
        binary = out_dir / name
        if not binary.is_file():
            continue
        files.append(binary)
        if name.lower() in WINDOWS_WITHOUT_PDB:
            continue
        pdb = out_dir / (name + '.pdb')
        if pdb.is_file():
            files.append(pdb)
        else:
            missing.append(pdb.name)
    return files, missing


def macos_files(out_dir):
    bundles = sorted(path for path in out_dir.glob('*.dSYM') if path.is_dir())
    files = []
    missing = []
    for bundle in bundles:
        found = sorted(path for path in (bundle / 'Contents' / 'Resources' / 'DWARF').glob('*') if path.is_file())
        if found:
            files.extend(found)
        else:
            missing.append(str(bundle.name) + '/Contents/Resources/DWARF/*')
    if not bundles:
        missing.append('*.dSYM')
    return files, missing


def linux_files(out_dir):
    spec = importlib.util.spec_from_file_location('rail_linux_package', ROOT / 'platform' / 'linux' / 'package.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    files = []
    missing = []
    for name in module.EXECUTABLES:
        path = out_dir / name
        if path.is_file():
            files.append(path)
        else:
            missing.append(name)
    return files, missing


def collect(platform, out_dir, release_list):
    if platform.startswith('windows-'):
        return windows_files(out_dir, release_list)
    if platform.startswith('macos-'):
        return macos_files(out_dir)
    return linux_files(out_dir)


def compressed_chunks(path, digest):
    packer = zlib.compressobj(6, zlib.DEFLATED, 31)
    with path.open('rb') as source:
        while True:
            block = source.read(CHUNK)
            if not block:
                break
            digest.update(block)
            packed = packer.compress(block)
            if packed:
                yield packed
    tail = packer.flush()
    if tail:
        yield tail


def connect(server):
    parts = urlsplit(server)
    factory = http.client.HTTPSConnection if parts.scheme == 'https' else http.client.HTTPConnection
    return factory(parts.netloc, timeout=TIMEOUT), parts.path.rstrip('/')


def send(server, token, method, path, body=None, headers=None):
    connection, prefix = connect(server)
    try:
        request_headers = {'Authorization': 'Bearer ' + token}
        request_headers.update(headers or {})
        connection.request(method, prefix + path, body=body, headers=request_headers,
                           encode_chunked=body is not None)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def upload_once(server, token, base, path):
    digest = hashlib.sha256()
    status, payload = send(
        server, token, 'PUT', base + '/files/' + quote(path.name, safe=''),
        body=compressed_chunks(path, digest),
        headers={'Content-Encoding': 'gzip', 'Content-Type': 'application/octet-stream'})
    if status != 201:
        raise UploadError('HTTP {}: {}'.format(status, payload[:200].decode('utf-8', 'replace')), status)
    reply = json.loads(payload)
    expected = digest.hexdigest()
    if reply.get('sha256') != expected:
        raise UploadError('sha256 mismatch: local {} remote {}'.format(expected, reply.get('sha256')), 0)
    return reply


def upload(server, token, base, path):
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return upload_once(server, token, base, path)
        except (OSError, http.client.HTTPException, UploadError) as error:
            status = error.args[1] if isinstance(error, UploadError) and len(error.args) > 1 else None
            retryable = not isinstance(error, UploadError) or status == 0 or (status or 0) >= 500
            if not retryable or attempt == ATTEMPTS:
                raise
            print('retry {}/{} {}: {}'.format(attempt, ATTEMPTS - 1, path.name, error), file=sys.stderr)
            time.sleep(2 ** attempt)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--platform', required=True, choices=PLATFORMS)
    parser.add_argument('--out-dir', required=True, type=Path)
    parser.add_argument('--release-list', type=Path, default=RELEASE_LIST)
    args = parser.parse_args()
    token = os.environ.get('CRASH_SYMBOL_TOKEN', '')
    if not token:
        parser.error('CRASH_SYMBOL_TOKEN is not set')
    if not args.out_dir.is_dir():
        parser.error('{} is not a directory'.format(args.out_dir))
    if args.platform.startswith('windows-') and not args.release_list.is_file():
        parser.error('{} not found'.format(args.release_list))
    files, missing = collect(args.platform, args.out_dir, args.release_list)
    if missing:
        print('missing debug files in {}:'.format(args.out_dir), file=sys.stderr)
        for name in missing:
            print('  ' + name, file=sys.stderr)
        return 1
    if not files:
        print('no debug files found in {}'.format(args.out_dir), file=sys.stderr)
        return 1
    base = '/api/builds/{}/{}'.format(quote(args.build, safe=''), args.platform)
    for path in files:
        started = time.monotonic()
        try:
            upload(args.server, token, base, path)
        except (OSError, http.client.HTTPException, UploadError) as error:
            print('FAILED {}: {}'.format(path.name, error), file=sys.stderr)
            return 1
        print('{} {} bytes {:.1f}s'.format(path.name, path.stat().st_size, time.monotonic() - started))
    status, payload = send(args.server, token, 'POST', base + '/process')
    if status != 202:
        print('process failed: HTTP {}: {}'.format(status, payload[:200].decode('utf-8', 'replace')), file=sys.stderr)
        return 1
    print('process accepted')
    return 0


if __name__ == '__main__':
    sys.exit(main())
