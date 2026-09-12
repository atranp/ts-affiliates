#!/usr/bin/env python3
"""Per-affiliate PDF: how each commission was earned.

Data comes from scripts/bte_origin_model.py, which reads a read-only snapshot
of production pulled by scripts/bte-origin-extract.py. Every figure here is
derived from that snapshot -- nothing is hardcoded.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
import bte_origin_model as M  # noqa: E402

from generate_origin_common import CHROME, esc, table, usd  # noqa: E402

OUT = Path(__file__).parent

START, END = "2026-08-01", "2026-09-07"
PERIOD = "Aug 1 – Sep 6, 2026"
GENERATED = "Sep 7, 2026"

RECONCILE = OUT / "klaviyo-reconcile.json"
KLAVIYO_BY_AFFILIATE: dict[int, list[dict]] = {}


def load_klaviyo(model) -> None:
    """Attach Klaviyo's own order attribution, conservatively filtered."""
    if not RECONCILE.exists():
        print("warning: klaviyo-reconcile.json missing, email section will be empty")
        return
    payload = json.loads(RECONCILE.read_text())
    rows = {str(r["order_id"]): r for r in model.bte_commissions(START, END)}
    for order in payload.get("orders", []):
        site = rows.get(str(order["order_id"]))
        if not site:
            continue
        # Skip orders the customer reached on this affiliate's own link -- their
        # click, not our email, and claiming it would repeat the old overreach.
        if site["origin"] == "affiliate_link" and site["origin_affiliate"] == order["affiliate_id"]:
            continue
        KLAVIYO_BY_AFFILIATE.setdefault(order["affiliate_id"], []).append(order)

CSS = """
@page { size: letter; margin: 0.6in; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; line-height: 1.45; font-size: 11px; margin: 0; padding: 24px; }
h1 { font-size: 22px; margin: 0 0 6px; font-weight: 600; }
.subtitle { color: #555; margin: 0 0 4px; font-size: 12px; }
.note { color: #666; font-size: 10px; margin: 0 0 18px; max-width: 720px; }
.callout { border-left: 3px solid #1a4fd6; background: #f5f8ff; padding: 12px 14px; margin: 0 0 18px; border-radius: 0 4px 4px 0; }
.callout strong { font-size: 13px; }
h2 { font-size: 14px; margin: 22px 0 8px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: 10px; }
th, td { border: 1px solid #ddd; padding: 6px 7px; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: 600; }
td.num, th.num { text-align: right; }
tr.total td { background: #fafafa; font-weight: 600; }
.foot { color: #666; font-size: 9px; margin: 0 0 4px; max-width: 720px; }
.footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eee; color: #888; font-size: 9px; }
@media print { body { padding: 0; } tr { page-break-inside: avoid; } h2 { page-break-after: avoid; } }
"""


def lag_bucket(row) -> str:
    days = row["lag_days"]
    if days is None:
        return "No click on file — earned on the lifetime link"
    if days < 1:
        return "Same day as the click"
    if days < 7:
        return "1–7 days after the click"
    if days < 30:
        return "8–30 days after the click"
    return "More than 30 days after the click"


LAG_ORDER = [
    "Same day as the click",
    "1–7 days after the click",
    "8–30 days after the click",
    "More than 30 days after the click",
    "No click on file — earned on the lifetime link",
]

ARRIVAL_LABELS = {
    "affiliate_link": "Started on an affiliate link",
    "direct": "Typed the site in / came back directly",
    "organic": "Found the site through search",
    "klaviyo": "Clicked a True Sciences marketing email",
    "email_client": "Came from an email app (Gmail)",
    "referral": "Came from another website",
    "paid_ad": "Came from a True Sciences ad",
    "unknown": "Not recorded",
}


def render(model: M.Model, affiliate_id: int, rows: list[dict]) -> str:
    name = M.BTE[affiliate_id]
    mine = [r for r in rows if r["affiliate_id"] == affiliate_id]
    total_n = len(mine)
    total_amt = sum(r["commission"] for r in mine)

    own_ids = {
        r["order_id"] for r in mine
        if r["origin"] == "affiliate_link" and r["origin_affiliate"] == affiliate_id
    }
    no_click = [r for r in mine if r["order_id"] not in own_ids]
    no_click_amt = sum(r["commission"] for r in no_click)
    no_click_pct = (no_click_amt / total_amt * 100) if total_amt else 0

    # Who originally brought each of those returning customers to the store.
    # This is the headline: the money is overwhelmingly their own customers
    # coming back, not the cookie handing them somebody else's work.
    acq_counter = Counter()
    acq_amounts = Counter()
    for r in no_click:
        ft = r["first_touch"]
        owner = (ft["commission_affiliate"] or ft["origin_affiliate"]) if ft else None
        if owner == affiliate_id:
            key = "yours"
        elif owner in M.HOUSE_NAMES:
            key = "house"
        elif owner:
            key = "other_affiliate"
        elif ft and ft["origin"] in ("direct", "organic"):
            key = "self"
        else:
            key = "unrecorded"
        acq_counter[key] += 1
        acq_amounts[key] += r["commission"]

    ACQ_LABELS = [
        ("yours", f"{name} brought this customer to True Sciences"),
        ("self", "They found True Sciences on their own"),
        ("other_affiliate", "Another affiliate brought them"),
        ("house", "Our ads or email marketing brought them"),
        ("unrecorded", "Not recorded"),
    ]
    acq_rows = [
        [label, acq_counter[key], usd(acq_amounts[key]),
         f"{acq_amounts[key]/no_click_amt*100:.1f}%" if no_click_amt else "0.0%"]
        for key, label in ACQ_LABELS if acq_counter[key]
    ]
    yours_amt = acq_amounts["yours"]
    yours_n = acq_counter["yours"]
    yours_pct_total = (yours_amt / total_amt * 100) if total_amt else 0
    yours_pct_noclick = (yours_amt / no_click_amt * 100) if no_click_amt else 0

    # --- arrival breakdown -------------------------------------------------
    arrival_rows = []
    counter = Counter()
    amounts = Counter()
    for r in mine:
        key = r["origin"]
        if key == "affiliate_link" and r["origin_affiliate"] != affiliate_id:
            key = "affiliate_link_other"
        counter[key] += 1
        amounts[key] += r["commission"]
    for key, count in counter.most_common():
        if key == "affiliate_link_other":
            label = "Started on a different affiliate's link"
        elif key == "affiliate_link":
            label = f"Started on {name}'s own link"
        else:
            label = ARRIVAL_LABELS.get(key, key)
        arrival_rows.append([label, count, usd(amounts[key]), f"{amounts[key]/total_amt*100:.1f}%"])

    # --- click-to-order lag ------------------------------------------------
    lag_counter = Counter()
    lag_amounts = Counter()
    for r in mine:
        b = lag_bucket(r)
        lag_counter[b] += 1
        lag_amounts[b] += r["commission"]
    lag_rows = [
        [b, lag_counter[b], usd(lag_amounts[b])] for b in LAG_ORDER if lag_counter[b]
    ]
    later = sum(v for b, v in lag_counter.items() if b != "Same day as the click")
    later_amt = sum(v for b, v in lag_amounts.items() if b != "Same day as the click")

    # --- email marketing ---------------------------------------------------
    # Klaviyo's own attribution, not the store's. The store only sees an email
    # click when the tracking token survives into the landing URL, which misses
    # most of it -- customers who open an email and come back later look like
    # direct traffic on our side. Orders where the customer arrived on this
    # affiliate's own link are excluded, so nothing here is claimed twice.
    email_rows = sorted(
        (r for r in KLAVIYO_BY_AFFILIATE.get(affiliate_id, [])),
        key=lambda x: x["date"],
    )
    email_amt = sum(r["commission"] for r in email_rows)
    email_repeat = [r for r in email_rows if r["is_repeat"]]

    # Keep this high level. The internal campaign and flow names mean nothing
    # to an affiliate, so group into the two kinds of email in plain language.
    KIND_LABELS = [
        ("campaign", "Newsletters and announcements we sent out"),
        ("flow", "Automatic reminder emails (welcome, cart and browse reminders)"),
    ]
    send_rows = []
    for kind, label in KIND_LABELS:
        sub = [r for r in email_rows if r["klaviyo_kind"] == kind]
        if sub:
            send_rows.append([label, len(sub), usd(sum(r["commission"] for r in sub))])
    email_sends = len({r["klaviyo_label"] for r in email_rows})

    # --- repeat customers --------------------------------------------------
    repeat = [r for r in mine if r["is_repeat"]]
    repeat_amt = sum(r["commission"] for r in repeat)

    email_section = ""
    if email_rows:
        email_section = f"""
<h2>Orders our email marketing brought back to you</h2>
<p class="foot">
When we email our customers and one of them comes back and buys, you get paid if your cookie or lifetime link is
already on file. Across {email_sends} different emails this period, that happened
<strong>{len(email_rows)} times and earned you {usd(email_amt)}</strong> — and
{len(email_repeat)} of those were customers buying from us again.
</p>
{table(
    ["What brought them back", "Orders", "Your commission"],
    send_rows,
    right_cols={1, 2},
    total_row=["All emails", len(email_rows), usd(email_amt)],
)}
<p class="foot">
None of these orders came from someone clicking your link — we have left those out entirely, so nothing here is
counted as our doing when it was really yours.
</p>
"""

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{esc(name)} — how your commissions were earned</title>
<style>{CSS}</style></head>
<body>
<h1>How your commissions were earned</h1>
<p class="subtitle">{esc(name)} · {PERIOD}</p>
<p class="note">
This is a breakdown of every commission you earned in this period, showing how each customer actually reached
the site. It is built directly from the store's order and tracking records.
</p>

<div class="callout">
<strong>{total_n:,} orders · {usd(total_amt)} earned</strong><br>
{usd(yours_amt)} of that — {yours_pct_total:.0f}% of everything you earned — came from customers <em>you</em>
brought to True Sciences, coming back to buy again without clicking your link. You introduced them to us, and
you keep earning every time they return.
</div>

<h2>The customers behind your repeat commissions</h2>
<p class="foot">
{usd(no_click_amt)} of your commission came from orders where the customer did not arrive on your link — they
came back on their own, through search, or through one of our emails. This is who originally brought each of
those customers to True Sciences.
</p>
{table(
    ["Who first brought the customer in", "Orders", "Your commission", "Share"],
    acq_rows,
    right_cols={1, 2, 3},
    total_row=["Orders without a click on your link", len(no_click), usd(no_click_amt), "100.0%"],
)}
<p class="foot">
<strong>{yours_n:,} of those orders ({usd(yours_amt)}, {yours_pct_noclick:.0f}%) were your own customers.</strong>
Bringing someone to True Sciences once keeps paying you long after that first order.
</p>

<h2>How the customer reached the site</h2>
{table(
    ["How they arrived", "Orders", "Your commission", "Share"],
    arrival_rows,
    right_cols={1, 2, 3},
    total_row=["All orders", total_n, usd(total_amt), "100.0%"],
)}

<h2>Your link kept earning after the click</h2>
<p class="foot">
A click on your link is remembered for 30 days, and customers who are permanently linked to you count for
longer than that. This is the gap between the click that earned each commission and the order itself.
</p>
{table(
    ["When the order came in", "Orders", "Your commission"],
    lag_rows,
    right_cols={1, 2},
    total_row=["All orders", total_n, usd(total_amt)],
)}
<p class="foot">
<strong>{later:,} of your {total_n:,} orders ({usd(later_amt)}) came in after the day of the click.</strong>
Without that window, those orders would not have paid you.
</p>
{email_section}
<h2>Repeat customers</h2>
<p class="foot">
{len(repeat):,} of your {total_n:,} orders came from someone who had bought from True Sciences before.
</p>
{table(
    ["Customer type", "Orders", "Your commission"],
    [
        ["Ordering for the first time", total_n - len(repeat), usd(total_amt - repeat_amt)],
        ["Bought from us before", len(repeat), usd(repeat_amt)],
    ],
    right_cols={1, 2},
    total_row=["All orders", total_n, usd(total_amt)],
)}

<h2>How this was put together</h2>
<p class="foot">
Figures cover orders placed between {PERIOD}, counting completed and processing orders only. Commission totals
include amounts already paid out as well as amounts still pending. "How the customer reached the site" uses the
first page of the visit the order came from. Email-driven orders are counted using our email platform's own
attribution, which credits a campaign or flow when the customer engaged with that email shortly before ordering
— this is why more orders appear in the email section than in the arrival table above, where only visits that
physically began on an email link are counted. Every line traces back to a specific order number and can be
checked against the store records.
</p>

<div class="footer">Generated {GENERATED} · true-sciences.com affiliate commission review · {esc(name)}</div>
</body></html>"""


def main() -> None:
    model = M.load()
    rows = model.bte_commissions(START, END)
    load_klaviyo(model)
    for affiliate_id, name in M.BTE.items():
        slug = f"{name.lower()}-commission-origin"
        html_path = OUT / f"{slug}.html"
        pdf_path = OUT / f"{slug}.pdf"
        html_path.write_text(render(model, affiliate_id, rows), encoding="utf-8")
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
             f"--print-to-pdf={pdf_path}", f"file://{html_path.resolve()}"],
            check=True, capture_output=True,
        )
        mine = [r for r in rows if r["affiliate_id"] == affiliate_id]
        print(f"{name:6s} {len(mine):5d} orders  ${sum(r['commission'] for r in mine):>10,.2f}  -> {pdf_path.name}")


if __name__ == "__main__":
    main()
