from __future__ import annotations

import shutil
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: finalize_build.py <dist-dir>")
        return 2
    dist = Path(sys.argv[1]).resolve()
    source = dist / "Grace-PHP-Host-Backup.exe"
    if not source.is_file():
        raise FileNotFoundError(source)
    target = dist / "恩典PHP主机一键备份.exe"
    shutil.copy2(source, target)
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
