"""Upload Farm Dashboard build artifacts to VPS via SFTP (reads .cursor/secrets/farmdashboard-vps.env)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".cursor" / "secrets" / "farmdashboard-vps.env"


def load_env(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            data[k.strip()] = v.strip()
    return data


def connect(env: dict[str, str]) -> paramiko.SSHClient:
    host = env["VPS_HOST"]
    port = int(env.get("VPS_PORT", "22"))
    password = env["VPS_PASSWORD"]
    users = [env["VPS_USER"], env.get("VPS_USER_ALT", "")]
    users = [u for u in users if u]

    for user in users:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                hostname=host,
                port=port,
                username=user,
                password=password,
                timeout=60,
                banner_timeout=60,
                auth_timeout=60,
                allow_agent=False,
                look_for_keys=False,
            )
            transport = client.get_transport()
            if transport:
                transport.set_keepalive(15)
            print(f"Connected as {user}@{host}", flush=True)
            return client
        except paramiko.AuthenticationException:
            client.close()
            print(f"Auth failed for user {user}, trying next...", flush=True)
        except Exception as e:
            client.close()
            raise SystemExit(f"SSH failed for {user}: {e}") from e

    raise SystemExit("SSH authentication failed for all configured users")


def remote_size(sftp: paramiko.SFTPClient, remote: str) -> int | None:
    try:
        return int(sftp.stat(remote).st_size)
    except OSError:
        return None


def sftp_put_atomic(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    """Upload to remote.part then rename — avoids testers downloading a truncated .exe."""
    size = local.stat().st_size
    staging = f"{remote}.part"
    start = time.time()
    last = 0.0

    existing = remote_size(sftp, remote)
    if existing == size:
        print(f"  {local.name}: already complete on server ({size / (1024 * 1024):.1f} MB)", flush=True)
        return

    # Remove stale partials from interrupted uploads.
    for stale in (staging, remote):
        partial = remote_size(sftp, stale)
        if partial is not None and partial != size:
            try:
                sftp.remove(stale)
                print(f"  Removed incomplete {stale.split('/')[-1]} ({partial} bytes)", flush=True)
            except OSError:
                pass

    def progress(done: int, total: int) -> None:
        nonlocal last
        now = time.time()
        if now - last < 2.0 and done != total:
            return
        last = now
        pct = (done / total * 100) if total else 0
        mb = done / (1024 * 1024)
        total_mb = total / (1024 * 1024)
        elapsed = max(now - start, 0.001)
        rate = done / elapsed / (1024 * 1024)
        print(
            f"  {local.name}: {mb:.1f}/{total_mb:.1f} MB ({pct:.1f}%) ~{rate:.2f} MB/s",
            flush=True,
        )

    print(f"Uploading {local.name} ({size / (1024 * 1024):.1f} MB) -> {remote}", flush=True)
    sftp.put(str(local), staging, callback=progress, confirm=True)
    uploaded = remote_size(sftp, staging)
    if uploaded != size:
        raise SystemExit(
            f"Upload size mismatch for {local.name}: local={size} remote={uploaded}"
        )
    try:
        sftp.remove(remote)
    except OSError:
        pass
    sftp.rename(staging, remote)
    elapsed = time.time() - start
    print(f"  Done in {elapsed:.0f}s", flush=True)


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    cur = ""
    for part in remote_dir.split("/"):
        if not part:
            continue
        cur += "/" + part
        try:
            sftp.stat(cur)
        except OSError:
            try:
                sftp.mkdir(cur)
            except OSError:
                pass


def upload_website_assets(client: paramiko.SSHClient, env: dict[str, str]) -> None:
    web_root = env["VPS_WEB_ROOT"].rstrip("/")
    website = ROOT / "Website"
    skip_dirs = {"nginx", "tools", "files"}
    uploads: list[tuple[Path, str]] = []

    for html in sorted(website.glob("*.html")):
        uploads.append((html, f"{web_root}/{html.name}"))

    for extra in ("robots.txt",):
        local = website / extra
        if local.is_file():
            uploads.append((local, f"{web_root}/{extra}"))

    for sub in ("css", "js", "assets", "t"):
        base = website / sub
        if not base.is_dir():
            continue
        for local in sorted(base.rglob("*")):
            if not local.is_file():
                continue
            rel = local.relative_to(website).as_posix()
            if any(part in skip_dirs for part in local.relative_to(base).parts):
                continue
            if "/files/" in rel and rel.endswith((".exe", ".zip")):
                continue
            uploads.append((local, f"{web_root}/{rel}"))

    sftp = client.open_sftp()
    try:
        for local, remote in uploads:
            ensure_remote_dir(sftp, remote.rsplit("/", 1)[0])
            sftp_put_atomic(sftp, local, remote)
    finally:
        sftp.close()
    print(f"Website assets uploaded ({len(uploads)} files).", flush=True)


def main() -> int:
    only = None
    upload_site = "--site" in sys.argv
    if "--only" in sys.argv:
        idx = sys.argv.index("--only")
        if idx + 1 < len(sys.argv):
            only = sys.argv[idx + 1]

    if not ENV_PATH.is_file():
        print(f"Missing {ENV_PATH}", flush=True)
        return 1

    env = load_env(ENV_PATH)
    build_dir = Path(env["LOCAL_BUILD_DIR"])
    remote_dir = env["VPS_TESTERS_FILES"].rstrip("/")

    if upload_site:
        client = connect(env)
        try:
            upload_website_assets(client, env)
        finally:
            client.close()
        return 0

    files = [env["LOCAL_MOD_ZIP"], env["LOCAL_INSTALLER"]]
    if only == "zip":
        files = [env["LOCAL_MOD_ZIP"]]
    elif only == "installer":
        files = [env["LOCAL_INSTALLER"]]

    missing = [f for f in files if not (build_dir / f).is_file()]
    if missing:
        print(f"Missing build files in {build_dir}: {', '.join(missing)}", flush=True)
        return 1

    client = connect(env)
    try:
        stdin, stdout, stderr = client.exec_command(f"mkdir -p {remote_dir}")
        stdout.channel.recv_exit_status()

        sftp = client.open_sftp()
        try:
            for name in files:
                local = build_dir / name
                remote = f"{remote_dir}/{name}"
                sftp_put_atomic(sftp, local, remote)
        finally:
            sftp.close()

        stdin, stdout, stderr = client.exec_command(f"ls -lh {remote_dir}")
        print(stdout.read().decode(), flush=True)
    finally:
        client.close()

    print("Deploy complete.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
