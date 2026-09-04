#!/usr/bin/env python3
"""Generate affiliate-facing true30 HTML + PDF exports."""

import html
import subprocess
from pathlib import Path

OUT = Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@page { size: letter; margin: 0.6in; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; line-height: 1.45; font-size: 11px; max-width: 100%; margin: 0; padding: 24px; }
h1 { font-size: 22px; margin: 0 0 6px; font-weight: 600; }
.subtitle { color: #555; margin: 0 0 4px; font-size: 12px; }
.note { color: #666; font-size: 10px; margin: 0 0 20px; max-width: 720px; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 0 18px; }
.stat { border: 1px solid #ddd; padding: 10px 12px; border-radius: 4px; }
.stat-label { color: #666; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
.stat-value { font-size: 18px; font-weight: 600; margin-top: 2px; }
.callout { border-left: 3px solid #c97a00; background: #fff8ee; padding: 12px 14px; margin: 0 0 20px; border-radius: 0 4px 4px 0; }
.callout-title { font-weight: 600; margin-bottom: 4px; }
h2 { font-size: 14px; margin: 22px 0 8px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: 9.5px; }
th, td { border: 1px solid #ddd; padding: 5px 6px; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: 600; }
td.num, th.num { text-align: right; }
.badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; }
.badge-later { background: #eef3ff; color: #1a4fd6; }
.badge-same { background: #eef8ee; color: #1a7a1a; }
.foot { color: #666; font-size: 9px; margin-top: 6px; }
.footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eee; color: #888; font-size: 9px; }
h3 { font-size: 12px; margin: 16px 0 6px; font-weight: 600; }
.appendix-intro { color: #555; font-size: 10px; margin: 0 0 14px; max-width: 720px; }
.appendix-block { margin-bottom: 14px; }
.stored { font-weight: 600; color: #1a4fd6; }
@media print { body { padding: 0; } .page-break { page-break-before: always; } tr { page-break-inside: avoid; } .appendix-block { page-break-inside: avoid; } }
"""


def esc(s):
    return html.escape(str(s))


def table(headers, rows, right_cols=None):
    right_cols = right_cols or set()
    head = "".join(
        f'<th class="{"num" if i in right_cols else ""}">{esc(h)}</th>'
        for i, h in enumerate(headers)
    )
    body_rows = []
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            val = esc(cell)
            if headers[i] == "Journey":
                cls = "badge badge-later" if cell == "Returned later" else "badge badge-same"
                val = f'<span class="{cls}">{esc(cell)}</span>'
            cells.append(f'<td class="{"num" if i in right_cols else ""}">{val}</td>')
        body_rows.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body_rows)}</tbody></table>"


def click_table(clicks):
    head = "".join(f"<th>{esc(h)}</th>" for h in ["Click", "When (PT)", "Link", ""])
    body_rows = []
    for i, (when, link, on_order) in enumerate(clicks, start=1):
        label = '<span class="stored">On order</span>' if on_order else ""
        body_rows.append(
            f"<tr><td>{i}</td><td>{esc(when)}</td><td>{esc(link)}</td><td>{label}</td></tr>"
        )
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body_rows)}</tbody></table>"


def render_appendix(report):
    appendix = report.get("appendix") or []
    if not appendix:
        return ""
    blocks = []
    for block in appendix:
        blocks.append(
            f'<div class="appendix-block">'
            f'<h3>Order {esc(block["order"])} — {esc(str(block["click_count"]))} affiliate link clicks (same device)</h3>'
            f'{click_table(block["clicks"])}'
            f'</div>'
        )
    return f"""
<div class="page-break"></div>
<h2>Appendix — multiple link clicks</h2>
<p class="appendix-intro">{esc(report.get("appendix_intro", ""))}</p>
{"".join(blocks)}
<p class="foot">{esc(report.get("appendix_foot", ""))}</p>
"""


def render(report):
    stats_html = "".join(
        f'<div class="stat"><div class="stat-label">{esc(s["label"])}</div><div class="stat-value">{esc(s["value"])}</div></div>'
        for s in report["stats"]
    )
    rules = table(["Step", "What happened", "Outcome"], report["rules"])
    journey = table(
        ["Order", "Link clicked (PT)", "Order placed (PT)", "Journey", "Link", "Your commission"],
        report["journeys"],
        right_cols={5},
    )
    orders = table(
        [
            "Order",
            "Link clicked (PT)",
            "Order placed (PT)",
            "Journey",
            "Wait",
            "Total",
            "Earned",
            report["rate_col"],
            "Customer",
        ],
        report["orders"],
        right_cols={4, 5, 6, 7},
    )
    appendix = render_appendix(report)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{esc(report["title"])}</title><style>{CSS}</style></head>
<body>
<h1>{esc(report["title"])}</h1>
<p class="subtitle">true-sciences.com · true30 period Aug 21 – Sep 3, 2026 · All times Pacific (PT)</p>
<p class="note">{esc(report["note"])}</p>
<div class="stats">{stats_html}</div>
<div class="callout"><div class="callout-title">Customer journey</div>{report["callout"]}</div>
<h2>How commission is determined</h2>
{rules}
<h2>Customer journey</h2>
{journey}
<div class="page-break"></div>
<h2>Order details</h2>
{orders}
<p class="foot">"{esc(report["rate_col"])}" is the sale commission based on order total and your rate. All orders completed.</p>
{appendix}
<div class="footer">Generated Sep 4, 2026 · True Sciences affiliate commission review</div>
</body></html>"""


REPORTS = [
    {
        "slug": "blair-true30-commission-review",
        "title": "Blair — true30 commission review",
        "rate_col": "At 30%",
        "note": "Every order below used the true30 coupon (created Aug 21, 2026). Your referral was on each order but commission was not credited to you. Link-click dates can be earlier — those customers clicked your link before or after true30 launched, then came back and checked out with the code.",
        "stats": [
            {"label": "Affected orders", "value": "14"},
            {"label": "Returned later", "value": "13"},
            {"label": "Same visit", "value": "1"},
            {"label": "Commission at 30%", "value": "$404.04"},
        ],
        "callout": "<strong>Returned later</strong> — clicked your link, left without purchasing, came back later and used true30 (13 orders). <strong>Same visit</strong> — clicked and checked out within about an hour, still using true30 (1 order). In both cases your referral was on the order but commission went to the coupon instead of you.",
        "rules": [
            ["1", "Customer clicks your affiliate link", "Your referral is recorded and a 30-day tracking cookie is set."],
            ["2", "Customer browses but does not complete a purchase", "The visit is logged. Most customers below came back days or weeks later."],
            ["3", "Customer returns and applies true30 at checkout", "They receive 30% off. The coupon was also linked to affiliate commission tracking."],
            ["4", "Commission priority applies", "When a coupon is tied to affiliate tracking, it takes priority over the referral cookie."],
            ["5", "Result on these orders", "Commission was credited to the coupon's affiliate account instead of yours — you received $0."],
            ["6", "Lifetime customers", "If a customer is already linked to you for lifetime commissions, that link is not changed by a coupon on a single order."],
        ],
        "journeys": [
            ["#10855", "Aug 23, 2026 · 2:57 PM PT", "Aug 23, 2026 · 6:20 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$42.51"],
            ["#10872", "Jul 31, 2026 · 9:54 AM PT", "Aug 23, 2026 · 7:32 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$29.97"],
            ["#10944", "Aug 9, 2026 · 6:46 AM PT", "Aug 24, 2026 · 9:03 AM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$29.97"],
            ["#10950", "Aug 24, 2026 · 8:50 AM PT", "Aug 24, 2026 · 9:31 AM PT", "Same visit", "/product/glp3rt-10mg/aff/81/", "$26.99"],
            ["#11300", "Aug 25, 2026 · 1:14 PM PT", "Aug 26, 2026 · 9:39 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$17.54"],
            ["#11409", "Aug 20, 2026 · 10:39 AM PT", "Aug 27, 2026 · 2:33 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$11.99"],
            ["#11680", "Aug 13, 2026 · 12:10 PM PT", "Aug 29, 2026 · 1:55 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$21.85"],
            ["#11741", "Aug 24, 2026 · 7:42 AM PT", "Aug 30, 2026 · 8:52 AM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$23.43"],
            ["#11797", "Aug 9, 2026 · 12:20 PM PT", "Aug 30, 2026 · 5:02 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$30.27"],
            ["#11894", "Aug 30, 2026 · 9:12 AM PT", "Aug 31, 2026 · 12:23 PM PT", "Returned later", "/shop/aff/81/", "$31.64"],
            ["#11939", "Aug 29, 2026 · 1:59 PM PT", "Aug 31, 2026 · 5:53 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$17.54"],
            ["#12005", "Aug 28, 2026 · 12:07 PM PT", "Sep 1, 2026 · 8:38 AM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$62.99"],
            ["#12056", "Aug 28, 2026 · 12:07 PM PT", "Sep 1, 2026 · 4:11 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$33.59"],
            ["#12164", "Aug 26, 2026 · 10:43 AM PT", "Sep 2, 2026 · 4:12 PM PT", "Returned later", "/product/glp3rt-10mg/aff/81/", "$23.76"],
        ],
        "orders": [
            ["#10855", "Aug 23, 2026 · 2:57 PM PT", "Aug 23, 2026 · 6:20 PM PT", "Returned later", "3 hours", "$141.71", "$0.00", "$42.51", "afrinkhan1@gmail.com"],
            ["#10872", "Jul 31, 2026 · 9:54 AM PT", "Aug 23, 2026 · 7:32 PM PT", "Returned later", "23 days", "$99.91", "$0.00", "$29.97", "steenmkylla@gmail.com"],
            ["#10944", "Aug 9, 2026 · 6:46 AM PT", "Aug 24, 2026 · 9:03 AM PT", "Returned later", "15 days", "$99.91", "$0.00", "$29.97", "kaneith44@gmail.com"],
            ["#10950", "Aug 24, 2026 · 8:50 AM PT", "Aug 24, 2026 · 9:31 AM PT", "Same visit", "41 min", "$89.97", "$0.00", "$26.99", "tamijaphilon138@gmail.com"],
            ["#11300", "Aug 25, 2026 · 1:14 PM PT", "Aug 26, 2026 · 9:39 PM PT", "Returned later", "1 day", "$58.48", "$0.00", "$17.54", "janettherrera41@gmail.com"],
            ["#11409", "Aug 20, 2026 · 10:39 AM PT", "Aug 27, 2026 · 2:33 PM PT", "Returned later", "7 days", "$39.98", "$0.00", "$11.99", "nevapence@yahoo.com"],
            ["#11680", "Aug 13, 2026 · 12:10 PM PT", "Aug 29, 2026 · 1:55 PM PT", "Returned later", "16 days", "$72.83", "$0.00", "$21.85", "garcia.leslye16@yahoo.com"],
            ["#11741", "Aug 24, 2026 · 7:42 AM PT", "Aug 30, 2026 · 8:52 AM PT", "Returned later", "6 days", "$78.10", "$0.00", "$23.43", "vanessashaffer4@gmail.com"],
            ["#11797", "Aug 9, 2026 · 12:20 PM PT", "Aug 30, 2026 · 5:02 PM PT", "Returned later", "21 days", "$100.91", "$0.00", "$30.27", "shimearajohnson@gmail.com"],
            ["#11894", "Aug 30, 2026 · 9:12 AM PT", "Aug 31, 2026 · 12:23 PM PT", "Returned later", "1 day", "$105.47", "$0.00", "$31.64", "mmckeehan07@hotmail.com"],
            ["#11939", "Aug 29, 2026 · 1:59 PM PT", "Aug 31, 2026 · 5:53 PM PT", "Returned later", "2 days", "$58.48", "$0.00", "$17.54", "acpcostan@gmail.com"],
            ["#12005", "Aug 28, 2026 · 12:07 PM PT", "Sep 1, 2026 · 8:38 AM PT", "Returned later", "4 days", "$209.96", "$0.00", "$62.99", "camilleyshannon@gmail.com"],
            ["#12056", "Aug 28, 2026 · 12:07 PM PT", "Sep 1, 2026 · 4:11 PM PT", "Returned later", "4 days", "$111.98", "$0.00", "$33.59", "camilleyshannon@gmail.com"],
            ["#12164", "Aug 26, 2026 · 10:43 AM PT", "Sep 2, 2026 · 4:12 PM PT", "Returned later", "7 days", "$79.21", "$0.00", "$23.76", "alvarado.cateria@gmail.com"],
        ],
        "appendix_intro": "For 1 of your 14 orders, we matched multiple affiliate link clicks from the same device (same IP address) before checkout. The other 13 orders had only one recorded link click — those customers likely returned later using your existing referral cookie without clicking your link again.",
        "appendix_foot": "Device matching uses IP address only. Clicks from a different network or device would not appear here.",
        "appendix": [
            {
                "order": "#10950",
                "click_count": 2,
                "clicks": [
                    ["Aug 16, 2026 · 11:31 AM PT", "/product/glp3rt-10mg/aff/81/", False],
                    ["Aug 24, 2026 · 8:50 AM PT", "/product/glp3rt-10mg/aff/81/", True],
                ],
            },
        ],
    },
    {
        "slug": "trin-true30-commission-review",
        "title": "Trin — true30 commission review",
        "rate_col": "At 40%",
        "note": "Every order below used the true30 coupon (created Aug 21, 2026). Your referral was on each order but commission was not credited to you. Link-click dates can be earlier — those customers clicked your link before or after true30 launched, then came back and checked out with the code.",
        "stats": [
            {"label": "Affected orders", "value": "7"},
            {"label": "Returned later", "value": "3"},
            {"label": "Same visit", "value": "4"},
            {"label": "Commission at 40%", "value": "$282.09"},
        ],
        "callout": "<strong>Returned later</strong> — clicked your link, left without purchasing, came back later and used true30 (3 orders). <strong>Same visit</strong> — clicked and checked out within about an hour, still using true30 (4 orders). In both cases your referral was on the order but commission went to the coupon instead of you.",
        "rules": [
            ["1", "Customer clicks your affiliate link", "Your referral is recorded and a 30-day tracking cookie is set."],
            ["2", "Customer browses but does not complete a purchase", "The visit is logged. Some customers came back days or weeks later."],
            ["3", "Customer returns and applies true30 at checkout", "They receive 30% off. The coupon was also linked to affiliate commission tracking."],
            ["4", "Commission priority applies", "When a coupon is tied to affiliate tracking, it takes priority over the referral cookie."],
            ["5", "Result on these orders", "Commission was credited to the coupon's affiliate account instead of yours — you received $0."],
            ["6", "Lifetime customers", "If a customer is already linked to you for lifetime commissions, that link is not changed by a coupon on a single order."],
        ],
        "journeys": [
            ["#11090", "Aug 17, 2026 · 11:28 PM PT", "Aug 25, 2026 · 9:06 AM PT", "Returned later", "/product/glp3rt-10mg/aff/Trin/", "$17.79"],
            ["#11106", "Aug 25, 2026 · 11:20 AM PT", "Aug 25, 2026 · 11:30 AM PT", "Same visit", "/product/glp3rt-10mg/aff/Trin/", "$96.47"],
            ["#11309", "Aug 21, 2026 · 2:25 PM PT", "Aug 26, 2026 · 10:54 PM PT", "Returned later", "/product/glp3rt-10mg/aff/trin/", "$43.01"],
            ["#11432", "Aug 27, 2026 · 5:34 PM PT", "Aug 27, 2026 · 5:35 PM PT", "Same visit", "/product/glp3rt-10mg/aff/Trin/", "$20.79"],
            ["#11532", "Aug 28, 2026 · 11:37 AM PT", "Aug 28, 2026 · 12:05 PM PT", "Same visit", "/product/glp3rt-10mg/aff/Trin/", "$42.13"],
            ["#11884", "Aug 31, 2026 · 10:44 AM PT", "Aug 31, 2026 · 10:53 AM PT", "Same visit", "/product/glp3rt-10mg/aff/Trin/", "$17.79"],
            ["#12067", "Aug 13, 2026 · 4:45 PM PT", "Sep 1, 2026 · 6:08 PM PT", "Returned later", "/product/glp3rt-10mg/aff/Trin/", "$44.11"],
        ],
        "orders": [
            ["#11090", "Aug 17, 2026 · 11:28 PM PT", "Aug 25, 2026 · 9:06 AM PT", "Returned later", "7 days", "$44.48", "$0.00", "$17.79", "staceywedlow@gmail.com"],
            ["#11106", "Aug 25, 2026 · 11:20 AM PT", "Aug 25, 2026 · 11:30 AM PT", "Same visit", "10 min", "$241.17", "$0.00", "$96.47", "aallynoriega@gmail.com"],
            ["#11309", "Aug 21, 2026 · 2:25 PM PT", "Aug 26, 2026 · 10:54 PM PT", "Returned later", "5 days", "$107.52", "$0.00", "$43.01", "Millertyme1000@yahoo.com"],
            ["#11432", "Aug 27, 2026 · 5:34 PM PT", "Aug 27, 2026 · 5:35 PM PT", "Same visit", "1 min", "$51.98", "$0.00", "$20.79", "elliecwood0113@gmail.com"],
            ["#11532", "Aug 28, 2026 · 11:37 AM PT", "Aug 28, 2026 · 12:05 PM PT", "Same visit", "28 min", "$105.33", "$0.00", "$42.13", "wfurner@gmail.com"],
            ["#11884", "Aug 31, 2026 · 10:44 AM PT", "Aug 31, 2026 · 10:53 AM PT", "Same visit", "9 min", "$44.48", "$0.00", "$17.79", "evalynintaiwan@gmail.com"],
            ["#12067", "Aug 13, 2026 · 4:45 PM PT", "Sep 1, 2026 · 6:08 PM PT", "Returned later", "19 days", "$110.28", "$0.00", "$44.11", "yarienglish2002@gmail.com"],
        ],
        "appendix_intro": "For 6 of your 7 orders, we matched multiple affiliate link clicks from the same device (same IP address) before checkout. The remaining order had only one recorded link click.",
        "appendix_foot": "Device matching uses IP address only. Clicks from a different network or device would not appear here.",
        "appendix": [
            {
                "order": "#11090",
                "click_count": 5,
                "clicks": [
                    ["Aug 8, 2026 · 8:17 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 10, 2026 · 7:58 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 11, 2026 · 10:24 AM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 17, 2026 · 8:30 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 17, 2026 · 11:28 PM PT", "/product/glp3rt-10mg/aff/Trin/", True],
                ],
            },
            {
                "order": "#11106",
                "click_count": 4,
                "clicks": [
                    ["Aug 25, 2026 · 11:19 AM PT", "/product/glp3rt-10mg/aff/Trin/ (Instagram link)", False],
                    ["Aug 25, 2026 · 11:20 AM PT", "/product/glp3rt-10mg/aff/Trin/ (Instagram link)", True],
                    ["Sep 1, 2026 · 4:05 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Sep 1, 2026 · 4:05 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                ],
            },
            {
                "order": "#11309",
                "click_count": 2,
                "clicks": [
                    ["Aug 21, 2026 · 2:13 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 21, 2026 · 2:25 PM PT", "/product/glp3rt-10mg/aff/trin/", True],
                ],
            },
            {
                "order": "#11432",
                "click_count": 2,
                "clicks": [
                    ["Aug 27, 2026 · 5:07 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 27, 2026 · 5:34 PM PT", "/product/glp3rt-10mg/aff/Trin/", True],
                ],
            },
            {
                "order": "#11884",
                "click_count": 2,
                "clicks": [
                    ["Aug 31, 2026 · 10:43 AM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 31, 2026 · 10:44 AM PT", "/product/glp3rt-10mg/aff/Trin/", True],
                ],
            },
            {
                "order": "#12067",
                "click_count": 2,
                "clicks": [
                    ["Aug 13, 2026 · 4:08 PM PT", "/product/glp3rt-10mg/aff/Trin/", False],
                    ["Aug 13, 2026 · 4:45 PM PT", "/product/glp3rt-10mg/aff/Trin/", True],
                ],
            },
        ],
    },
    {
        "slug": "emmie-true30-commission-review",
        "title": "Emmie — true30 commission review",
        "rate_col": "At 30%",
        "note": "Every order below used the true30 coupon (created Aug 21, 2026). Your referral was on each order but commission was not credited to you. Link-click dates can be earlier — those customers clicked your link before or after true30 launched, then came back and checked out with the code.",
        "stats": [
            {"label": "Affected orders", "value": "12"},
            {"label": "Returned later", "value": "12"},
            {"label": "Same visit", "value": "0"},
            {"label": "Commission at 30%", "value": "$394.79"},
        ],
        "callout": "All 12 customers clicked your link first, left without purchasing, and came back later to check out with true30. Your referral was on every order, but commission went to the coupon instead of you.",
        "rules": [
            ["1", "Customer clicks your affiliate link", "Your referral is recorded and a 30-day tracking cookie is set."],
            ["2", "Customer browses but does not complete a purchase", "The visit is logged. Every customer below came back days or weeks later."],
            ["3", "Customer returns and applies true30 at checkout", "They receive 30% off. The coupon was also linked to affiliate commission tracking."],
            ["4", "Commission priority applies", "When a coupon is tied to affiliate tracking, it takes priority over the referral cookie."],
            ["5", "Result on these orders", "Commission was credited to the coupon's affiliate account instead of yours — you received $0."],
            ["6", "Lifetime customers", "If a customer is already linked to you for lifetime commissions, that link is not changed by a coupon on a single order."],
        ],
        "journeys": [
            ["#10901", "Aug 16, 2026 · 5:47 PM PT", "Aug 23, 2026 · 10:22 PM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$85.03"],
            ["#11084", "Aug 23, 2026 · 9:08 AM PT", "Aug 25, 2026 · 7:21 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$48.08"],
            ["#11461", "Aug 25, 2026 · 7:53 AM PT", "Aug 27, 2026 · 9:23 PM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$26.99"],
            ["#11517", "Aug 17, 2026 · 2:45 AM PT", "Aug 28, 2026 · 10:08 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$17.54"],
            ["#11557", "Aug 28, 2026 · 2:05 PM PT", "Aug 28, 2026 · 3:47 PM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$34.64"],
            ["#11870", "Aug 15, 2026 · 3:46 PM PT", "Aug 31, 2026 · 9:23 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$37.59"],
            ["#11882", "Aug 10, 2026 · 7:52 AM PT", "Aug 31, 2026 · 10:41 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$31.60"],
            ["#11988", "Aug 16, 2026 · 3:54 AM PT", "Sep 1, 2026 · 12:18 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$31.19"],
            ["#12139", "Aug 31, 2026 · 6:51 AM PT", "Sep 2, 2026 · 11:53 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$13.34"],
            ["#12173", "Aug 31, 2026 · 11:58 PM PT", "Sep 2, 2026 · 6:07 PM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$41.07"],
            ["#12251", "Aug 23, 2026 · 10:52 AM PT", "Sep 3, 2026 · 8:32 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$14.38"],
            ["#12258", "Aug 19, 2026 · 3:54 PM PT", "Sep 3, 2026 · 9:20 AM PT", "Returned later", "/product/glp3rt-10mg/aff/138/", "$13.34"],
        ],
        "orders": [
            ["#10901", "Aug 16, 2026 · 5:47 PM PT", "Aug 23, 2026 · 10:22 PM PT", "Returned later", "7 days", "$283.44", "$0.00", "$85.03", "acidicama@gmail.com"],
            ["#11084", "Aug 23, 2026 · 9:08 AM PT", "Aug 25, 2026 · 7:21 AM PT", "Returned later", "2 days", "$160.28", "$0.00", "$48.08", "briannayoungblood@outlook.com"],
            ["#11461", "Aug 25, 2026 · 7:53 AM PT", "Aug 27, 2026 · 9:23 PM PT", "Returned later", "3 days", "$89.97", "$0.00", "$26.99", "Roybal.r.r@gmail.com"],
            ["#11517", "Aug 17, 2026 · 2:45 AM PT", "Aug 28, 2026 · 10:08 AM PT", "Returned later", "11 days", "$58.48", "$0.00", "$17.54", "spambabyhehe@gmail.com"],
            ["#11557", "Aug 28, 2026 · 2:05 PM PT", "Aug 28, 2026 · 3:47 PM PT", "Returned later", "2 hours", "$115.48", "$0.00", "$34.64", "melinewcomb@gmail.com"],
            ["#11870", "Aug 15, 2026 · 3:46 PM PT", "Aug 31, 2026 · 9:23 AM PT", "Returned later", "16 days", "$125.29", "$0.00", "$37.59", "kmonteith11@gmail.com"],
            ["#11882", "Aug 10, 2026 · 7:52 AM PT", "Aug 31, 2026 · 10:41 AM PT", "Returned later", "21 days", "$105.32", "$0.00", "$31.60", "alexamiddendorf5@gmail.com"],
            ["#11988", "Aug 16, 2026 · 3:54 AM PT", "Sep 1, 2026 · 12:18 AM PT", "Returned later", "16 days", "$103.98", "$0.00", "$31.19", "kaylaelias123@gmail.com"],
            ["#12139", "Aug 31, 2026 · 6:51 AM PT", "Sep 2, 2026 · 11:53 AM PT", "Returned later", "2 days", "$44.48", "$0.00", "$13.34", "chriswers29@yahoo.com"],
            ["#12173", "Aug 31, 2026 · 11:58 PM PT", "Sep 2, 2026 · 6:07 PM PT", "Returned later", "2 days", "$136.91", "$0.00", "$41.07", "shaylayna_bettencourt@yahoo.com"],
            ["#12251", "Aug 23, 2026 · 10:52 AM PT", "Sep 3, 2026 · 8:32 AM PT", "Returned later", "11 days", "$47.93", "$0.00", "$14.38", "trishmarie3@gmail.com"],
            ["#12258", "Aug 19, 2026 · 3:54 PM PT", "Sep 3, 2026 · 9:20 AM PT", "Returned later", "15 days", "$44.48", "$0.00", "$13.34", "davamwalker@gmail.com"],
        ],
        "appendix_intro": "For 4 of your 12 orders, we matched multiple affiliate link clicks from the same device (same IP address) before checkout. The other 8 orders had only one recorded link click — those customers likely returned later using your existing referral cookie without clicking your link again.",
        "appendix_foot": "Device matching uses IP address only. Clicks from a different network or device would not appear here.",
        "appendix": [
            {
                "order": "#11084",
                "click_count": 2,
                "clicks": [
                    ["Aug 23, 2026 · 9:08 AM PT", "/product/glp3rt-10mg/aff/138/", True],
                    ["Aug 23, 2026 · 11:52 AM PT", "/product/glp3rt-10mg/aff/138/", False],
                ],
            },
            {
                "order": "#11517",
                "click_count": 2,
                "clicks": [
                    ["Aug 17, 2026 · 2:45 AM PT", "/product/glp3rt-10mg/aff/138/", True],
                    ["Aug 28, 2026 · 9:55 AM PT", "/product/glp3rt-10mg/aff/138/", False],
                ],
            },
            {
                "order": "#11870",
                "click_count": 2,
                "clicks": [
                    ["Aug 15, 2026 · 3:46 PM PT", "/product/glp3rt-10mg/aff/138/", True],
                    ["Aug 26, 2026 · 1:42 PM PT", "/product/glp3rt-10mg/aff/138/", False],
                ],
            },
            {
                "order": "#11882",
                "click_count": 2,
                "clicks": [
                    ["Aug 10, 2026 · 7:52 AM PT", "/product/glp3rt-10mg/aff/138/", True],
                    ["Aug 14, 2026 · 8:41 PM PT", "/product/glp3rt-10mg/aff/138/", False],
                ],
            },
        ],
    },
]


def main():
    pdfs = []
    for report in REPORTS:
        slug = report["slug"]
        html_path = OUT / f"{slug}.html"
        pdf_path = OUT / f"{slug}.pdf"
        html_path.write_text(render(report), encoding="utf-8")
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                f"--print-to-pdf={pdf_path}",
                f"file://{html_path.resolve()}",
            ],
            check=True,
            capture_output=True,
        )
        pdfs.append(pdf_path)
        print(f"Wrote {html_path.name} and {pdf_path.name}")

    print("\nPDFs ready:")
    for p in pdfs:
        print(p)


if __name__ == "__main__":
    main()
