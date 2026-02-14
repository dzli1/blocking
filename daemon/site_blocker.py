#!/usr/bin/env python3
"""
Site Blocker — Productivity Tool
=================================
Monitors and blocks distracting websites by modifying the system hosts file.
Redirects blocked sites to a local control panel (localhost).

Usage:
    sudo python3 site_blocker.py                  # Start with default blocklist
    sudo python3 site_blocker.py --config config.json  # Use a config file

Requires root/admin privileges to modify the hosts file.
"""

import json
import os
import sys
import time
import signal
import argparse
import socket
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading

# ─── Constants ────────────────────────────────────────────────────────────────

if sys.platform == "win32":
    HOSTS_PATH = r"C:\Windows\System32\drivers\etc\hosts"
else:
    HOSTS_PATH = "/etc/hosts"

REDIRECT_IP = "127.0.0.1"
MARKER_START = "# === SITE BLOCKER START ==="
MARKER_END = "# === SITE BLOCKER END ==="

DEFAULT_CONFIG_PATH = Path.home() / ".site_blocker" / "config.json"

DEFAULT_BLOCKED = [
    "facebook.com",
    "www.facebook.com",
    "twitter.com",
    "www.twitter.com",
    "x.com",
    "www.x.com",
    "instagram.com",
    "www.instagram.com",
    "reddit.com",
    "www.reddit.com",
    "tiktok.com",
    "www.tiktok.com",
    "youtube.com",
    "www.youtube.com",
]


# ─── Config Manager ──────────────────────────────────────────────────────────

class Config:
    """Manages the blocker configuration (blocked sites, exceptions, schedules)."""

    def __init__(self, path: str = None):
        self.path = Path(path) if path else DEFAULT_CONFIG_PATH
        self.blocked_sites: list[str] = []
        self.exceptions: list[dict] = []  # {"site": ..., "until": ISO timestamp}
        self.enabled: bool = True
        self.load()

    def load(self):
        if self.path.exists():
            with open(self.path, "r") as f:
                data = json.load(f)
            self.blocked_sites = data.get("blocked_sites", DEFAULT_BLOCKED)
            self.exceptions = data.get("exceptions", [])
            self.enabled = data.get("enabled", True)
        else:
            self.blocked_sites = list(DEFAULT_BLOCKED)
            self.exceptions = []
            self.enabled = True
            self.save()

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "blocked_sites": self.blocked_sites,
            "exceptions": self.exceptions,
            "enabled": self.enabled,
        }
        with open(self.path, "w") as f:
            json.dump(data, f, indent=2)

    def add_site(self, site: str):
        """Add a site to the blocklist (adds both bare and www variants)."""
        site = site.lower().strip()
        variants = {site}
        if site.startswith("www."):
            variants.add(site[4:])
        else:
            variants.add(f"www.{site}")
        for v in variants:
            if v not in self.blocked_sites:
                self.blocked_sites.append(v)
        self.save()

    def remove_site(self, site: str):
        """Remove a site from the blocklist."""
        site = site.lower().strip()
        variants = [site]
        if site.startswith("www."):
            variants.append(site[4:])
        else:
            variants.append(f"www.{site}")
        self.blocked_sites = [s for s in self.blocked_sites if s not in variants]
        self.save()

    def add_exception(self, site: str, minutes: int = 15):
        """Temporarily allow a site for N minutes."""
        site = site.lower().strip()
        until = (datetime.now() + timedelta(minutes=minutes)).isoformat()
        # Remove existing exception for same site
        self.exceptions = [e for e in self.exceptions if e["site"] != site]
        self.exceptions.append({"site": site, "until": until})
        self.save()

    def remove_exception(self, site: str):
        """Remove a temporary exception."""
        site = site.lower().strip()
        self.exceptions = [e for e in self.exceptions if e["site"] != site]
        self.save()

    def get_active_exceptions(self) -> list[str]:
        """Return list of sites currently excepted."""
        now = datetime.now()
        active = []
        expired = []
        for exc in self.exceptions:
            if datetime.fromisoformat(exc["until"]) > now:
                active.append(exc["site"])
            else:
                expired.append(exc)
        # Clean up expired
        if expired:
            self.exceptions = [e for e in self.exceptions if e not in expired]
            self.save()
        return active

    def get_effective_blocklist(self) -> list[str]:
        """Return the current blocklist minus active exceptions."""
        if not self.enabled:
            return []
        excepted = self.get_active_exceptions()
        return [s for s in self.blocked_sites if s not in excepted]


# ─── Hosts File Manager ──────────────────────────────────────────────────────

class HostsManager:
    """Reads/writes the system hosts file to block sites."""

    def __init__(self, hosts_path: str = HOSTS_PATH):
        self.hosts_path = hosts_path

    def _read_hosts(self) -> str:
        with open(self.hosts_path, "r") as f:
            return f.read()

    def _write_hosts(self, content: str):
        with open(self.hosts_path, "w") as f:
            f.write(content)

    def _strip_our_entries(self, content: str) -> str:
        """Remove our block between markers."""
        lines = content.split("\n")
        result = []
        inside_block = False
        for line in lines:
            if MARKER_START in line:
                inside_block = True
                continue
            if MARKER_END in line:
                inside_block = False
                continue
            if not inside_block:
                result.append(line)
        # Remove trailing blank lines we may have added
        while result and result[-1].strip() == "":
            result.pop()
        return "\n".join(result)

    def apply_blocklist(self, sites: list[str]):
        """Write the blocklist into the hosts file."""
        content = self._read_hosts()
        clean = self._strip_our_entries(content)

        if sites:
            block = [f"\n{MARKER_START}"]
            for site in sites:
                block.append(f"{REDIRECT_IP}  {site}")
            block.append(MARKER_END)
            clean += "\n".join(block) + "\n"

        self._write_hosts(clean)

    def clear(self):
        """Remove all our entries from hosts."""
        content = self._read_hosts()
        clean = self._strip_our_entries(content)
        self._write_hosts(clean)

    def get_current_blocks(self) -> list[str]:
        """Return the sites we currently have in hosts."""
        content = self._read_hosts()
        lines = content.split("\n")
        inside = False
        sites = []
        for line in lines:
            if MARKER_START in line:
                inside = True
                continue
            if MARKER_END in line:
                inside = False
                continue
            if inside and line.strip():
                parts = line.split()
                if len(parts) >= 2:
                    sites.append(parts[1])
        return sites


# ─── DNS Monitor ──────────────────────────────────────────────────────────────

class DNSMonitor:
    """Periodically checks and resolves blocked site IPs for logging."""

    def __init__(self, config: Config):
        self.config = config
        self.resolved_ips: dict[str, str] = {}

    def resolve_sites(self):
        """Resolve current blocked sites to their IPs (informational)."""
        for site in self.config.blocked_sites:
            try:
                ip = socket.gethostbyname(site)
                self.resolved_ips[site] = ip
            except socket.gaierror:
                self.resolved_ips[site] = "unresolved"

    def log_status(self):
        """Print current blocking status."""
        effective = self.config.get_effective_blocklist()
        excepted = self.config.get_active_exceptions()
        print(f"\n{'─' * 60}")
        print(f"  Site Blocker Status — {datetime.now().strftime('%H:%M:%S')}")
        print(f"  Enabled: {'YES' if self.config.enabled else 'NO'}")
        print(f"  Blocking {len(effective)} sites")
        if excepted:
            print(f"  Exceptions active: {', '.join(excepted)}")
        print(f"{'─' * 60}")


# ─── API Server ───────────────────────────────────────────────────────────────

class APIHandler(SimpleHTTPRequestHandler):
    """Simple HTTP API for the control panel to talk to."""

    config: Config = None
    hosts_mgr: HostsManager = None

    def do_GET(self):
        if self.path == "/api/status":
            self._json_response({
                "enabled": self.config.enabled,
                "blocked_sites": self.config.blocked_sites,
                "exceptions": self.config.exceptions,
                "effective_blocklist": self.config.get_effective_blocklist(),
            })
        elif self.path == "/api/ping":
            self._json_response({"status": "ok"})
        else:
            self.send_error(404)

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_len)) if content_len else {}

        if self.path == "/api/add_site":
            site = body.get("site", "")
            if site:
                self.config.add_site(site)
                self._apply_and_respond(f"Added {site}")
            else:
                self._json_response({"error": "No site provided"}, 400)

        elif self.path == "/api/remove_site":
            site = body.get("site", "")
            if site:
                self.config.remove_site(site)
                self._apply_and_respond(f"Removed {site}")
            else:
                self._json_response({"error": "No site provided"}, 400)

        elif self.path == "/api/add_exception":
            site = body.get("site", "")
            minutes = body.get("minutes", 15)
            if site:
                self.config.add_exception(site, minutes)
                self._apply_and_respond(f"Exception for {site} ({minutes}m)")
            else:
                self._json_response({"error": "No site provided"}, 400)

        elif self.path == "/api/remove_exception":
            site = body.get("site", "")
            if site:
                self.config.remove_exception(site)
                self._apply_and_respond(f"Removed exception for {site}")
            else:
                self._json_response({"error": "No site provided"}, 400)

        elif self.path == "/api/toggle":
            self.config.enabled = not self.config.enabled
            self.config.save()
            self._apply_and_respond(
                f"Blocker {'enabled' if self.config.enabled else 'disabled'}"
            )
        else:
            self.send_error(404)

    def _apply_and_respond(self, message: str):
        effective = self.config.get_effective_blocklist()
        self.hosts_mgr.apply_blocklist(effective)
        self._json_response({
            "message": message,
            "enabled": self.config.enabled,
            "blocked_sites": self.config.blocked_sites,
            "exceptions": self.config.exceptions,
            "effective_blocklist": effective,
        })

    def _json_response(self, data: dict, code: int = 200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress default logging


# ─── Main Loop ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Site Blocker for Productivity")
    parser.add_argument("--config", type=str, help="Path to config JSON file")
    parser.add_argument("--port", type=int, default=9099, help="API server port")
    parser.add_argument("--interval", type=int, default=30, help="Check interval (seconds)")
    args = parser.parse_args()

    # Check for root/admin
    if os.name != "nt" and os.geteuid() != 0:
        print("⚠  This script needs root privileges to modify the hosts file.")
        print("   Run with: sudo python3 site_blocker.py")
        sys.exit(1)

    config = Config(args.config)
    hosts_mgr = HostsManager()
    monitor = DNSMonitor(config)

    # Apply initial blocklist
    effective = config.get_effective_blocklist()
    hosts_mgr.apply_blocklist(effective)
    print(f"✓ Blocking {len(effective)} sites")

    # Start API server
    APIHandler.config = config
    APIHandler.hosts_mgr = hosts_mgr
    server = HTTPServer(("127.0.0.1", args.port), APIHandler)
    api_thread = threading.Thread(target=server.serve_forever, daemon=True)
    api_thread.start()
    print(f"✓ API server running on http://127.0.0.1:{args.port}")
    print(f"  Control panel: open the .html file in your browser")

    # Graceful shutdown
    def cleanup(sig=None, frame=None):
        print("\n⏻ Shutting down — clearing hosts entries...")
        hosts_mgr.clear()
        server.shutdown()
        config.save()
        print("✓ Clean shutdown complete.")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Main monitoring loop
    try:
        while True:
            config.load()  # Reload config (in case edited externally)
            effective = config.get_effective_blocklist()
            hosts_mgr.apply_blocklist(effective)
            monitor.resolve_sites()
            monitor.log_status()
            time.sleep(args.interval)
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
