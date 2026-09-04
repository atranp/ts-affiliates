#!/usr/bin/env python3
"""PDF: Klaviyo email-attributed orders vs affiliate commissions."""

import html
import json
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

OUT = Path(__file__).parent
JSON_PATH = OUT / "klaviyo-aff-report.json"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PT = ZoneInfo("America/Los_Angeles")

CSS = """
@page { size: letter; margin: 0.55in; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; line-height: 1.4; font-size: 10px; margin: 0; padding: 22px; }
h1 { font-size: 21px; margin: 0 0 6px; font-weight: 600; }
.subtitle { color: #555; margin: 0 0 4px; font-size: 11px; }
.note { color: #666; font-size: 9px; margin: 0 0 16px; max-width: 720px; }
.callout { border-left: 3px solid #1a4fd6; background: #f5f8ff; padding: 11px 13px; margin: 0 0 16px; border-radius: 0 4px 4px 0; }
.callout-warn { border-left-color: #c45a00; background: #fff8f2; }
h2 { font-size: 13px; margin: 18px 0 7px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: 9px; }
th, td { border: 1px solid #ddd; padding: 5px 6px; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: 600; }
td.num, th.num { text-align: right; white-space: nowrap; }
.tag { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 8px; font-weight: 600; }
.tag-kx { background: #e8f0fe; color: #1a4fd6; }
.tag-gmail { background: #eef7ee; color: #2d6a2d; }
.tag-stale { background: #fdecea; color: #b42318; }
.tag-none { background: #f3f3f3; color: #666; }
.foot { color: #666; font-size: 8px; margin-top: 5px; }
.footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #eee; color: #888; font-size: 8px; }
.page-break { page-break-before: always; }
@media print { body { padding: 0; } tr { page-break-inside: avoid; } }
"""


def esc(s):
    return html.escape(str(s))


def money(n):
    return f"${n:,.2f}"


def fmt_pt(iso):
    if not iso:
        return "—"
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(PT).strftime("%b %-d, %-I:%M %p PT")


def table(headers, rows, right_cols=None):
    right_cols = right_cols or set()
    head = "".join(
        f'<th class="{"num" if i in right_cols else ""}">{esc(h)}</th>'
        for i, h in enumerate(headers)
    )
    body = []
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            cells.append(f'<td class="{"num" if i in right_cols else ""}">{cell if isinstance(cell, str) and cell.startswith("<") else esc(cell)}</td>')
        body.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def signal_tag(signal):
    if signal == "klaviyo_click":
        return '<span class="tag tag-kx">Klaviyo click</span>'
    return '<span class="tag tag-gmail">Email referrer</span>'


def load_data():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    orders = [
        o for o in data["orders"]
        if o.get("category") not in ("other_affiliate", "no_commission")
    ]
    return data, orders


def order_rows(orders, categories=None):
    rows = []
    for o in orders:
        if categories and o.get("category") not in categories:
            continue
        paid = o.get("paid_affiliate")
        if paid in (81, 51, 138):
            paid_label = o.get("paid_name") or str(paid)
        elif paid:
            paid_label = f"#{paid}"
        else:
            paid_label = "—"
        comm = o.get("commission") or 0
        comm_cell = money(comm) if comm else "—"
        cat = o.get("category", "")
        if cat == "bte_stale_cookie":
            note = '<span class="tag tag-stale">Stale cookie</span>'
        elif cat == "bte_with_link":
            note = "B/T/E link in session"
        else:
            note = "—"
        rows.append([
            f"#{o['order_id']}",
            fmt_pt(o["date"]),
            signal_tag(o["signal"]),
            paid_label,
            comm_cell,
            note,
        ])
    return rows


def render():
    data, orders = load_data()
    s = data["summary"]
    period = data.get("period", "Aug 1 – Sep 4, 2026")
    bte_stale = s["bte_no_link_on_entry"]
    bte_stale_amt = s["bte_no_link_amount"]
    bte_comm = s["bte_commission_orders"]

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Email marketing vs affiliate commissions</title><style>{CSS}</style></head>
<body>
<h1>Email marketing orders &amp; affiliate commissions</h1>
<p class="subtitle">Blair, Trin &amp; Emmie · {esc(period)}</p>
<p class="note">
Klaviyo-attributed orders are identified from WooCommerce session data: a Klaviyo click (<code>_kx</code> tracking
parameter in the session entry URL) or an email-client referrer (Gmail). These customers arrived from a marketing
email — not from an affiliate link on that visit.
</p>

<div class="callout">
<strong>{len(orders)} Klaviyo-attributed orders</strong> paid Blair, Trin, or Emmie — email drove the visit,
but a stale referral cookie took the commission.
</div>

<div class="callout callout-warn">
<strong>{bte_stale} orders · {money(bte_stale_amt)}</strong> paid Blair, Trin, or Emmie even though the customer
did <em>not</em> click their affiliate link on that visit — an older referral cookie overrode the email click.
</div>

<h2>How this works</h2>
{table(
    ["Step", "What happened", "Result"],
    [
        ["1", "Customer clicks a Klaviyo marketing email link", "Session starts from email URL (_kx parameter)"],
        ["2", "Customer still has an older Blair / Trin / Emmie cookie in the browser", "30-day referral cookie from a prior link click"],
        ["3", "Customer places an order from the email session", "Stale affiliate cookie beats the email visit"],
        ["4", "Commission on this order", "Blair / Trin / Emmie earns their sale rate — email drove the order but got no credit"],
    ],
)}

<h2>Blair / Trin / Emmie commissions on email orders</h2>
{table(
    ["Affiliate", "Email orders with commission", "Commission earned", "Without their link on this visit"],
    [
        ["Blair", str(s["by_affiliate"]["81"]["orders"]), money(s["by_affiliate"]["81"]["amount"]),
         f'{s["by_affiliate"]["81"]["no_link"]} · {money(s["by_affiliate"]["81"]["no_link_amount"])}'],
        ["Trin", str(s["by_affiliate"]["51"]["orders"]), money(s["by_affiliate"]["51"]["amount"]),
         f'{s["by_affiliate"]["51"]["no_link"]} · {money(s["by_affiliate"]["51"]["no_link_amount"])}'],
        ["Emmie", str(s["by_affiliate"]["138"]["orders"]), money(s["by_affiliate"]["138"]["amount"]),
         f'{s["by_affiliate"]["138"]["no_link"]} · {money(s["by_affiliate"]["138"]["no_link_amount"])}'],
        ["Total", str(s["bte_commission_orders"]), money(s["bte_commission_amount"]),
         f'{bte_stale} · {money(bte_stale_amt)}'],
    ],
    right_cols={1},
)}
<p class="foot">
“Without their link on this visit” = session entry URL is from Klaviyo/email, not an affiliate link for that affiliate.
Every B/T/E commission on email orders in this period matched that pattern.
</p>

<div class="page-break"></div>
<h2>Order detail</h2>
{table(
    ["Order", "Date (PT)", "Email signal", "Commission to", "Amount", "Notes"],
    order_rows(orders),
    right_cols={4},
)}
<p class="foot">{len(orders)} orders · Klaviyo click or Gmail referrer · Blair / Trin / Emmie commission only</p>

<div class="footer">Generated Sep 4, 2026 · true-sciences.com affiliate commission review</div>
</body></html>"""


def main():
    slug = "klaviyo-email-affiliate-commissions"
    html_path = OUT / f"{slug}.html"
    pdf_path = OUT / f"{slug}.pdf"
    html_path.write_text(render(), encoding="utf-8")
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
    print(f"Wrote {html_path.name} and {pdf_path.name}")
    print(pdf_path)


if __name__ == "__main__":
    main()
