#!/usr/bin/env python3
"""Sitewide SliceWP visit capture: pre vs post server-side fix."""
from __future__ import annotations

import csv
import gzip
import glob
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

PDT = timezone(timedelta(hours=-7))
FIX_UTC = datetime(2026, 9, 1, 2, 22, 34, tzinfo=timezone.utc)
FIX_PT = FIX_UTC.astimezone(PDT)
LOGDIR = Path.home() / "www/true-sciences.com/logs"
WP_ROOT = Path.home() / "www/true-sciences.com/public_html"

TS_RE = re.compile(r"\[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}) \+0000\]")
REQ_RE = re.compile(r'"(GET|HEAD|POST) ([^ ]+) HTTP/[0-9.]+" (\d{3}) ')
BOT_RE = re.compile(
    r"bot|crawl|spider|facebookexternalhit|preview|HeadlessChrome|Googlebot|bingbot|Slurp|Semrush|Ahrefs|PetalBot|Bytespider|meta-externalagent|pageburst",
    re.I,
)
# Any affiliate landing path segment
AFF_LANDING = re.compile(
    r"^/(?:aff/[^/?]+|(?:shop|product/[^/]+|checkout|cart|my-account)/aff/[^/?]+)",
    re.I,
)


def wp_query(sql: str) -> list[list[str]]:
    out = subprocess.check_output(["wp", "db", "query", sql, f"--path={WP_ROOT}"], text=True)
    lines = out.strip().splitlines()
    return [ln.split("\t") for ln in lines[1:]] if len(lines) > 1 else []


def parse_ts(line: str) -> datetime | None:
    m = TS_RE.search(line)
    if not m:
        return None
    return datetime.strptime(m.group(1), "%d/%b/%Y:%H:%M:%S").replace(tzinfo=timezone.utc)


def iter_log_files() -> list[Path]:
    return sorted(
        glob.glob(str(LOGDIR / "true-sciences.com-2026-08-2[5-9].gz"))
        + glob.glob(str(LOGDIR / "true-sciences.com-2026-08-3[01].gz"))
        + glob.glob(str(LOGDIR / "true-sciences.com-2026-09-0[12].gz"))
    )


def parse_landings(start_pt: datetime, end_pt: datetime) -> list[dict]:
    rows: list[dict] = []
    for fp_str in iter_log_files():
        with gzip.open(fp_str, "rt", errors="replace") as handle:
            for line in handle:
                if "/aff/" not in line.lower():
                    continue
                ts_utc = parse_ts(line)
                if not ts_utc:
                    continue
                ts_pt = ts_utc.astimezone(PDT)
                if ts_pt < start_pt or ts_pt >= end_pt:
                    continue
                m = REQ_RE.search(line)
                if not m or m.group(1) != "GET" or m.group(3) != "200":
                    continue
                path = m.group(2).split("?", 1)[0]
                if not AFF_LANDING.match(path):
                    continue
                rows.append(
                    {
                        "ts_utc": ts_utc,
                        "ts_pt": ts_pt,
                        "ip": line.split()[0],
                        "path": path,
                        "bot": bool(BOT_RE.search(line)),
                        "post_fix": ts_utc >= FIX_UTC,
                    }
                )
    return rows


def fetch_visits(start_pt: datetime, end_pt: datetime) -> list[dict]:
    sql = f"""
SELECT id, affiliate_id, date_created, ip_address
FROM zww_slicewp_visits
WHERE date_created >= CONVERT_TZ('{start_pt.strftime("%Y-%m-%d %H:%M:%S")}', 'America/Los_Angeles', '+00:00')
  AND date_created < CONVERT_TZ('{end_pt.strftime("%Y-%m-%d %H:%M:%S")}', 'America/Los_Angeles', '+00:00')
ORDER BY date_created ASC;
"""
    rows: list[dict] = []
    for parts in wp_query(sql):
        if len(parts) < 4:
            continue
        utc = datetime.strptime(parts[2], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        rows.append(
            {
                "id": int(parts[0]),
                "affiliate_id": int(parts[1]),
                "utc": utc,
                "pt": utc.astimezone(PDT),
                "ip": parts[3],
                "post_fix": utc >= FIX_UTC,
            }
        )
    return rows


def match_landings(landings: list[dict], visits: list[dict]) -> tuple[int, int, int]:
    human = [r for r in landings if not r["bot"]]
    used: set[int] = set()
    matched = 0
    for landing in human:
        best = None
        best_d = timedelta(days=99)
        for v in visits:
            if v["id"] in used or v["ip"] != landing["ip"]:
                continue
            d = abs(v["utc"] - landing["ts_utc"])
            if d <= timedelta(minutes=10) and d < best_d:
                best, best_d = v, d
        if best:
            matched += 1
            used.add(best["id"])
    return matched, len(human), len(landings) - len(human)


def summarize_period(label: str, start_pt: datetime, end_pt: datetime) -> dict:
    landings = parse_landings(start_pt, end_pt)
    visits = fetch_visits(start_pt, end_pt)
    matched, human_n, bot_n = match_landings(landings, visits)
    hours = (end_pt - start_pt).total_seconds() / 3600
    rate = f"{100 * matched / human_n:.1f}%" if human_n else "n/a"
    visit_per_landing = f"{100 * len(visits) / human_n:.1f}%" if human_n else "n/a"
    return {
        "period": label,
        "hours": round(hours, 1),
        "start_pt": start_pt.strftime("%Y-%m-%d %H:%M"),
        "end_pt": end_pt.strftime("%Y-%m-%d %H:%M"),
        "log_landings_human": human_n,
        "log_landings_bot": bot_n,
        "slicewp_visits": len(visits),
        "matched_10m_ip": matched,
        "unmatched_landings": human_n - matched,
        "capture_rate_matched": rate,
        "visits_per_landing": visit_per_landing,
        "landings_per_hour": round(human_n / hours, 1) if hours else 0,
        "visits_per_hour": round(len(visits) / hours, 1) if hours else 0,
    }


def daily_breakdown() -> list[dict]:
    rows: list[dict] = []
    for day in range(25, 32):
        start = datetime(2026, 8, day, 0, 0, 0, tzinfo=PDT)
        end = datetime(2026, 8, day + 1, 0, 0, 0, tzinfo=PDT) if day < 31 else datetime(2026, 9, 1, 0, 0, 0, tzinfo=PDT)
        landings = parse_landings(start, end)
        visits = fetch_visits(start, end)
        matched, human_n, _ = match_landings(landings, visits)
        rows.append(
            {
                "date_pt": f"2026-08-{day:02d}",
                "phase": "pre-fix",
                "log_landings_human": human_n,
                "slicewp_visits": len(visits),
                "matched": matched,
                "capture_rate": f"{100 * matched / human_n:.1f}%" if human_n else "n/a",
            }
        )
    # Aug 31 split at fix
    aug31_pre = summarize_period(
        "Aug31 pre-fix slice",
        datetime(2026, 8, 31, 0, 0, 0, tzinfo=PDT),
        FIX_PT,
    )
    # Post-fix log coverage ends ~21:29 PT Aug 31 (log file limit)
    log_end = datetime(2026, 8, 31, 21, 29, 0, tzinfo=PDT)
    aug31_post = summarize_period("Aug31 post-fix (logs)", FIX_PT, log_end)
    sep1 = summarize_period(
        "Sep1 PT (DB; logs N/A)",
        datetime(2026, 9, 1, 0, 0, 0, tzinfo=PDT),
        datetime(2026, 9, 2, 0, 0, 0, tzinfo=PDT),
    )
    return rows, aug31_pre, aug31_post, sep1


def top_affiliates_pre_post() -> list[dict]:
    sql_pre = f"""
SELECT affiliate_id, COUNT(*) c FROM zww_slicewp_visits
WHERE date_created >= CONVERT_TZ('2026-08-25 00:00:00', 'America/Los_Angeles', '+00:00')
  AND date_created < CONVERT_TZ('{FIX_PT.strftime("%Y-%m-%d %H:%M:%S")}', 'America/Los_Angeles', '+00:00')
GROUP BY affiliate_id ORDER BY c DESC LIMIT 15;
"""
    sql_post = f"""
SELECT affiliate_id, COUNT(*) c FROM zww_slicewp_visits
WHERE date_created >= CONVERT_TZ('{FIX_PT.strftime("%Y-%m-%d %H:%M:%S")}', 'America/Los_Angeles', '+00:00')
  AND date_created < CONVERT_TZ('2026-09-02 00:00:00', 'America/Los_Angeles', '+00:00')
GROUP BY affiliate_id ORDER BY c DESC LIMIT 15;
"""
    pre = {int(r[0]): int(r[1]) for r in wp_query(sql_pre)}
    post = {int(r[0]): int(r[1]) for r in wp_query(sql_post)}
    ids = sorted(set(pre) | set(post), key=lambda i: pre.get(i, 0) + post.get(i, 0), reverse=True)[:15]
    names = {}
    if ids:
        id_list = ",".join(str(i) for i in ids)
        for r in wp_query(
            f"SELECT a.id, u.display_name FROM zww_slicewp_affiliates a JOIN zww_users u ON u.ID=a.user_id WHERE a.id IN ({id_list});"
        ):
            names[int(r[0])] = r[1]
    out = []
    for aid in ids:
        p, po = pre.get(aid, 0), post.get(aid, 0)
        out.append({"affiliate_id": aid, "name": names.get(aid, ""), "visits_pre_fix": p, "visits_post_fix": po})
    return out


def main() -> None:
    daily, aug31_pre, aug31_post, sep1 = daily_breakdown()

    # Full pre-fix window Aug 25 – fix
    pre = summarize_period(
        "Aug 25 – fix (pre)",
        datetime(2026, 8, 25, 0, 0, 0, tzinfo=PDT),
        FIX_PT,
    )
    post_db = summarize_period(
        "Fix – Sep 2 (post, DB)",
        FIX_PT,
        datetime(2026, 9, 2, 0, 0, 0, tzinfo=PDT),
    )

    out_dir = Path("/tmp")
    daily_csv = out_dir / "sitewide-capture-daily-pre.csv"
    summary_csv = out_dir / "sitewide-capture-pre-post.csv"
    aff_csv = out_dir / "sitewide-capture-by-affiliate.csv"

    with daily_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(daily[0].keys()))
        w.writeheader()
        w.writerows(daily)

    periods = [pre, aug31_pre, aug31_post, post_db, sep1]
    fields = list(pre.keys())
    with summary_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(periods)

    aff_rows = top_affiliates_pre_post()
    with aff_csv.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(aff_rows[0].keys()) if aff_rows else [])
        w.writeheader()
        w.writerows(aff_rows)

    print(f"Server-side fix: {FIX_PT.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    print()
    print("=== SITewide pre vs post (all affiliates) ===")
    for row in [pre, post_db]:
        print(f"{row['period']} ({row['hours']}h)")
        print(f"  Log landings (human): {row['log_landings_human']:,}  ({row['landings_per_hour']}/hr)")
        print(f"  SliceWP visits:       {row['slicewp_visits']:,}  ({row['visits_per_hour']}/hr)")
        print(f"  Matched 10m/IP:       {row['matched_10m_ip']:,} / {row['log_landings_human']:,} = {row['capture_rate_matched']}")
        print(f"  Unmatched landings:   {row['unmatched_landings']:,}")
        print()

    print("=== Aug 31 split at fix ===")
    for row in [aug31_pre, aug31_post]:
        print(f"{row['period']} ({row['hours']}h): landings={row['log_landings_human']} visits={row['slicewp_visits']} capture={row['capture_rate_matched']}")
    print()

    print("=== Daily pre-fix capture (Aug 25-31) ===")
    for d in daily:
        print(f"  {d['date_pt']}: landings={d['log_landings_human']:>4} visits={d['slicewp_visits']:>4} capture={d['capture_rate']}")
    print()

    print("=== Top affiliates visits pre vs post-fix ===")
    for r in aff_rows[:10]:
        print(f"  #{r['affiliate_id']:<4} {r['name'][:20]:<20} pre={r['visits_pre_fix']:>5} post={r['visits_post_fix']:>4}")

    print()
    print(f"Wrote {daily_csv}, {summary_csv}, {aff_csv}")


if __name__ == "__main__":
    main()
