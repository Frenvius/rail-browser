import argparse
import re
import subprocess
import sys
from pathlib import Path


def file_sections(patch):
    sections = {}
    for part in re.split(r'(?m)^(?=diff --git )', patch.read_text(encoding='utf-8')):
        match = re.match(r'diff --git a/\S+ b/(\S+)', part)
        if match:
            sections[match.group(1)] = part
    return sections


def git_apply(tree, patch, files, *options):
    includes = [f'--include={name}' for name in files]
    command = ['git', '-C', str(tree), 'apply', *options, *includes,
               str(patch.resolve())]
    return subprocess.run(command).returncode == 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', type=Path, required=True)
    parser.add_argument('--previous', type=Path, required=True)
    parser.add_argument('--current', type=Path, required=True)
    args = parser.parse_args()
    previous = file_sections(args.previous)
    current = file_sections(args.current)
    changed = sorted(name for name in previous.keys() | current.keys()
                     if previous.get(name) != current.get(name))
    if not changed:
        print('rail-shell.patch: no file changed')
        return 0
    print('rail-shell.patch: updating', ', '.join(changed))
    removed = [name for name in changed if name in previous]
    added = [name for name in changed if name in current]
    if removed and not git_apply(args.tree, args.previous, removed, '--reverse'):
        print('the previous rail-shell.patch does not reverse cleanly',
              file=sys.stderr)
        return 1
    if added and not git_apply(args.tree, args.current, added):
        if removed:
            git_apply(args.tree, args.previous, removed)
        print('rail-shell.patch does not apply over the prepared tree; '
              'restored the previous one', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
