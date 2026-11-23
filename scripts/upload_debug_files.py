import argparse
import gzip
import hashlib
import http.client
import importlib.util
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
RELEASE_LIST = ROOT / 'build' / 'src' / 'chrome' / 'installer' / 'mini_installer' / 'chrome.release'
PLATFORMS = ('windows-x64', 'windows-arm64', 'macos-arm64', 'macos-x64', 'linux-x64', 'linux-arm64')
WINDOWS_REQUIRED = ('chrome.exe', 'chrome.dll')
WINDOWS_WITHOUT_PDB = ('d3dcompiler_47.dll',)
PART_SIZE = 64 << 20
ATTEMPTS = 3
TIMEOUT = 600


class UploadError(Exception):
    pass


class RetryableError(Exception):
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


def connect(server):
    parts = urlsplit(server)
    factory = http.client.HTTPSConnection if parts.scheme == 'https' else http.client.HTTPConnection
    return factory(parts.netloc, timeout=TIMEOUT), parts.path.rstrip('/')


def send(server, token, method, path, body=None, headers=None):
    connection, prefix = connect(server)
    try:
        request_headers = {'Authorization': 'Bearer ' + token}
        request_headers.update(headers or {})
        connection.request(method, prefix + path, body=body, headers=request_headers)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def send_retrying(server, token, method, path, body=None, headers=None, verify=None):
    for attempt in range(1, ATTEMPTS + 1):
        try:
            status, payload = send(server, token, method, path, body=body, headers=headers)
            if status >= 500:
                raise RetryableError('HTTP {}: {}'.format(status, payload[:200].decode('utf-8', 'replace')))
            if verify:
                verify(status, payload)
            return status, payload
        except (OSError, http.client.HTTPException, RetryableError) as error:
            if attempt == ATTEMPTS:
                raise UploadError('{} {}: {}'.format(method, path, error))
            print('retry {}/{} {} {}: {}'.format(attempt, ATTEMPTS - 1, method, path, error), file=sys.stderr)
            time.sleep(2 ** attempt)


def read_parts(path):
    with path.open('rb') as source:
        while True:
            block = source.read(PART_SIZE)
            if not block:
                break
            yield block


def put_part(server, token, file_base, index, block):
    expected = hashlib.sha256(block).hexdigest()
    body = gzip.compress(block, 6, mtime=0)
    headers = {'Content-Encoding': 'gzip', 'Content-Type': 'application/octet-stream'}
    if len(body) >= len(block):
        body = block
        headers = {'Content-Type': 'application/octet-stream'}
    def verify(status, payload):
        if status != 201:
            raise UploadError('part {} HTTP {}: {}'.format(index, status, payload[:200].decode('utf-8', 'replace')))
        remote = json.loads(payload).get('sha256')
        if remote != expected:
            raise RetryableError('sha256 mismatch: local {} remote {}'.format(expected, remote))

    send_retrying(server, token, 'PUT', '{}/parts/{}'.format(file_base, index), body=body,
                  headers=headers, verify=verify)


def upload(server, token, base, path):
    file_base = base + '/files/' + quote(path.name, safe='')
    digest = hashlib.sha256()
    total = 0
    count = 0
    for block in read_parts(path):
        put_part(server, token, file_base, count, block)
        digest.update(block)
        total += len(block)
        count += 1
    if count == 0:
        raise UploadError('{} is empty'.format(path.name))
    body = json.dumps({'parts': count, 'size': total, 'sha256': digest.hexdigest()}).encode('utf-8')
    status, payload = send_retrying(server, token, 'POST', file_base + '/complete', body=body,
                                    headers={'Content-Type': 'application/json'})
    if status != 201:
        raise UploadError('complete HTTP {}: {}'.format(status, payload[:200].decode('utf-8', 'replace')))
    return count


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
            parts = upload(args.server, token, base, path)
        except (OSError, http.client.HTTPException, UploadError) as error:
            print('FAILED {}: {}'.format(path.name, error), file=sys.stderr)
            return 1
        print('{} {} bytes {} parts {:.1f}s'.format(path.name, path.stat().st_size, parts, time.monotonic() - started))
    try:
        status, payload = send_retrying(args.server, token, 'POST', base + '/process')
    except UploadError as error:
        print('process failed: {}'.format(error), file=sys.stderr)
        return 1
    if status != 202:
        print('process failed: HTTP {}: {}'.format(status, payload[:200].decode('utf-8', 'replace')), file=sys.stderr)
        return 1
    print('process accepted')
    return 0


if __name__ == '__main__':
    sys.exit(main())
