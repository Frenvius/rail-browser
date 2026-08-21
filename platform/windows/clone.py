#!/usr/bin/env python3
"""Run the pinned clone utility without Windows text-mode patch corruption.

Python's text-mode subprocess stdin translates LF to CRLF on Windows. `git
apply` treats those CR bytes as patch context, so an otherwise valid patch does
not apply. Keep the upstream module untouched and adapt only its subprocess
boundary by sending patch input as bytes.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
UTILS = ROOT / "ungoogled-chromium" / "utils"
UPSTREAM_CLONE = UTILS / "clone.py"


def _install_python3_shim() -> None:
    """Expose the active venv interpreter under depot_tools' expected name."""
    shim_dir = ROOT / "build" / "tool_shims"
    shim_dir.mkdir(parents=True, exist_ok=True)
    python3 = shim_dir / "python3.bat"
    python3.write_text(f'@"{sys.executable}" %*\n', encoding="utf-8")
    os.environ["PATH"] = str(shim_dir) + os.pathsep + os.environ["PATH"]


def _load_upstream_clone():
    sys.path.insert(0, str(UTILS))
    spec = importlib.util.spec_from_file_location("ungoogled_clone", UPSTREAM_CLONE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {UPSTREAM_CLONE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _windows_safe_run(*popenargs, **kwargs):
    command = popenargs[0] if popenargs else kwargs.get("args")
    patch_input = kwargs.get("input")
    is_git_apply = (
        isinstance(command, (list, tuple))
        and len(command) >= 2
        and command[0] == "git"
        and command[1] == "apply"
    )
    if is_git_apply and isinstance(patch_input, str):
        kwargs["input"] = patch_input.encode(kwargs.get("encoding") or "utf-8")
        kwargs.pop("encoding", None)
        kwargs.pop("universal_newlines", None)
        kwargs.pop("text", None)
    return subprocess.run(*popenargs, **kwargs)


def main() -> None:
    _install_python3_shim()
    clone_module = _load_upstream_clone()
    clone_module.run = _windows_safe_run
    clone_module.main()


if __name__ == "__main__":
    main()
