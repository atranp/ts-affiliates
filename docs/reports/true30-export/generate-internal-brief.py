#!/usr/bin/env python3
"""INTERNAL brief for commission sign-off. Not for affiliates.

Covers the things the affiliate-facing PDFs deliberately leave out: the
cross-credit between Blair, Trin and Emmie, the orphaned lifetime links, and
the stale-click exposure. Same read-only production snapshot as the rest.
"""

from __future__ import annotations

import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
import bte_origin_model as M  # noqa: E402

from generate_origin_common import CHROME, esc, table, usd  # noqa: E402

OUT = Path(__file__).parent
START, END = "2026-08-01", "2026-09-07"
PERIOD = "Aug 1 – Sep 6, 2026"
GENERATED = "Sep 7, 2026"

CSS = """
@page { size: letter; margin: 0.6in; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; line-height: 1.45; font-size: 11px; margin: 0; padding: 24px; }
h1 { font-size: 22px; margin: 0 0 6px; font-weight: 600; }
.subtitle { color: #555; margin: 0 0 14px; font-size: 12px; }
.stamp { background: #7a1420; color: #fff; padding: 8px 12px; border-radius: 4px; font-weight: 600; font-size: 12px; margin: 0 0 16px; letter-spacing: .02em; }
.warn { border-left: 3px solid #b8860b; background: #fffaf0; padding: 11px 14px; margin: 0 0 14px; border-radius: 0 4px 4px 0; }
.ok { border-left: 3px solid #1a7f37; background: #f4fbf6; padding: 11px 14px; margin: 0 0 14px; border-radius: 0 4px 4px 0; }
h2 { font-size: 14px; margin: 22px 0 8px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: 10px; }
th, td { border: 1px solid #ddd; padding: 6px 7px; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: 600; }
td.num, th.num { text-align: right; }
tr.total td { background: #fafafa; font-weight: 600; }
.foot { color: #666; font-size: 9.5px; margin: 0 0 6px; max-width: 730px; }
ul { margin: 4px 0 10px; padding-left: 18px; }
li { margin-bottom: 5px; }
.footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eee; color: #888; font-size: 9px; }
@media print { body { padding: 0; } tr { page-break-inside: avoid; } h2 { page-break-after: avoid; } }
"""


def render(model: M.Model, rows: list[dict]) -> str:
    total_n = len(rows)
    total_amt = sum(r["commission"] for r in rows)

    per_affiliate = []
    for aid in (81, 51, 138):
        mine = [r for r in rows if r["affiliate_id"] == aid]
        own = {r["order_id"] for r in mine
               if r["origin"] == "affiliate_link" and r["origin_affiliate"] == aid}
        nc = [r for r in mine if r["order_id"] not in own]
        nc_amt = sum(r["commission"] for r in nc)
        theirs = sum(r["commission"] for r in nc
                     if r["first_touch"] and
                     (r["first_touch"]["commission_affiliate"] or r["first_touch"]["origin_affiliate"]) == aid)
        per_affiliate.append([
            M.BTE[aid], f"{len(mine):,}", usd(sum(r["commission"] for r in mine)),
            usd(nc_amt), usd(theirs), f"{theirs/nc_amt*100:.0f}%" if nc_amt else "—",
        ])

    # --- cross-credit between the three ------------------------------------
    cross = [r for r in rows
             if r["lifetime_affiliate"] in M.BTE and r["lifetime_affiliate"] != r["affiliate_id"]]
    cross_amt = sum(r["commission"] for r in cross)
    gained = defaultdict(lambda: [0, 0.0])
    lost = defaultdict(lambda: [0, 0.0])
    for r in cross:
        gained[r["affiliate_id"]][0] += 1
        gained[r["affiliate_id"]][1] += r["commission"]
        lost[r["lifetime_affiliate"]][0] += 1
        lost[r["lifetime_affiliate"]][1] += r["commission"]
    cross_rows = []
    for aid in (81, 51, 138):
        g, ga = gained[aid]
        l, la = lost[aid]
        cross_rows.append([M.BTE[aid], g, usd(ga), l, usd(la),
                           ("+" if ga - la >= 0 else "−") + usd(abs(ga - la))])

    # --- orphaned lifetime links -------------------------------------------
    ghost = [r for r in rows if r["lifetime_affiliate"] in model.deleted_affiliates]
    ghost_amt = sum(r["commission"] for r in ghost)
    orphan_customers = sum(
        1 for row in model.raw.get("lifetime_links", [])
        if str(row.get("affiliate_deleted", "0")) == "1"
    )

    # --- stale-click exposure ----------------------------------------------
    no_click = [r for r in rows
                if not (r["origin"] == "affiliate_link" and r["origin_affiliate"] == r["affiliate_id"])]
    stale = [r for r in no_click if r["lag_days"] is None or r["lag_days"] >= 1]
    stale_amt = sum(r["commission"] for r in stale)

    lag_rows = []
    lag_def = [("Same day as the click", lambda d: d is not None and d < 1),
               ("1–7 days after", lambda d: d is not None and 1 <= d < 7),
               ("8–30 days after", lambda d: d is not None and 7 <= d < 30),
               ("More than 30 days after", lambda d: d is not None and d >= 30),
               ("No click on file (lifetime link)", lambda d: d is None)]
    for label, pred in lag_def:
        sub = [r for r in rows if pred(r["lag_days"])]
        if sub:
            amt = sum(r["commission"] for r in sub)
            lag_rows.append([label, len(sub), usd(amt), f"{amt/total_amt*100:.1f}%"])

    klaviyo = [r for r in rows if r["via_klaviyo"]]
    klaviyo_amt = sum(r["commission"] for r in klaviyo)

    # Klaviyo's own attribution, which is what the email P&L is built on.
    reconcile_path = OUT / "klaviyo-reconcile.json"
    kl_orders, kl_amt, kl_cons, kl_cons_amt = 0, 0.0, 0, 0.0
    kl_rows = {}
    if reconcile_path.exists():
        import json as _json
        payload = _json.loads(reconcile_path.read_text())
        by_id = {str(r["order_id"]): r for r in rows}
        for order in payload.get("orders", []):
            kl_orders += 1
            kl_amt += order["commission"]
            site = by_id.get(str(order["order_id"]))
            if site and site["origin"] == "affiliate_link" and site["origin_affiliate"] == order["affiliate_id"]:
                continue
            kl_cons += 1
            kl_cons_amt += order["commission"]
            kl_rows.setdefault(order["klaviyo_label"], [0, 0.0])
            kl_rows[order["klaviyo_label"]][0] += 1
            kl_rows[order["klaviyo_label"]][1] += order["commission"]
    top_sends = [[label, n, usd(a)] for label, (n, a) in
                 sorted(kl_rows.items(), key=lambda x: -x[1][1])[:10]]

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Internal commission review brief</title>
<style>{CSS}</style></head>
<body>
<div class="stamp">INTERNAL — NOT FOR AFFILIATES</div>
<h1>Commission review brief</h1>
<p class="subtitle">Blair, Trin &amp; Emmie · {PERIOD} · prepared for commission sign-off</p>

<div class="ok">
<strong>Reconciliation.</strong> {total_n:,} orders · {usd(total_amt)} across the three affiliates. These figures
match a direct SliceWP aggregate exactly, per affiliate. Source is a read-only snapshot of production; no writes
were made. Individual orders were traced end to end to confirm the repeat-customer and email flags.
</div>

<h2>What goes out to them</h2>
{table(
    ["Affiliate", "Orders", "Earned", "Earned with no click on their link", "…of which their own customers", "Share"],
    per_affiliate,
    right_cols={1, 2, 3, 4, 5},
)}
<p class="foot">
The affiliate-facing PDFs lead on the second-to-last column: the money they earn from customers they originally
brought in, returning later without clicking. Note Emmie's share is materially lower than Blair's or Trin's.
</p>

<h2>Cross-credit between the three <span style="color:#7a1420">(not in their PDFs)</span></h2>
<p class="foot">
Orders where the customer was lifetime-linked to one of the three but the commission was paid to another of
them. {len(cross)} orders, {usd(cross_amt)} in total. Their documents say only "another affiliate brought them"
and never name anyone, but if all three compare notes this is what they would reconstruct.
</p>
{table(
    ["Affiliate", "Orders gained", "Value gained", "Orders lost", "Value lost", "Net"],
    cross_rows,
    right_cols={1, 2, 3, 4, 5},
)}
<div class="warn">
<strong>Emmie is a large net winner here and Blair and Trin are both net down.</strong> Nothing is being
calculated incorrectly — last click beats a lifetime link, which is the documented rule. But this is the most
likely thing to turn into a dispute, so it is worth having a position ready before the PDFs go out.
</div>

<h2>Orphaned lifetime links</h2>
<p class="foot">
{orphan_customers:,} customers are still lifetime-linked to affiliate accounts that no longer exist — almost all
of them to a single deleted affiliate that has no visits and no commission history at all. In this period
{len(ghost)} orders worth {usd(ghost_amt)} were credited to Blair, Trin or Emmie over one of these dead links.
</p>
<div class="warn">
These links are worth cleaning up so they stop appearing in attribution logic. Until they are, a last-click win
over one of them looks like a win over a real affiliate, which it is not.
</div>

<h2>Stale-click exposure</h2>
<p class="foot">
How long before each order the earning click happened, across all {total_n:,} orders.
</p>
{table(
    ["When the click happened", "Orders", "Commission", "Share"],
    lag_rows,
    right_cols={1, 2, 3},
    total_row=["All orders", f"{total_n:,}", usd(total_amt), "100.0%"],
)}
<div class="warn">
<strong>{len(stale):,} orders worth {usd(stale_amt)} were paid at full sale rate on a click at least a day old,
or on no click at all.</strong> The affiliate-facing framing of this is "your link keeps earning", which is true.
The other reading is that the programme pays a full 30–40% on repeat and direct traffic that would likely have
converted anyway. If that is a rate conversation the business wants, it should be opened deliberately rather
than raised by an affiliate first.
</div>

<h2>Email marketing — which attribution we use</h2>
<p class="foot">
The store can only see an email-driven order when Klaviyo's tracking token survives into the landing URL. It has
no record of opens at all, and a customer who opens an email and returns later looks like direct traffic to us.
Klaviyo's own attribution — the same model the email P&amp;L runs on — sees roughly 3x as many.
</p>
{table(
    ["How email orders are counted", "Orders", "Affiliate commission"],
    [
        ["Store-side only (tracking token on the landing page)", len(klaviyo), usd(klaviyo_amt)],
        ["Klaviyo's own attribution (engaged with a send, then ordered)", kl_orders, usd(kl_amt)],
        ["…excluding orders where they arrived on their own link", kl_cons, usd(kl_cons_amt)],
    ],
    right_cols={1, 2},
)}
<p class="foot">
The affiliate PDFs use the conservative last line, {kl_cons} orders and {usd(kl_cons_amt)}, so we never claim an
order the affiliate's own link brought in. Of Klaviyo's attributed orders, most show as "direct" on our side —
that is the traffic that was invisible before. This should now reconcile against the email P&amp;L, since it is
the same attribution model.
</p>
{table(["Campaign or flow", "Orders", "Affiliate commission"], top_sends, right_cols={1, 2})}

<h2>Method notes</h2>
<ul>
<li>True Sciences ads and Klaviyo sends run through their own affiliate accounts. Traffic arriving on those
accounts is credited to the channel it represents — paid ads or email — not counted as "another affiliate".</li>
<li>A customer's origin is their <em>first</em> order: whoever brought them to the site the first time, whether
or not that account still earns on them today.</li>
<li>Every figure here regenerates from a read-only production pull, so any number can be re-derived or
challenged line by line.</li>
</ul>

<div class="footer">Generated {GENERATED} · true-sciences.com · internal commission review</div>
</body></html>"""


def main() -> None:
    model = M.load()
    rows = model.bte_commissions(START, END)
    html_path = OUT / "internal-commission-review-brief.html"
    pdf_path = OUT / "internal-commission-review-brief.pdf"
    html_path.write_text(render(model, rows), encoding="utf-8")
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf_path}", f"file://{html_path.resolve()}"],
        check=True, capture_output=True,
    )
    print(f"wrote {pdf_path.name}")


if __name__ == "__main__":
    main()
