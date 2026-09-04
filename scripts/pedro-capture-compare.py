#!/usr/bin/env python3
"""Compare Pedro PGFit visit capture: Aug 31 pre-fix vs post-fix vs Sep 1."""
from __future__ import annotations

import csv
import gzip
import re
import subprocess
from datetime import datetime, timedelta, timezone
from collections import Counter
from pathlib import Path

PDT = timezone(timedelta(hours=-7))
FIX_UTC = datetime(2026, 9, 1, 2, 22, 34, tzinfo=timezone.utc)
FIX_PT = FIX_UTC.astimezone(PDT)
LOGDIR = Path.home() / "www/true-sciences.com/logs"
WP_ROOT = Path.home() / "www/true-sciences.com/public_html"

TS_RE = re.compile(r"\[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}) \+0000\]")
REQ_RE = re.compile(r'"(GET|HEAD|POST) ([^ ]+) HTTP/[0-9.]+" (\d{3}) ')
BOT_RE = re.compile(
    r"bot|crawl|spider|facebookexternalhit|preview|HeadlessChrome|Googlebot|bingbot|Slurp|Semrush|Ahrefs|PetalBot|Bytespider|meta-externalagent",
    re.I,
)
AFF_PATH = re.compile(r"^/(?:aff/(?:PGFit|pgfit)|(?:shop|product/[^/]+)/aff/(?:PGFit|pgfit))", re.I)


def fetch_visits(start_pt: datetime, end_pt: datetime) -> list[dict]:
    sql = f"""
SELECT id, date_created, ip_address, landing_url, referrer_url
FROM zww_slicewp_visits
WHERE affiliate_id = 84
  AND date_created >= CONVERT_TZ('{start_pt.strftime("%Y-%m-%d %H:%M:%S")}', 'America/Los_Angeles', '+00:00')
  AND date_created < CONVERT_TZ('{end_pt.strftime("%Y-%m-%d %H:%M:%S")}', 'America/Los_Angeles', '+00:00')
ORDER BY date_created ASC;
"""
    out = subprocess.check_output(["wp", "db", "query", sql, f"--path={WP_ROOT}"], text=True)
    rows: list[dict] = []
    for line in out.strip().splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) < 5:
            continue
        utc = datetime.strptime(parts[1], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        rows.append(
            {
                "id": int(parts[0]),
                "utc": utc,
                "pt": utc.astimezone(PDT),
                "ip": parts[2],
                "landing": parts[3],
                "ref": parts[4],
            }
        )
    return rows


def parse_clicks(start_pt: datetime, end_pt: datetime) -> list[dict]:
    clicks: list[dict] = []
    for name in (
        "true-sciences.com-2026-08-31.gz",
        "true-sciences.com-2026-09-01.gz",
        "true-sciences.com-2026-09-02.gz",
    ):
        fp = LOGDIR / name
        if not fp.exists():
            continue
        with gzip.open(fp, "rt", errors="replace") as handle:
            for line in handle:
                ts_m = TS_RE.search(line)
                if not ts_m:
                    continue
                ts_utc = datetime.strptime(ts_m.group(1), "%d/%b/%Y:%H:%M:%S").replace(tzinfo=timezone.utc)
                ts_pt = ts_utc.astimezone(PDT)
                if ts_pt < start_pt or ts_pt >= end_pt:
                    continue
                req_m = REQ_RE.search(line)
                if not req_m:
                    continue
                method, path, status = req_m.group(1), req_m.group(2), req_m.group(3)
                path_only = path.split("?", 1)[0]
                if method != "GET" or status != "200" or not AFF_PATH.match(path_only):
                    continue
                clicks.append(
                    {
                        "ts_utc": ts_utc,
                        "ts_pt": ts_pt,
                        "ip": line.split()[0],
                        "bot": bool(BOT_RE.search(line)),
                        "fbclid": "fbclid=" in path,
                        "ttclid": "ttclid=" in path,
                        "post_fix": ts_utc >= FIX_UTC,
                        "cache": "MISS" if " MISS " in line else ("HIT" if " HIT " in line else ""),
                    }
                )
    return clicks


def match_rate(clicks: list[dict], visits: list[dict]) -> tuple[int, int, list[dict]]:
    human = [c for c in clicks if not c["bot"]]
    used: set[int] = set()
    misses: list[dict] = []
    matched = 0
    for c in human:
        best = None
        best_d = timedelta(days=99)
        for v in visits:
            if v["id"] in used or v["ip"] != c["ip"]:
                continue
            delta = abs(v["utc"] - c["ts_utc"])
            if delta <= timedelta(minutes=10) and delta < best_d:
                best = v
                best_d = delta
        if best:
            matched += 1
            used.add(best["id"])
        else:
            misses.append(c)
    return matched, len(human), misses


def summarize(label: str, start_pt: datetime, end_pt: datetime) -> dict:
    clicks = parse_clicks(start_pt, end_pt)
    visits = fetch_visits(start_pt, end_pt)
    matched, human_n, misses = match_rate(clicks, visits)
    human = [c for c in clicks if not c["bot"]]
    rate = f"{100 * matched / human_n:.0f}%" if human_n else "n/a"
    return {
        "period": label,
        "start_pt": start_pt.strftime("%Y-%m-%d %H:%M"),
        "end_pt": end_pt.strftime("%Y-%m-%d %H:%M"),
        "server_landings_human": human_n,
        "server_landings_bot": len(clicks) - human_n,
        "slicewp_visits": len(visits),
        "matched_landings": matched,
        "missed_landings": human_n - matched,
        "capture_rate": rate,
        "fbclid_landings": sum(1 for c in human if c["fbclid"]),
        "ttclid_landings": sum(1 for c in human if c["ttclid"]),
        "unique_ips": len({c["ip"] for c in human}),
        "misses": misses,
        "visits": visits,
    }


def main() -> None:
    windows = [
        summarize(
            "Aug 31 PRE-fix (midnight–7:22 PM PT)",
            datetime(2026, 8, 31, 0, 0, 0, tzinfo=PDT),
            FIX_PT,
        ),
        summarize(
            "Aug 31 POST-fix (7:22 PM–midnight PT)",
            FIX_PT,
            datetime(2026, 9, 1, 0, 0, 0, tzinfo=PDT),
        ),
        summarize(
            "Sep 1 full day PT (logs partial — see notes)",
            datetime(2026, 9, 1, 0, 0, 0, tzinfo=PDT),
            datetime(2026, 9, 2, 0, 0, 0, tzinfo=PDT),
        ),
    ]

    # Sep 1 access log only covers through ~04:30 UTC (Aug 31 ~9:30 PM PT).
    # Sep 1 PT-day visits exist in DB but landings aren't in logs yet.
    sep1_visits = windows[2]["visits"]
    if sep1_visits:
        print("Sep 1 PT visits (DB only — logs not rotated yet for this window):")
        for v in sep1_visits:
            print(f"  {v['pt'].strftime('%H:%M PT')} id={v['id']} ip={v['ip']} ref={(v['ref'] or '-')[:40]}")
            print(f"    landing={v['landing'][:80]}")
        print()

    out_csv = Path("/tmp/pedro-pgfit-capture-compare.csv")
    fields = [
        "period",
        "start_pt",
        "end_pt",
        "server_landings_human",
        "server_landings_bot",
        "slicewp_visits",
        "matched_landings",
        "missed_landings",
        "capture_rate",
        "fbclid_landings",
        "ttclid_landings",
        "unique_ips",
    ]
    with out_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(windows)

    print(f"Server-side fix live: {FIX_PT.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    print()
    for row in windows:
        print(f"=== {row['period']} ===")
        print(f"  Human landings: {row['server_landings_human']}  |  SliceWP visits: {row['slicewp_visits']}")
        print(f"  Matched: {row['matched_landings']}/{row['server_landings_human']} ({row['capture_rate']})")
        print(f"  Missed: {row['missed_landings']}  |  fbclid: {row['fbclid_landings']}  |  ttclid: {row['ttclid_landings']}")
        if row["misses"]:
            for m in row["misses"]:
                print(f"    MISS {m['ts_pt'].strftime('%H:%M PT')} {m['ip']} cache={m['cache']}")
        print()

    print(f"Wrote {out_csv}")


if __name__ == "__main__":
    main()
