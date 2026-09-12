#!/usr/bin/env python3
"""Read-only SQL access to the production WordPress database over ssh.

Every statement is checked against a SELECT/WITH-only allowlist before it
leaves this machine, so this module cannot be used to mutate production.
"""

from __future__ import annotations

import re
import shlex
import subprocess

SSH_HOST = "tsprod"
WP_PATH = "~/www/true-sciences.com/public_html"

# Only statement-level writes. Bare words like REPLACE() and CREATE are legal
# inside a SELECT, so each pattern requires the syntax that actually mutates.
_WRITE_TOKENS = re.compile(
    r"\binsert\s+(into|ignore)\b|\breplace\s+into\b|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b|"
    r"\bdrop\s+(table|database|view|index)\b|\btruncate\s+table\b|\balter\s+table\b|"
    r"\bcreate\s+(table|database|view|index|temporary)\b|\bgrant\b|\brevoke\b|"
    r"\brename\s+table\b|\block\s+tables\b|\bload\s+data\b|\bhandler\b|"
    r"\binto\s+(outfile|dumpfile)\b",
    re.IGNORECASE,
)


def _assert_read_only(sql: str) -> None:
    stripped = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    stripped = re.sub(r"--[^\n]*", " ", stripped)
    if not re.match(r"^\s*(select|with)\b", stripped, re.IGNORECASE):
        raise ValueError("refusing non-SELECT statement")
    if ";" in stripped.strip().rstrip(";"):
        raise ValueError("refusing multi-statement SQL")
    hit = _WRITE_TOKENS.search(stripped)
    if hit:
        raise ValueError(f"refusing statement containing {hit.group(0)!r}")


def run_sql(sql: str) -> list[dict[str, str]]:
    """Run a read-only query on production and return rows as dicts."""
    _assert_read_only(sql)
    one_line = " ".join(sql.split())
    remote = f"cd {WP_PATH} && wp db query {shlex.quote(one_line)}"
    proc = subprocess.run(["ssh", SSH_HOST, remote], text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "query failed")
    lines = [ln for ln in proc.stdout.split("\n") if ln.strip()]
    if not lines:
        return []
    headers = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        cells = line.split("\t")
        cells += [""] * (len(headers) - len(cells))
        rows.append(dict(zip(headers, cells)))
    return rows


def scalar(sql: str, default: str = "") -> str:
    rows = run_sql(sql)
    if not rows:
        return default
    return next(iter(rows[0].values()), default)
