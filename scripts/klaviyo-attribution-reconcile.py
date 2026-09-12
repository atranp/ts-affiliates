#!/usr/bin/env python3
"""Reconcile Klaviyo's own order attribution against affiliate commissions.

WordPress only records a Klaviyo click when the _kx token survives into the
landing URL, and it records email opens not at all. Klaviyo credits an order if
the customer opened OR clicked within the attribution window, which is why the
store-side number is far smaller than the one the email P&L is built on.

Attribution is not stored on the Placed Order event's properties. It lives in
separate attribution objects, pulled with include=attributions, which link the
order event to the campaign or flow that earned it.

Usage:
    export KLAVIYO_API_KEY=pk_...          # private key, events read scope
    python3 klaviyo-attribution-reconcile.py

The key is read from the environment only. It is never written to disk or
echoed, and the output file contains no credentials.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import bte_origin_model as M

API_ROOT = "https://a.klaviyo.com/api"
REVISION = os.environ.get("KLAVIYO_API_REVISION", "2026-04-15")
START, END = "2026-08-01", "2026-09-07"
OUT = Path(__file__).resolve().parents[1] / "docs" / "reports" / "true30-export" / "klaviyo-reconcile.json"


def api_key() -> str:
    key = os.environ.get("KLAVIYO_API_KEY", "").strip()
    if not key:
        sys.exit("KLAVIYO_API_KEY is not set. Export a private key with events read scope.")
    if not key.startswith("pk_"):
        sys.exit("That does not look like a Klaviyo private key (expected a pk_ prefix).")
    return key


def request(url: str, key: str, attempt: int = 0) -> dict:
    req = urllib.request.Request(url, headers={
        "Authorization": f"Klaviyo-API-Key {key}",
        "revision": REVISION,
        "accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in (429, 503) and attempt < 6:
            time.sleep(min(2 ** attempt, 30))
            return request(url, key, attempt + 1)
        body = exc.read().decode("utf-8", "replace")[:400]
        sys.exit(f"Klaviyo API {exc.code} on {url.split('?')[0]}: {body}")
    except urllib.error.URLError as exc:
        if attempt < 4:
            time.sleep(2 ** attempt)
            return request(url, key, attempt + 1)
        sys.exit(f"Klaviyo API unreachable: {exc}")


def placed_order_metric_id(key: str) -> str:
    url = f"{API_ROOT}/metrics/"
    while url:
        payload = request(url, key)
        for metric in payload.get("data", []):
            if metric.get("attributes", {}).get("name") == "Placed Order":
                return metric["id"]
        url = payload.get("links", {}).get("next")
    sys.exit("No 'Placed Order' metric found on this Klaviyo account.")


def order_id_of(event: dict) -> str | None:
    props = event.get("attributes", {}).get("event_properties") or {}
    value = props.get("$event_id") or props.get("OrderId") or props.get("order_id")
    return str(value).strip() if value not in (None, "") else None


def fetch_orders_and_attribution(key: str, metric_id: str) -> tuple[dict[str, str], dict[str, dict]]:
    """Return {event_id: order_id} and {event_id: {campaign/flow ids}}."""
    flt = (f'and(equals(metric_id,"{metric_id}"),'
           f'greater-or-equal(datetime,{START}T00:00:00Z),'
           f'less-than(datetime,{END}T00:00:00Z))')
    url = f"{API_ROOT}/events/?filter={urllib.parse.quote(flt)}&sort=datetime&include=attributions"

    orders: dict[str, str] = {}
    attribution: dict[str, dict] = {}
    pages = 0
    while url:
        payload = request(url, key)
        for event in payload.get("data", []):
            oid = order_id_of(event)
            if oid:
                orders[event["id"]] = oid
        for obj in payload.get("included", []):
            if obj.get("type") != "attribution":
                continue
            rel = obj.get("relationships", {})
            event_id = (rel.get("event", {}).get("data") or {}).get("id") or obj.get("id")
            entry = {}
            for name in ("campaign", "flow", "flow-message", "campaign-message", "attributed-event"):
                data = (rel.get(name, {}) or {}).get("data")
                if data and data.get("id"):
                    entry[name] = data["id"]
            if entry:
                attribution[event_id] = entry
        pages += 1
        print(f"  page {pages}: {len(orders)} orders, {len(attribution)} attributed", file=sys.stderr)
        url = payload.get("links", {}).get("next")
    return orders, attribution


def fetch_names(key: str, endpoint: str, extra_filter: str = "") -> dict[str, str]:
    names: dict[str, str] = {}
    url = f"{API_ROOT}/{endpoint}/"
    if extra_filter:
        url += f"?filter={urllib.parse.quote(extra_filter)}"
    while url:
        try:
            payload = request(url, key)
        except SystemExit:
            return names
        for obj in payload.get("data", []):
            names[obj["id"]] = obj.get("attributes", {}).get("name") or obj["id"]
        url = payload.get("links", {}).get("next")
    return names


def main() -> None:
    key = api_key()
    metric_id = placed_order_metric_id(key)
    print(f"Placed Order metric: {metric_id}", file=sys.stderr)

    orders, attribution = fetch_orders_and_attribution(key, metric_id)
    print(f"\n{len(orders)} Placed Order events, {len(attribution)} carry attribution", file=sys.stderr)

    campaign_names: dict[str, str] = {}
    for channel in ("email", "sms"):
        campaign_names.update(fetch_names(key, "campaigns", f"equals(messages.channel,'{channel}')"))
    flow_names = fetch_names(key, "flows")
    print(f"resolved {len(campaign_names)} campaigns, {len(flow_names)} flows", file=sys.stderr)

    model = M.load()
    rows = {str(r["order_id"]): r for r in model.bte_commissions(START, END)}

    matched, unmatched = [], 0
    for event_id, entry in attribution.items():
        order_id = orders.get(event_id)
        if not order_id:
            continue
        row = rows.get(order_id)
        if not row:
            unmatched += 1
            continue
        campaign_id = entry.get("campaign") or entry.get("campaign-message")
        flow_id = entry.get("flow") or entry.get("flow-message")
        label = campaign_names.get(campaign_id) if campaign_id else None
        if not label and flow_id:
            label = flow_names.get(flow_id)
        matched.append({
            **row,
            "klaviyo_campaign_id": campaign_id,
            "klaviyo_flow_id": flow_id,
            "klaviyo_label": label or (campaign_id or flow_id or "unlabelled"),
            "klaviyo_kind": "campaign" if campaign_id else ("flow" if flow_id else "unknown"),
        })

    kx_only = [r for r in rows.values() if r["via_klaviyo"]]
    kx_amt = sum(r["commission"] for r in kx_only)
    klaviyo_amt = sum(r["commission"] for r in matched)

    print("\n=== Affiliate commission on email-attributed orders ===")
    print(f"  Store-side (_kx in landing URL): {len(kx_only):5d} orders  ${kx_amt:>10,.2f}")
    print(f"  Klaviyo's own attribution:       {len(matched):5d} orders  ${klaviyo_amt:>10,.2f}")
    if kx_amt:
        print(f"  Undercounted by:                              ${klaviyo_amt - kx_amt:>10,.2f}"
              f"   ({klaviyo_amt / kx_amt:.1f}x)")
    print(f"  Klaviyo-attributed orders with no B/T/E commission: {unmatched}")

    print("\n=== By affiliate ===")
    for aid, name in M.BTE.items():
        sub = [r for r in matched if r["affiliate_id"] == aid]
        rep = sum(1 for r in sub if r["is_repeat"])
        print(f"  {name:6s} {len(sub):5d} orders  ${sum(r['commission'] for r in sub):>10,.2f}   repeat {rep}")

    print("\n=== Campaign vs flow ===")
    for kind in ("campaign", "flow", "unknown"):
        sub = [r for r in matched if r["klaviyo_kind"] == kind]
        if sub:
            print(f"  {kind:9s} {len(sub):5d} orders  ${sum(r['commission'] for r in sub):>10,.2f}")

    print("\n=== Top sends by affiliate commission paid ===")
    by_source = defaultdict(lambda: [0, 0.0])
    for row in matched:
        by_source[row["klaviyo_label"]][0] += 1
        by_source[row["klaviyo_label"]][1] += row["commission"]
    for label, (count, amount) in sorted(by_source.items(), key=lambda x: -x[1][1])[:25]:
        print(f"  {str(label)[:56]:56s} {count:4d}  ${amount:>9,.2f}")

    OUT.write_text(json.dumps({
        "period": f"{START}..{END}",
        "store_side_kx": {"orders": len(kx_only), "commission": round(kx_amt, 2)},
        "klaviyo_attributed": {"orders": len(matched), "commission": round(klaviyo_amt, 2)},
        "unmatched_klaviyo_orders": unmatched,
        "orders": matched,
    }, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
