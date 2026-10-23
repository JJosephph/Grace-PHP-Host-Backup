from __future__ import annotations

import argparse
import base64
import ctypes
import ctypes.wintypes
import datetime as dt
import ftplib
import json
import os
import posixpath
import queue
import re
import shutil
import ssl
import sys
import tempfile
import threading
import time
import traceback
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Iterable

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText


APP_NAME = "恩典 PHP 主机一键备份"
APP_VERSION = "0.1.0"
CONFIG_FILE_NAME = "grace-php-host-backup.json"
BLOCK_SIZE = 1024 * 1024


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def app_directory() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def data_directory() -> Path:
    preferred = app_directory()
    try:
        probe = preferred / ".write-test"
        probe.write_text("", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return preferred
    except OSError:
        fallback = Path(os.environ.get("APPDATA", str(Path.home()))) / "GracePhpHostBackup"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def config_path() -> Path:
    return data_directory() / CONFIG_FILE_NAME


def log_directory() -> Path:
    path = data_directory() / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def now_text() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def human_bytes(value: float) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(max(0, value))
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    if index == 0:
        return f"{int(size)} {units[index]}"
    return f"{size:.2f} {units[index]}"


def normalize_remote(path: str) -> str:
    path = (path or "/").replace("\\", "/").strip()
    if not path:
        path = "/"
    if not path.startswith("/"):
        path = "/" + path
    normalized = posixpath.normpath(path)
    return "/" if normalized == "." else normalized


def join_remote(root: str, relative: str) -> str:
    relative = relative.replace("\\", "/").strip("/")
    if not relative:
        return normalize_remote(root)
    return normalize_remote(posixpath.join(normalize_remote(root), relative))


def relative_posix(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def should_exclude(relative: str, patterns: Iterable[str]) -> bool:
    rel = relative.replace("\\", "/").strip("/")
    for raw in patterns:
        pattern = raw.strip().replace("\\", "/").strip("/")
        if not pattern:
            continue
        if pattern.endswith("/"):
            pattern = pattern.rstrip("/")
        if rel == pattern or rel.startswith(pattern + "/"):
            return True
        if fnmatch_path(rel, pattern):
            return True
    return False


def fnmatch_path(value: str, pattern: str) -> bool:
    if "*" not in pattern and "?" not in pattern:
        return False
    escaped = re.escape(pattern).replace(r"\*", ".*").replace(r"\?", ".")
    return re.fullmatch(escaped, value) is not None


class SecretStore:
    ENTROPY = b"Grace-PHP-Host-Backup-v0.1"

    class DataBlob(ctypes.Structure):
        _fields_ = [
            ("cbData", ctypes.wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_char)),
        ]

    @classmethod
    def protect(cls, text: str) -> str:
        if not text:
            return ""
        data = text.encode("utf-8")
        if os.name != "nt":
            return "plain:" + base64.b64encode(data).decode("ascii")
        try:
            in_blob, in_buffer = cls._blob(data)
            entropy_blob, entropy_buffer = cls._blob(cls.ENTROPY)
            out_blob = cls.DataBlob()
            if not ctypes.windll.crypt32.CryptProtectData(
                ctypes.byref(in_blob),
                "Grace PHP Host Backup",
                ctypes.byref(entropy_blob),
                None,
                None,
                0x01,
                ctypes.byref(out_blob),
            ):
                raise OSError("CryptProtectData failed")
            try:
                encrypted = ctypes.string_at(out_blob.pbData, out_blob.cbData)
            finally:
                ctypes.windll.kernel32.LocalFree(out_blob.pbData)
            del in_buffer, entropy_buffer
            return "dpapi:" + base64.b64encode(encrypted).decode("ascii")
        except Exception:
            return "plain:" + base64.b64encode(data).decode("ascii")

    @classmethod
    def unprotect(cls, value: str) -> str:
        if not value:
            return ""
        try:
            prefix, payload = value.split(":", 1)
            data = base64.b64decode(payload)
            if prefix == "plain":
                return data.decode("utf-8")
            if prefix != "dpapi" or os.name != "nt":
                return ""
            in_blob, in_buffer = cls._blob(data)
            entropy_blob, entropy_buffer = cls._blob(cls.ENTROPY)
            out_blob = cls.DataBlob()
            if not ctypes.windll.crypt32.CryptUnprotectData(
                ctypes.byref(in_blob),
                None,
                ctypes.byref(entropy_blob),
                None,
                None,
                0x01,
                ctypes.byref(out_blob),
            ):
                raise OSError("CryptUnprotectData failed")
            try:
                decrypted = ctypes.string_at(out_blob.pbData, out_blob.cbData)
            finally:
                ctypes.windll.kernel32.LocalFree(out_blob.pbData)
            del in_buffer, entropy_buffer
            return decrypted.decode("utf-8")
        except Exception:
            return ""

    @classmethod
    def _blob(cls, data: bytes) -> tuple[DataBlob, ctypes.Array]:
        buffer = ctypes.create_string_buffer(data)
        blob = cls.DataBlob(
            len(data),
            ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)),
        )
        return blob, buffer


@dataclass
class AppConfig:
    host: str = ""
    port: int = 21
    username: str = ""
    password_encrypted: str = ""
    remember_password: bool = False
    remote_root: str = "/"
    passive: bool = True
    tls: bool = False
    local_root: str = ""
    timestamp_folder: bool = True
    compare_mtime: bool = False
    retries: int = 3
    timeout: int = 60
    exclude_patterns: list[str] = field(
        default_factory=lambda: [
            ".git",
            "var/cache",
            "var/tmp",
            "sql_backup/static_backup_work",
        ]
    )

    @classmethod
    def load(cls, path: Path | None = None) -> "AppConfig":
        path = path or config_path()
        if not path.is_file():
            return cls()
        try:
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
            allowed = {item.name for item in cls.__dataclass_fields__.values()}
            values = {key: value for key, value in raw.items() if key in allowed}
            config = cls(**values)
            config.port = int(config.port)
            config.retries = max(0, min(20, int(config.retries)))
            config.timeout = max(10, min(3600, int(config.timeout)))
            config.remote_root = normalize_remote(config.remote_root)
            if not isinstance(config.exclude_patterns, list):
                config.exclude_patterns = [str(config.exclude_patterns)]
            return config
        except Exception:
            return cls()

    def save(self, path: Path | None = None) -> None:
        path = path or config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = asdict(self)
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp, path)

    def password(self) -> str:
        return SecretStore.unprotect(self.password_encrypted)


@dataclass
class RemoteEntry:
    name: str
    path: str
    is_dir: bool
    size: int = 0
    mtime: float | None = None


@dataclass
class TransferTask:
    relative: str
    source: str
    target: str
    size: int
    mtime: float | None = None


class TransferCancelled(Exception):
    pass


class FtpClient:
    def __init__(self, config: AppConfig, log: Callable[[str], None]):
        self.config = config
        self.log = log
        self.ftp: ftplib.FTP | None = None

    def connect(self) -> None:
        self.close()
        if not self.config.host.strip():
            raise ValueError("请先填写 FTP 主机。")
        if not self.config.username.strip():
            raise ValueError("请先填写 FTP 用户名。")

        if self.config.tls:
            context = ssl.create_default_context()
            ftp: ftplib.FTP = ftplib.FTP_TLS(context=context)
        else:
            ftp = ftplib.FTP()

        ftp.encoding = "utf-8"
        ftp.connect(
            self.config.host.strip(),
            int(self.config.port),
            timeout=max(10, int(self.config.timeout)),
        )
        ftp.login(self.config.username.strip(), self.config.password())
        ftp.set_pasv(bool(self.config.passive))
        if isinstance(ftp, ftplib.FTP_TLS):
            ftp.prot_p()
        self.ftp = ftp

    def close(self) -> None:
        if self.ftp is not None:
            try:
                self.ftp.quit()
            except Exception:
                try:
                    self.ftp.close()
                except Exception:
                    pass
            self.ftp = None

    def ensure(self) -> ftplib.FTP:
        if self.ftp is None:
            self.connect()
        assert self.ftp is not None
        return self.ftp

    def list_dir(self, path: str) -> list[RemoteEntry]:
        ftp = self.ensure()
        remote_path = normalize_remote(path)
        entries: list[RemoteEntry] = []
        try:
            for name, facts in ftp.mlsd(remote_path):
                if name in (".", ".."):
                    continue
                kind = (facts.get("type") or "").lower()
                size = int(facts.get("size") or 0)
                mtime = parse_ftp_time(facts.get("modify"))
                entries.append(
                    RemoteEntry(
                        name=name,
                        path=join_remote(remote_path, name),
                        is_dir=kind in {"dir", "cdir", "pdir"},
                        size=size,
                        mtime=mtime,
                    )
                )
        except Exception:
            lines: list[str] = []
            ftp.retrlines("LIST " + remote_path, lines.append)
            entries = parse_list_lines(remote_path, lines)
        return entries

    def scan_remote(
        self,
        root: str,
        excludes: Iterable[str],
        cancel: threading.Event,
        progress: Callable[[str], None] | None = None,
    ) -> dict[str, RemoteEntry]:
        root = normalize_remote(root)
        found: dict[str, RemoteEntry] = {}
        queue_paths = [""]
        while queue_paths:
            if cancel.is_set():
                raise TransferCancelled()
            relative_dir = queue_paths.pop(0)
            remote_dir = join_remote(root, relative_dir)
            if progress:
                progress(remote_dir)
            for entry in self.list_dir(remote_dir):
                relative = (
                    entry.name if not relative_dir else f"{relative_dir}/{entry.name}"
                )
                relative = relative.replace("\\", "/").strip("/")
                if should_exclude(relative, excludes):
                    continue
                found[relative] = entry
                if entry.is_dir:
                    queue_paths.append(relative)
        return found

    def ensure_remote_dir(self, path: str) -> None:
        ftp = self.ensure()
        target = normalize_remote(path)
        if target == "/":
            return
        parts = [part for part in target.strip("/").split("/") if part]
        current = ""
        for part in parts:
            current = f"{current}/{part}" if current else f"/{part}"
            try:
                ftp.mkd(current)
            except ftplib.error_perm as exc:
                message = str(exc).lower()
                if "exist" not in message and "already" not in message:
                    try:
                        ftp.cwd(current)
                    except Exception:
                        raise

    def download_file(
        self,
        remote_path: str,
        local_path: Path,
        expected_size: int,
        cancel: threading.Event,
        chunk_callback: Callable[[int], None],
        mtime: float | None = None,
    ) -> None:
        ftp = self.ensure()
        local_path.parent.mkdir(parents=True, exist_ok=True)
        part = local_path.with_suffix(local_path.suffix + ".part")
        offset = part.stat().st_size if part.exists() else 0
        if offset > expected_size:
            part.unlink(missing_ok=True)
            offset = 0
        if expected_size and offset == expected_size:
            os.replace(part, local_path)
            set_local_mtime(local_path, mtime)
            return

        mode = "ab" if offset else "wb"
        with part.open(mode) as handle:
            def callback(data: bytes) -> None:
                if cancel.is_set():
                    raise TransferCancelled()
                handle.write(data)
                chunk_callback(len(data))

            ftp.retrbinary(
                "RETR " + remote_path,
                callback,
                blocksize=BLOCK_SIZE,
                rest=offset or None,
            )

        actual = part.stat().st_size
        if expected_size and actual != expected_size:
            raise IOError(
                f"下载大小不一致：{remote_path}，期望 {expected_size}，实际 {actual}"
            )
        os.replace(part, local_path)
        set_local_mtime(local_path, mtime)

    def upload_file(
        self,
        local_path: Path,
        remote_path: str,
        remote_size: int,
        cancel: threading.Event,
        chunk_callback: Callable[[int], None],
    ) -> None:
        ftp = self.ensure()
        local_size = local_path.stat().st_size
        offset = remote_size if 0 < remote_size < local_size else 0

        with local_path.open("rb") as handle:
            if offset:
                handle.seek(offset)

            def callback(data: bytes) -> None:
                if cancel.is_set():
                    raise TransferCancelled()
                if data:
                    chunk_callback(len(data))

            ftp.storbinary(
                "STOR " + remote_path,
                handle,
                blocksize=BLOCK_SIZE,
                callback=callback,
                rest=offset or None,
            )

        try:
            actual = ftp.size(remote_path)
        except Exception:
            actual = None
        if actual is not None and int(actual) != local_size:
            raise IOError(
                f"上传大小不一致：{remote_path}，期望 {local_size}，实际 {actual}"
            )


def parse_ftp_time(value: str | None) -> float | None:
    if not value:
        return None
    text = value.strip()
    for fmt in ("%Y%m%d%H%M%S", "%Y%m%d%H%M%S.%f"):
        try:
            parsed = dt.datetime.strptime(text, fmt).replace(tzinfo=dt.timezone.utc)
            return parsed.timestamp()
        except ValueError:
            pass
    return None


def parse_list_lines(root: str, lines: Iterable[str]) -> list[RemoteEntry]:
    entries: list[RemoteEntry] = []
    for line in lines:
        match = re.match(
            r"^([dl-])[rwxst-]{9}\s+\d+\s+\S+\s+\S+\s+(\d+)\s+"
            r"([A-Z][a-z]{2}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4}))\s+(.*)$",
            line,
        )
        if not match:
            continue
        name = match.group(4)
        if " -> " in name:
            name = name.split(" -> ", 1)[0]
        if name in (".", ".."):
            continue
        is_dir = match.group(1) == "d"
        size = int(match.group(2))
        entries.append(
            RemoteEntry(
                name=name,
                path=join_remote(root, name),
                is_dir=is_dir,
                size=size,
                mtime=parse_list_time(match.group(3)),
            )
        )
    return entries


def parse_list_time(value: str) -> float | None:
    now = dt.datetime.now()
    for fmt in ("%b %d %H:%M", "%b %d %Y"):
        try:
            parsed = dt.datetime.strptime(value.strip(), fmt)
            if "%Y" not in fmt:
                parsed = parsed.replace(year=now.year)
                if parsed > now + dt.timedelta(days=2):
                    parsed = parsed.replace(year=now.year - 1)
            return parsed.replace(tzinfo=dt.timezone.utc).timestamp()
        except ValueError:
            pass
    return None


def set_local_mtime(path: Path, timestamp: float | None) -> None:
    if timestamp is None:
        return
    try:
        os.utime(path, (timestamp, timestamp))
    except OSError:
        pass


def scan_local(
    root: Path,
    excludes: Iterable[str],
    cancel: threading.Event,
) -> dict[str, Path]:
    found: dict[str, Path] = {}
    if not root.exists():
        return found
    for current, dirs, files in os.walk(root):
        if cancel.is_set():
            raise TransferCancelled()
        current_path = Path(current)
        rel_dir = current_path.relative_to(root).as_posix()
        if rel_dir == ".":
            rel_dir = ""
        dirs[:] = [
            name
            for name in dirs
            if not should_exclude(f"{rel_dir}/{name}".strip("/"), excludes)
        ]
        for name in files:
            relative = f"{rel_dir}/{name}".strip("/")
            if should_exclude(relative, excludes):
                continue
            path = current_path / name
            if path.is_symlink() or not path.is_file():
                continue
            found[relative] = path
    return found


class ProgressTracker:
    def __init__(self, total_bytes: int, callback: Callable[[dict], None]):
        self.total = max(0, total_bytes)
        self.callback = callback
        self.done = 0
        self.started = time.monotonic()
        self.last_emit = 0.0
        self.lock = threading.Lock()

    def add(self, amount: int) -> None:
        with self.lock:
            self.done += max(0, amount)
            now = time.monotonic()
            if now - self.last_emit < 0.15 and self.done < self.total:
                return
            self.last_emit = now
            elapsed = max(0.001, now - self.started)
            speed = self.done / elapsed
            remaining = max(0, self.total - self.done)
            eta = remaining / speed if speed > 0 else None
            percent = (self.done / self.total * 100) if self.total else 100.0
            self.callback(
                {
                    "done": self.done,
                    "total": self.total,
                    "percent": min(100.0, percent),
                    "speed": speed,
                    "eta": eta,
                }
            )

    def finish(self) -> None:
        if self.total == 0:
            self.callback(
                {
                    "done": 0,
                    "total": 0,
                    "percent": 100.0,
                    "speed": 0,
                    "eta": 0,
                }
            )
            return
        if self.done != self.total:
            self.add(self.total - self.done)


class SyncEngine:
    def __init__(self, config: AppConfig, log: Callable[[str], None]):
        self.config = config
        self.log = log
        self.client = FtpClient(config, log)

    def close(self) -> None:
        self.client.close()

    def backup_download(
        self,
        local_root: Path,
        cancel: threading.Event,
        progress: Callable[[dict], None],
        status: Callable[[str], None],
    ) -> dict:
        status("正在读取 FTP 目录清单...")
        remote_entries = self.client.scan_remote(
            self.config.remote_root,
            self.config.exclude_patterns,
            cancel,
            status,
        )
        remote_files = {
            relative: entry
            for relative, entry in remote_entries.items()
            if not entry.is_dir
        }
        tasks: list[TransferTask] = []
        skipped = 0
        for relative, entry in sorted(remote_files.items()):
            local_path = local_root / Path(relative)
            if local_path.exists() and local_path.is_file():
                local_size = local_path.stat().st_size
                same_size = local_size == entry.size
                same_time = True
                if self.config.compare_mtime and entry.mtime is not None:
                    same_time = abs(local_path.stat().st_mtime - entry.mtime) <= 120
                if same_size and same_time:
                    skipped += 1
                    continue
            tasks.append(
                TransferTask(
                    relative=relative,
                    source=entry.path,
                    target=str(local_path),
                    size=entry.size,
                    mtime=entry.mtime,
                )
            )

        total = sum(task.size for task in tasks)
        tracker = ProgressTracker(total, progress)
        self.log(
            f"下载计划：{len(tasks)} 个文件，{human_bytes(total)}；跳过 {skipped} 个未变化文件。"
        )
        completed = 0
        failures: list[tuple[str, str]] = []
        for task in tasks:
            if cancel.is_set():
                raise TransferCancelled()
            status(f"下载 {task.relative}")
            local_path = Path(task.target)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                self._with_retry(
                    lambda: self.client.download_file(
                        task.source,
                        local_path,
                        task.size,
                        cancel,
                        tracker.add,
                        task.mtime,
                    ),
                    task.relative,
                )
                completed += 1
            except TransferCancelled:
                raise
            except Exception as exc:
                failures.append((task.relative, str(exc)))
                self.log(f"失败：{task.relative}：{exc}")
        tracker.finish()
        return {
            "mode": "download",
            "files": len(tasks),
            "completed": completed,
            "skipped": skipped,
            "failures": failures,
            "local_root": str(local_root),
        }

    def backup_upload(
        self,
        local_root: Path,
        cancel: threading.Event,
        progress: Callable[[dict], None],
        status: Callable[[str], None],
    ) -> dict:
        status("正在读取本地文件清单...")
        local_files = scan_local(local_root, self.config.exclude_patterns, cancel)
        status("正在读取 FTP 目录清单...")
        remote_entries = self.client.scan_remote(
            self.config.remote_root,
            self.config.exclude_patterns,
            cancel,
            status,
        )
        tasks: list[TransferTask] = []
        skipped = 0
        for relative, local_path in sorted(local_files.items()):
            remote_entry = remote_entries.get(relative)
            local_size = local_path.stat().st_size
            if remote_entry and not remote_entry.is_dir:
                same_size = remote_entry.size == local_size
                same_time = True
                if self.config.compare_mtime and remote_entry.mtime is not None:
                    same_time = (
                        abs(local_path.stat().st_mtime - remote_entry.mtime) <= 120
                    )
                if same_size and same_time:
                    skipped += 1
                    continue
            tasks.append(
                TransferTask(
                    relative=relative,
                    source=str(local_path),
                    target=join_remote(self.config.remote_root, relative),
                    size=local_size,
                    mtime=local_path.stat().st_mtime,
                )
            )

        total = sum(task.size for task in tasks)
        tracker = ProgressTracker(total, progress)
        self.log(
            f"上传计划：{len(tasks)} 个文件，{human_bytes(total)}；跳过 {skipped} 个未变化文件。"
        )
        completed = 0
        failures: list[tuple[str, str]] = []
        current_remote_dir = ""
        for task in tasks:
            if cancel.is_set():
                raise TransferCancelled()
            status(f"上传 {task.relative}")
            remote_dir = posixpath.dirname(task.target)
            if remote_dir and remote_dir != current_remote_dir:
                self.client.ensure_remote_dir(remote_dir)
                current_remote_dir = remote_dir
            remote_entry = remote_entries.get(task.relative)
            remote_size = remote_entry.size if remote_entry else 0
            try:
                self._with_retry(
                    lambda: self.client.upload_file(
                        Path(task.source),
                        task.target,
                        remote_size,
                        cancel,
                        tracker.add,
                    ),
                    task.relative,
                )
                completed += 1
            except TransferCancelled:
                raise
            except Exception as exc:
                failures.append((task.relative, str(exc)))
                self.log(f"失败：{task.relative}：{exc}")
        tracker.finish()
        return {
            "mode": "upload",
            "files": len(tasks),
            "completed": completed,
            "skipped": skipped,
            "failures": failures,
            "local_root": str(local_root),
        }

    def _with_retry(self, action: Callable[[], None], label: str) -> None:
        retries = max(0, int(self.config.retries))
        for attempt in range(retries + 1):
            try:
                action()
                return
            except TransferCancelled:
                raise
            except Exception:
                if attempt >= retries:
                    raise
                wait = min(15, 2**attempt)
                self.log(f"{label} 第 {attempt + 1} 次失败，{wait} 秒后重试。")
                try:
                    self.client.connect()
                except Exception as exc:
                    self.log(f"重连失败：{exc}")
                time.sleep(wait)


class BackupApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.config = AppConfig.load()
        self.worker: threading.Thread | None = None
        self.cancel_event = threading.Event()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.last_progress = 0.0
        self.last_backup_root: Path | None = None

        self.host_var = tk.StringVar(value=self.config.host)
        self.port_var = tk.StringVar(value=str(self.config.port))
        self.username_var = tk.StringVar(value=self.config.username)
        self.password_var = tk.StringVar(value=self.config.password())
        self.remember_var = tk.BooleanVar(value=self.config.remember_password)
        self.remote_root_var = tk.StringVar(value=self.config.remote_root)
        self.passive_var = tk.BooleanVar(value=self.config.passive)
        self.tls_var = tk.BooleanVar(value=self.config.tls)
        self.local_root_var = tk.StringVar(value=self.config.local_root)
        self.timestamp_var = tk.BooleanVar(value=self.config.timestamp_folder)
        self.compare_mtime_var = tk.BooleanVar(value=self.config.compare_mtime)
        self.retries_var = tk.StringVar(value=str(self.config.retries))
        self.timeout_var = tk.StringVar(value=str(self.config.timeout))
        self.exclude_var = tk.StringVar(value=", ".join(self.config.exclude_patterns))
        self.status_var = tk.StringVar(value="就绪")
        self.progress_text_var = tk.StringVar(value="0 B / 0 B")
        self.speed_text_var = tk.StringVar(value="速度 0 B/s")
        self.eta_text_var = tk.StringVar(value="剩余 --")

        self._configure_window()
        self._build_style()
        self._build_ui()
        self._load_config_to_ui()
        self.root.after(100, self._drain_events)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _configure_window(self) -> None:
        self.root.title(f"{APP_NAME} v{APP_VERSION}")
        self.root.geometry("1040x760")
        self.root.minsize(920, 680)

    def _build_style(self) -> None:
        style = ttk.Style(self.root)
        try:
            style.theme_use("vista")
        except tk.TclError:
            pass
        style.configure("Title.TLabel", font=("Microsoft YaHei UI", 19, "bold"))
        style.configure("Subtitle.TLabel", foreground="#667085")
        style.configure("Card.TFrame", background="#ffffff")
        style.configure("Card.TLabel", background="#ffffff")
        style.configure("Accent.TButton", font=("Microsoft YaHei UI", 10, "bold"))
        style.configure("Status.TLabel", foreground="#475467")
        self.root.configure(background="#f4f6f8")

    def _build_ui(self) -> None:
        container = ttk.Frame(self.root, padding=18)
        container.pack(fill="both", expand=True)
        container.columnconfigure(0, weight=1)
        container.rowconfigure(2, weight=1)

        header = ttk.Frame(container)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 14))
        header.columnconfigure(0, weight=1)
        ttk.Label(header, text=APP_NAME, style="Title.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(
            header,
            text="FTP 直连同步，不压缩；默认只新增或覆盖变化文件，不删除任何文件。",
            style="Subtitle.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(4, 0))
        ttk.Label(header, text=f"v{APP_VERSION}").grid(row=0, column=1, sticky="e")

        notebook = ttk.Notebook(container)
        notebook.grid(row=1, column=0, rowspan=2, sticky="nsew")

        self.settings_tab = ttk.Frame(notebook, padding=16)
        self.backup_tab = ttk.Frame(notebook, padding=16)
        self.upload_tab = ttk.Frame(notebook, padding=16)
        self.log_tab = ttk.Frame(notebook, padding=16)
        notebook.add(self.backup_tab, text="一键备份")
        notebook.add(self.upload_tab, text="上传迁移")
        notebook.add(self.settings_tab, text="FTP 设置")
        notebook.add(self.log_tab, text="运行日志")

        self._build_backup_tab()
        self._build_upload_tab()
        self._build_settings_tab()
        self._build_log_tab()

        bottom = ttk.Frame(container, padding=(0, 12, 0, 0))
        bottom.grid(row=3, column=0, sticky="ew")
        bottom.columnconfigure(0, weight=1)
        ttk.Label(bottom, textvariable=self.status_var, style="Status.TLabel").grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(bottom, textvariable=self.progress_text_var).grid(
            row=1, column=0, sticky="w", pady=(4, 0)
        )
        ttk.Label(bottom, textvariable=self.speed_text_var).grid(
            row=1, column=1, sticky="e", padx=(12, 0)
        )
        ttk.Label(bottom, textvariable=self.eta_text_var).grid(
            row=1, column=2, sticky="e", padx=(12, 0)
        )
        self.progress = ttk.Progressbar(bottom, mode="determinate", maximum=100)
        self.progress.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(7, 0))

    def _build_backup_tab(self) -> None:
        tab = self.backup_tab
        tab.columnconfigure(0, weight=1)
        card = ttk.Frame(tab, style="Card.TFrame", padding=18)
        card.grid(row=0, column=0, sticky="ew")
        card.columnconfigure(1, weight=1)

        ttk.Label(
            card,
            text="从 FTP 下载到本地，适合整站备份。",
            style="Card.TLabel",
            font=("Microsoft YaHei UI", 12, "bold"),
        ).grid(row=0, column=0, columnspan=3, sticky="w")
        ttk.Label(
            card,
            text="相同大小的文件默认跳过；已下载的 .part 文件会继续续传。",
            style="Card.TLabel",
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(6, 14))

        ttk.Label(card, text="本地备份目录", style="Card.TLabel").grid(
            row=2, column=0, sticky="w", pady=6
        )
        ttk.Entry(card, textvariable=self.local_root_var).grid(
            row=2, column=1, sticky="ew", padx=(12, 8), pady=6
        )
        ttk.Button(card, text="选择目录", command=self._choose_local_root).grid(
            row=2, column=2, pady=6
        )

        ttk.Label(card, text="远端目录", style="Card.TLabel").grid(
            row=3, column=0, sticky="w", pady=6
        )
        ttk.Entry(card, textvariable=self.remote_root_var).grid(
            row=3, column=1, columnspan=2, sticky="ew", padx=(12, 0), pady=6
        )

        options = ttk.Frame(card, style="Card.TFrame")
        options.grid(row=4, column=0, columnspan=3, sticky="w", pady=(8, 0))
        ttk.Checkbutton(
            options,
            text="每次创建时间目录",
            variable=self.timestamp_var,
        ).pack(side="left", padx=(0, 18))
        ttk.Checkbutton(
            options,
            text="同时比较修改时间",
            variable=self.compare_mtime_var,
        ).pack(side="left")

        actions = ttk.Frame(tab)
        actions.grid(row=1, column=0, sticky="ew", pady=(18, 0))
        self.download_button = ttk.Button(
            actions,
            text="开始一键备份",
            style="Accent.TButton",
            command=self._start_download,
        )
        self.download_button.pack(side="left")
        self.cancel_button = ttk.Button(
            actions,
            text="取消任务",
            command=self._cancel_worker,
            state="disabled",
        )
        self.cancel_button.pack(side="left", padx=(10, 0))
        ttk.Button(actions, text="打开备份目录", command=self._open_backup_root).pack(
            side="left", padx=(10, 0)
        )

        tips = ttk.LabelFrame(tab, text="安全说明", padding=14)
        tips.grid(row=2, column=0, sticky="ew", pady=(20, 0))
        ttk.Label(
            tips,
            text=(
                "本工具不会删除远端文件，也不会删除本地已有文件。\n"
                "备份前请确认本地磁盘空间充足；大文件传输可以随时取消，下次会尽量续传。"
            ),
            justify="left",
        ).pack(anchor="w")

    def _build_upload_tab(self) -> None:
        tab = self.upload_tab
        tab.columnconfigure(0, weight=1)
        card = ttk.Frame(tab, style="Card.TFrame", padding=18)
        card.grid(row=0, column=0, sticky="ew")
        card.columnconfigure(1, weight=1)

        ttk.Label(
            card,
            text="从本地目录上传到 FTP，适合迁移或恢复。",
            style="Card.TLabel",
            font=("Microsoft YaHei UI", 12, "bold"),
        ).grid(row=0, column=0, columnspan=3, sticky="w")
        ttk.Label(
            card,
            text="上传只新增或覆盖目标文件，不主动删除远端多余文件。",
            style="Card.TLabel",
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(6, 14))

        ttk.Label(card, text="本地源目录", style="Card.TLabel").grid(
            row=2, column=0, sticky="w", pady=6
        )
        ttk.Entry(card, textvariable=self.local_root_var).grid(
            row=2, column=1, sticky="ew", padx=(12, 8), pady=6
        )
        ttk.Button(card, text="选择目录", command=self._choose_local_root).grid(
            row=2, column=2, pady=6
        )

        ttk.Label(card, text="远端目录", style="Card.TLabel").grid(
            row=3, column=0, sticky="w", pady=6
        )
        ttk.Entry(card, textvariable=self.remote_root_var).grid(
            row=3, column=1, columnspan=2, sticky="ew", padx=(12, 0), pady=6
        )

        actions = ttk.Frame(tab)
        actions.grid(row=1, column=0, sticky="ew", pady=(18, 0))
        self.upload_button = ttk.Button(
            actions,
            text="开始上传迁移",
            style="Accent.TButton",
            command=self._start_upload,
        )
        self.upload_button.pack(side="left")

        tips = ttk.LabelFrame(tab, text="注意", padding=14)
        tips.grid(row=2, column=0, sticky="ew", pady=(20, 0))
        ttk.Label(
            tips,
            text=(
                "上传前建议先做一次完整下载备份。\n"
                "如果远端同名文件更大，工具会从头覆盖；如果远端文件较小，则尝试续传。"
            ),
            justify="left",
        ).pack(anchor="w")

    def _build_settings_tab(self) -> None:
        tab = self.settings_tab
        tab.columnconfigure(1, weight=1)
        fields = [
            ("FTP 主机", self.host_var, False),
            ("端口", self.port_var, False),
            ("用户名", self.username_var, False),
            ("密码", self.password_var, True),
            ("默认远端目录", self.remote_root_var, False),
            ("排除路径", self.exclude_var, False),
            ("重试次数", self.retries_var, False),
            ("超时秒数", self.timeout_var, False),
        ]
        for row, (label, variable, secret) in enumerate(fields):
            ttk.Label(tab, text=label).grid(
                row=row, column=0, sticky="w", pady=6, padx=(0, 12)
            )
            entry = ttk.Entry(tab, textvariable=variable, show="*" if secret else "")
            entry.grid(row=row, column=1, sticky="ew", pady=6)

        options = ttk.Frame(tab)
        options.grid(row=len(fields), column=0, columnspan=2, sticky="w", pady=(10, 4))
        ttk.Checkbutton(options, text="保存密码", variable=self.remember_var).pack(
            side="left", padx=(0, 18)
        )
        ttk.Checkbutton(options, text="被动模式", variable=self.passive_var).pack(
            side="left", padx=(0, 18)
        )
        ttk.Checkbutton(options, text="FTPS 加密", variable=self.tls_var).pack(
            side="left"
        )

        help_text = (
            "排除路径用英文逗号分隔，例如 var/cache, .git。\n"
            "密码勾选“保存密码”后使用 Windows 本机加密保存，不会上传到 GitHub。"
        )
        ttk.Label(tab, text=help_text, foreground="#667085", justify="left").grid(
            row=len(fields) + 1, column=0, columnspan=2, sticky="w", pady=(8, 14)
        )

        actions = ttk.Frame(tab)
        actions.grid(row=len(fields) + 2, column=0, columnspan=2, sticky="w")
        ttk.Button(actions, text="保存设置", command=self._save_settings).pack(
            side="left"
        )
        ttk.Button(actions, text="测试连接", command=self._test_connection).pack(
            side="left", padx=(10, 0)
        )
        ttk.Button(actions, text="恢复默认排除", command=self._reset_excludes).pack(
            side="left", padx=(10, 0)
        )

    def _build_log_tab(self) -> None:
        self.log_text = ScrolledText(
            self.log_tab,
            wrap="word",
            font=("Consolas", 9),
            state="disabled",
            background="#101828",
            foreground="#d0d5dd",
            insertbackground="#ffffff",
        )
        self.log_text.pack(fill="both", expand=True)

    def _load_config_to_ui(self) -> None:
        self._append_log(
            f"{APP_NAME} v{APP_VERSION} 已启动。配置文件：{config_path()}"
        )
        if not self.config.host:
            self._append_log("请先到“FTP 设置”填写主机、用户名和密码。")

    def _collect_config(self) -> AppConfig:
        config = AppConfig(
            host=self.host_var.get().strip(),
            port=int(self.port_var.get() or 21),
            username=self.username_var.get().strip(),
            remote_root=normalize_remote(self.remote_root_var.get()),
            passive=bool(self.passive_var.get()),
            tls=bool(self.tls_var.get()),
            local_root=self.local_root_var.get().strip(),
            timestamp_folder=bool(self.timestamp_var.get()),
            compare_mtime=bool(self.compare_mtime_var.get()),
            retries=int(self.retries_var.get() or 3),
            timeout=int(self.timeout_var.get() or 60),
            exclude_patterns=[
                item.strip()
                for item in re.split(r"[,，\n]+", self.exclude_var.get())
                if item.strip()
            ],
            remember_password=bool(self.remember_var.get()),
        )
        if config.remember_password:
            config.password_encrypted = SecretStore.protect(self.password_var.get())
        return config

    def _save_settings(self) -> None:
        try:
            self.config = self._collect_config()
            self.config.save()
            self._append_log(f"设置已保存：{config_path()}")
            messagebox.showinfo(APP_NAME, "设置已保存。")
        except Exception as exc:
            messagebox.showerror(APP_NAME, f"保存失败：{exc}")

    def _reset_excludes(self) -> None:
        self.exclude_var.set(
            ", ".join(
                [".git", "var/cache", "var/tmp", "sql_backup/static_backup_work"]
            )
        )

    def _choose_local_root(self) -> None:
        initial = self.local_root_var.get().strip()
        if not initial:
            initial = str(Path.home() / "Downloads")
        selected = filedialog.askdirectory(
            title="选择本地目录",
            initialdir=initial if Path(initial).exists() else str(Path.home()),
        )
        if selected:
            self.local_root_var.set(selected)

    def _open_backup_root(self) -> None:
        target = self.last_backup_root
        if target is None:
            text = self.local_root_var.get().strip()
            target = Path(text) if text else None
        if target is None or not target.exists():
            messagebox.showinfo(APP_NAME, "还没有可打开的备份目录。")
            return
        os.startfile(str(target))

    def _test_connection(self) -> None:
        if self.worker and self.worker.is_alive():
            messagebox.showinfo(APP_NAME, "已有任务正在运行。")
            return
        try:
            config = self._collect_config()
        except Exception as exc:
            messagebox.showerror(APP_NAME, f"设置不正确：{exc}")
            return
        self._start_worker(self._test_connection_worker, config)

    def _test_connection_worker(self, config: AppConfig) -> None:
        client = FtpClient(config, self._post_log)
        try:
            self._post_status("正在测试 FTP 连接...")
            client.connect()
            entries = client.list_dir(config.remote_root)
            self._post_log(
                f"连接成功：{config.host}:{config.port}{normalize_remote(config.remote_root)}，"
                f"当前目录 {len(entries)} 项。"
            )
            self._post_done("FTP 连接成功。")
        finally:
            client.close()

    def _start_download(self) -> None:
        try:
            config = self._collect_config()
            local_root = self._prepare_local_root(config, for_backup=True)
            config.local_root = str(local_root)
            config.save()
            self.config = config
        except Exception as exc:
            messagebox.showerror(APP_NAME, f"无法开始：{exc}")
            return
        self.last_backup_root = local_root
        self._start_worker(self._download_worker, config, local_root)

    def _start_upload(self) -> None:
        try:
            config = self._collect_config()
            local_root = Path(config.local_root)
            if not local_root.is_dir():
                raise ValueError("本地源目录不存在。")
            config.save()
            self.config = config
        except Exception as exc:
            messagebox.showerror(APP_NAME, f"无法开始：{exc}")
            return
        if not messagebox.askyesno(
            APP_NAME,
            "确认开始上传迁移？\n\n工具不会删除远端文件，但会覆盖大小不同的同名文件。",
        ):
            return
        self._start_worker(self._upload_worker, config, local_root)

    def _prepare_local_root(self, config: AppConfig, for_backup: bool) -> Path:
        text = config.local_root.strip()
        if not text:
            raise ValueError("请先选择本地备份目录。")
        base = Path(text).expanduser()
        base.mkdir(parents=True, exist_ok=True)
        if not for_backup or not config.timestamp_folder:
            return base
        host = re.sub(r"[^A-Za-z0-9_.-]+", "_", config.host).strip("_") or "ftp"
        stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        target = base / f"{host}_{stamp}"
        target.mkdir(parents=True, exist_ok=True)
        return target

    def _start_worker(self, target: Callable, *args) -> None:
        self.cancel_event.clear()
        self._set_busy(True)
        self.progress.configure(mode="determinate")
        self.progress["value"] = 0
        self.worker = threading.Thread(
            target=self._worker_wrapper,
            args=(target, *args),
            daemon=True,
        )
        self.worker.start()

    def _worker_wrapper(self, target: Callable, *args) -> None:
        try:
            result = target(*args)
            if result:
                self._post_result(result)
        except TransferCancelled:
            self._post_log("任务已取消。")
            self._post_status("已取消")
        except Exception as exc:
            self._post_log(traceback.format_exc())
            self._post_error(str(exc))
        finally:
            self._post_busy(False)

    def _download_worker(self, config: AppConfig, local_root: Path) -> dict:
        engine = SyncEngine(config, self._post_log)
        try:
            return engine.backup_download(
                local_root,
                self.cancel_event,
                self._post_progress,
                self._post_status,
            )
        finally:
            engine.close()

    def _upload_worker(self, config: AppConfig, local_root: Path) -> dict:
        engine = SyncEngine(config, self._post_log)
        try:
            return engine.backup_upload(
                local_root,
                self.cancel_event,
                self._post_progress,
                self._post_status,
            )
        finally:
            engine.close()

    def _cancel_worker(self) -> None:
        if self.worker and self.worker.is_alive():
            self.cancel_event.set()
            self._post_status("正在取消...")
            self._append_log("已请求取消，当前数据块完成后停止。")

    def _set_busy(self, busy: bool) -> None:
        state = "disabled" if busy else "normal"
        self.download_button.configure(state=state)
        self.upload_button.configure(state=state)
        self.cancel_button.configure(state="normal" if busy else "disabled")

    def _post_log(self, message: str) -> None:
        self.events.put(("log", message))

    def _post_status(self, message: str) -> None:
        self.events.put(("status", message))

    def _post_progress(self, value: dict) -> None:
        self.events.put(("progress", value))

    def _post_done(self, message: str) -> None:
        self.events.put(("done", message))

    def _post_error(self, message: str) -> None:
        self.events.put(("error", message))

    def _post_result(self, result: dict) -> None:
        self.events.put(("result", result))

    def _post_busy(self, busy: bool) -> None:
        self.events.put(("busy", busy))

    def _drain_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "log":
                    self._append_log(str(payload))
                elif kind == "status":
                    self.status_var.set(str(payload))
                elif kind == "progress":
                    self._apply_progress(payload)
                elif kind == "done":
                    self.status_var.set(str(payload))
                    messagebox.showinfo(APP_NAME, str(payload))
                elif kind == "error":
                    self.status_var.set("失败")
                    messagebox.showerror(APP_NAME, str(payload))
                elif kind == "result":
                    self._apply_result(payload)
                elif kind == "busy":
                    self._set_busy(bool(payload))
        except queue.Empty:
            pass
        self.root.after(100, self._drain_events)

    def _apply_progress(self, value: dict) -> None:
        percent = float(value.get("percent", 0))
        self.progress["value"] = percent
        self.progress_text_var.set(
            f"{percent:.1f}%  {human_bytes(value.get('done', 0))} / "
            f"{human_bytes(value.get('total', 0))}"
        )
        self.speed_text_var.set(f"速度 {human_bytes(value.get('speed', 0))}/s")
        eta = value.get("eta")
        self.eta_text_var.set(
            "剩余 --" if eta is None else f"剩余 {format_seconds(float(eta))}"
        )

    def _apply_result(self, result: dict) -> None:
        failures = result.get("failures") or []
        mode = result.get("mode")
        mode_label = "下载备份" if mode == "download" else "上传迁移"
        summary = (
            f"{mode_label}完成：计划 {result.get('files', 0)} 个，"
            f"成功 {result.get('completed', 0)} 个，跳过 {result.get('skipped', 0)} 个，"
            f"失败 {len(failures)} 个。"
        )
        self._append_log(summary)
        if result.get("local_root"):
            self._append_log(f"本地目录：{result['local_root']}")
        if failures:
            message = summary + "\n\n失败文件已写入运行日志，可再次运行继续尝试。"
            self._post_error(message)
        else:
            self._post_done(summary)

    def _append_log(self, message: str) -> None:
        line = f"[{now_text()}] {message}\n"
        self.log_text.configure(state="normal")
        self.log_text.insert("end", line)
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _on_close(self) -> None:
        if self.worker and self.worker.is_alive():
            if not messagebox.askyesno(APP_NAME, "任务仍在运行，确定退出吗？"):
                return
            self.cancel_event.set()
        self.root.destroy()


def format_seconds(seconds: float) -> str:
    seconds = max(0, int(seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}小时{minutes}分"
    if minutes:
        return f"{minutes}分{secs}秒"
    return f"{secs}秒"


def run_self_test() -> int:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        config = AppConfig(
            host="127.0.0.1",
            port=21,
            username="demo",
            remote_root="/",
            local_root=str(root),
        )
        path = root / CONFIG_FILE_NAME
        config.save(path)
        loaded = AppConfig.load(path)
        assert loaded.host == "127.0.0.1"
        assert loaded.port == 21
        assert should_exclude("var/cache/a.php", ["var/cache"])
        assert not should_exclude("var/cachefile/a.php", ["var/cache"])
        secret = SecretStore.protect("测试密码")
        assert SecretStore.unprotect(secret) == "测试密码"
        entries = parse_list_lines(
            "/",
            [
                "drwxr-xr-x 2 user group 4096 Oct 23 10:00 uploads",
                "-rw-r--r-- 1 user group 123 Oct 23 10:01 index.php",
            ],
        )
        assert len(entries) == 2
        assert entries[0].is_dir
        assert entries[1].size == 123
    print(f"{APP_NAME} v{APP_VERSION} self-test: OK")
    return 0


def run_ftp_check(config_file: Path) -> int:
    config = AppConfig.load(config_file)
    client = FtpClient(config, print)
    try:
        client.connect()
        entries = client.list_dir(config.remote_root)
        print(f"FTP check OK: {config.host}:{config.port}{config.remote_root}")
        print(f"Entries: {len(entries)}")
        for entry in entries[:20]:
            kind = "DIR " if entry.is_dir else "FILE"
            print(f"{kind} {entry.size:>12} {entry.name}")
        return 0
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--self-test", action="store_true", help="运行基础自检")
    parser.add_argument("--test-ftp", type=Path, help="使用指定配置测试 FTP")
    parser.add_argument("--version", action="version", version=APP_VERSION)
    args = parser.parse_args()

    if args.self_test:
        return run_self_test()
    if args.test_ftp:
        return run_ftp_check(args.test_ftp)

    root = tk.Tk()
    BackupApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
