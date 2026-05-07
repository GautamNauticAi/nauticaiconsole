#!/usr/bin/env python3
"""
Debian/Ubuntu + venv --system-site-packages can leave /usr/lib/python3/dist-packages
ahead of the venv on sys.path, so pip-installed packages (e.g. requests) are shadowed.

Writes a one-line import hook into this venv's site-packages as a .pth file; Python
runs it at startup and moves the venv site dir immediately after '' (cwd) if present.
"""
from __future__ import annotations

import os
import pathlib
import sys


def main() -> int:
    venv = os.environ.get("VIRTUAL_ENV")
    if not venv:
        print("jetson_ensure_venv_site_first: VIRTUAL_ENV unset; nothing to do", file=sys.stderr)
        return 0

    ver = f"{sys.version_info.major}.{sys.version_info.minor}"
    site_packages = pathlib.Path(venv) / "lib" / f"python{ver}" / "site-packages"
    if not site_packages.is_dir():
        print(f"jetson_ensure_venv_site_first: missing {site_packages}", file=sys.stderr)
        return 1

    pth = site_packages / "_nauticaivenv_site_first.pth"
    p = str(site_packages)
    # Executed by site.py when processing .pth files (must be one logical line).
    line = (
        "import sys; _p=%r; "
        "_ = sys.path.remove(_p) if _p in sys.path else None; "
        "_i = 1 if sys.path[:1] == [''] else 0; "
        "sys.path.insert(_i, _p)\n"
    ) % p
    pth.write_text(line, encoding="utf-8")
    print(f"jetson_ensure_venv_site_first: wrote {pth}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
