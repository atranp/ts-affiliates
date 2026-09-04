#!/usr/bin/env python3
"""Export Pedro (#84 / PGFit) Aug 31 Pacific — access-log clicks vs SliceWP visits."""
from __future__ import annotations

import csv
import gzip
import io
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PDT = timezone(timedelta(hours=-7))
DAY_START = datetime(2026, 8, 31, 0, 0, 0, tzinfo=PDT)
DAY_END = datetime(2026, 9, 1, 0, 0, 0, tzinfo=PDT)
AFF_ID = 84
AFF_SLUG = "PGFit"
LOGDIR = Path.home() / "www/true-sciences.com/logs"
WP_ROOT = Path.home() / "www/true-sciences.com/public_html"

BOT_RE = re.compile(
    r"bot|crawl|spider|facebookexternalhit|preview|HeadlessChrome|Googlebot|bingbot|Slurp|Semrush|Ahrefs|PetalBot|Bytespider|meta-externalagent",
    re.I,
)
TS_RE = re.compile(r"\[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}) \+0000\]")
REQ_RE = re.compile(r'"(GET|HEAD|POST) ([^ ]+) HTTP/[0-9.]+" (\d{3}) ')
REF_UA_RE = re.compile(r'" (\d{3}) \d+ "([^"]*)" "([^"]*)"')
AFF_PATH_RE = re.compile(r"GET /aff/(?:PGFit|pgfit)(?:/|\?|\s)", re.I)
PGFIT_REF_RE = re.compile(r"/aff/(?:PGFit|pgfit)(?:/|\?)", re.I)


def parse_log_ts(line: str) -> datetime | None:
    m = TS_RE.search(line)
    if not m:
        return None
    return datetime.strptime(m.group(1), "%d/%b/%Y:%H:%M:%S").replace(tzinfo=timezone.utc)


def classify_source(referrer: str, path: str, ua: str) -> str:
    ref = (referrer or "").lower()
    if "tiktok" in ref or "musical_ly" in ua.lower():
        return "tiktok"
    if "instagram" in ref or "l.instagram" in ref:
        return "instagram"
    if "facebook" in ref or "fb." in ref:
        return "facebook"
    if "linktr" in ref:
        return "linktree"
    if ref in ("", "-"):
        return "direct_or_unknown"
    host = urlparse(referrer).netloc.lower()
    return host or "direct_or_unknown"


def fetch_visits() -> list[dict]:
    sql = """
SELECT id, date_created, ip_address, landing_url, referrer_url, commission_id
FROM zww_slicewp_visits
WHERE affiliate_id = 84
  AND date_created >= CONVERT_TZ('2026-08-31 00:00:00', 'America/Los_Angeles', '+00:00')
  AND date_created < CONVERT_TZ('2026-09-01 00:00:00', 'America/Los_Angeles', '+00:00')
ORDER BY date_created ASC;
"""
    out = subprocess.check_output(
        ["wp", "db", "query", sql, f"--path={WP_ROOT}"], text=True
    )
    rows: list[dict] = []
    for line in out.strip().splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        utc = datetime.strptime(parts[1], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        rows.append(
            {
                "visit_id": int(parts[0]),
                "date_created_utc": parts[1],
                "date_created_pt": utc.astimezone(PDT).strftime("%Y-%m-%d %H:%M:%S %Z"),
                "ip_address": parts[2],
                "landing_url": parts[3],
                "referrer_url": parts[4],
                "commission_id": parts[5],
            }
        )
    return rows


def iter_log_lines() -> list[str]:
    lines: list[str] = []
    for name in ("true-sciences.com-2026-08-31.gz", "true-sciences.com-2026-09-01.gz"):
        fp = LOGDIR / name
        if not fp.exists():
            continue
        with gzip.open(fp, "rt", errors="replace") as handle:
            lines.extend(handle.readlines())
    return lines


def match_visit(clicks: list[dict], visits: list[dict]) -> None:
    unused = visits.copy()
    for click in clicks:
        if click["record_type"] != "access_log_click":
            continue
        c_ts = datetime.strptime(click["timestamp_utc"], "%Y-%m-%d %H:%M:%S %z")
        c_ip = click["ip"]
        best = None
        best_delta = timedelta(days=99)
        for v in unused:
            if v["ip_address"] != c_ip:
                continue
            v_ts = datetime.strptime(v["date_created_utc"], "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=timezone.utc
            )
            delta = abs(v_ts - c_ts)
            if delta <= timedelta(minutes=10) and delta < best_delta:
                best = v
                best_delta = delta
        if best:
            click["matched_visit_id"] = str(best["visit_id"])
            click["visit_match_delta_sec"] = str(int(best_delta.total_seconds()))
            unused.remove(best)


def main() -> None:
    visits = fetch_visits()
    rows: list[dict] = []

    for line in iter_log_lines():
        if "/aff/" not in line.lower() and "/ts-visit" not in line.lower():
            continue
        ts_utc = parse_log_ts(line)
        if not ts_utc:
            continue
        ts_pt = ts_utc.astimezone(PDT)
        if ts_pt < DAY_START or ts_pt >= DAY_END:
            continue

        m_req = REQ_RE.search(line)
        if not m_req:
            continue
        method, path, status = m_req.group(1), m_req.group(2), m_req.group(3)

        ip = line.split()[0]
        ref, ua = "", ""
        m_ru = REF_UA_RE.search(line)
        if m_ru:
            ref, ua = m_ru.group(2), m_ru.group(3)

        is_bot = bool(BOT_RE.search(line))
        is_aff_land = (
            bool(AFF_PATH_RE.search(line))
            or path.lower().startswith("/aff/pgfit")
            or path.lower().startswith("/partners/aff/pgfit")
        )
        is_ts_visit = path == "/ts-visit.php" and bool(PGFIT_REF_RE.search(ref))

        if not (is_aff_land or is_ts_visit):
            continue

        cache = ""
        if " MISS " in line:
            cache = "MISS"
        elif " HIT " in line:
            cache = "HIT"

        record_type = "access_log_click"
        if is_ts_visit:
            record_type = "ts_visit_beacon"
        if method != "GET" and is_aff_land:
            record_type = "access_log_non_get"

        qs = ""
        if "?" in path:
            qs = path.split("?", 1)[1]

        rows.append(
            {
                "record_type": record_type,
                "timestamp_pt": ts_pt.strftime("%Y-%m-%d %H:%M:%S"),
                "timestamp_utc": ts_utc.strftime("%Y-%m-%d %H:%M:%S %z"),
                "method": method,
                "path": path.split("?", 1)[0],
                "query_string": qs,
                "http_status": status,
                "ip": ip,
                "referrer": ref,
                "user_agent": ua[:500],
                "source_bucket": classify_source(ref, path, ua),
                "is_bot": "yes" if is_bot else "no",
                "is_tiktok_ua": "yes" if "musical_ly" in ua.lower() or "tiktok" in ref.lower() else "no",
                "cdn_cache": cache,
                "matched_visit_id": "",
                "visit_match_delta_sec": "",
                "slicewp_landing_url": "",
                "slicewp_referrer_url": "",
                "converted_commission_id": "",
            }
        )

    aff_clicks = [r for r in rows if r["record_type"] == "access_log_click" and r["method"] == "GET"]
    match_visit(aff_clicks, visits)

    matched_ids = {int(r["matched_visit_id"]) for r in aff_clicks if r["matched_visit_id"]}
    for v in visits:
        if v["visit_id"] in matched_ids:
            continue
        rows.append(
            {
                "record_type": "slicewp_visit_unmatched_log",
                "timestamp_pt": v["date_created_pt"],
                "timestamp_utc": v["date_created_utc"] + " +0000",
                "method": "",
                "path": urlparse(v["landing_url"]).path if v["landing_url"] else "",
                "query_string": urlparse(v["landing_url"]).query if v["landing_url"] else "",
                "http_status": "",
                "ip": v["ip_address"],
                "referrer": v["referrer_url"],
                "user_agent": "",
                "source_bucket": classify_source(v["referrer_url"], v["landing_url"], ""),
                "is_bot": "",
                "is_tiktok_ua": "yes" if "tiktok" in (v["referrer_url"] or "").lower() else "no",
                "cdn_cache": "",
                "matched_visit_id": str(v["visit_id"]),
                "visit_match_delta_sec": "",
                "slicewp_landing_url": v["landing_url"],
                "slicewp_referrer_url": v["referrer_url"],
                "converted_commission_id": v["commission_id"],
            }
        )

    rows.sort(key=lambda r: (r["timestamp_pt"], r["record_type"]))

    out_path = Path("/tmp/pedro-pgfit-aug31-pt.csv")
    summary_path = Path("/tmp/pedro-pgfit-aug31-pt-summary.txt")
    fields = list(rows[0].keys()) if rows else []
    with out_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    human_gets = [r for r in aff_clicks if r["is_bot"] == "no" and r["http_status"] == "200"]
    bot_gets = [r for r in aff_clicks if r["is_bot"] == "yes" and r["http_status"] == "200"]
    matched = [r for r in human_gets if r["matched_visit_id"]]
    beacons = [r for r in rows if r["record_type"] == "ts_visit_beacon"]

    from collections import Counter

    status_counts = Counter(r["http_status"] for r in aff_clicks)
    human_sources = Counter(r["source_bucket"] for r in human_gets)
    human_ttclid = sum(1 for r in human_gets if "ttclid=" in r["query_string"])
    unique_ips_human = len({r["ip"] for r in human_gets})

    summary_lines = [
        "Pedro / PGFit (#84) — Aug 31 2026 Pacific (America/Los_Angeles)",
        "",
        f"SliceWP visits (DB): {len(visits)}",
        f"Access log GET /aff/PGFit: total={len(aff_clicks)} human_200={len(human_gets)} bot_200={len(bot_gets)}",
        f"Human GET unique IPs: {unique_ips_human}",
        f"Human GET with ttclid: {human_ttclid}",
        f"Human GETs matched to SliceWP visit (10m/IP): {len(matched)}",
        f"Human GETs NOT matched (missed visits): {len(human_gets) - len(matched)}",
        f"POST /ts-visit.php beacons: {len(beacons)}",
        f"SliceWP visits with no log match: {len(visits) - len(matched_ids)}",
        "",
        f"HTTP status (all GET clicks): {dict(status_counts)}",
        f"Human GET sources: {dict(human_sources)}",
        f"CDN cache (human GET): {dict(Counter(r['cdn_cache'] or 'unknown' for r in human_gets))}",
        "",
        "Interpretation: TikTok dashboard 'clicks' >> log landings when users tap but never load the page",
        "(in-app browser blocked, bounce before request, or click counted without navigation).",
    ]

    print(f"Wrote {len(rows)} rows -> {out_path}")
    for line in summary_lines:
        print(line)
    summary_path.write_text("\n".join(summary_lines) + "\n")
    print(f"Summary -> {summary_path}")


if __name__ == "__main__":
    main()
