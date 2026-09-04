#!/usr/bin/env python3
"""PDF: B/T/E last-click wins over other affiliates' lifetime links."""

import html
import subprocess
from pathlib import Path

OUT = Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@page { size: letter; margin: 0.6in; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; line-height: 1.45; font-size: 11px; margin: 0; padding: 24px; }
h1 { font-size: 22px; margin: 0 0 6px; font-weight: 600; }
.subtitle { color: #555; margin: 0 0 4px; font-size: 12px; }
.note { color: #666; font-size: 10px; margin: 0 0 18px; max-width: 720px; }
.callout { border-left: 3px solid #1a4fd6; background: #f5f8ff; padding: 12px 14px; margin: 0 0 18px; border-radius: 0 4px 4px 0; }
h2 { font-size: 14px; margin: 20px 0 8px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: 10px; }
th, td { border: 1px solid #ddd; padding: 6px 7px; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: 600; }
td.num, th.num { text-align: right; }
.foot { color: #666; font-size: 9px; margin-top: 6px; }
.footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #eee; color: #888; font-size: 9px; }
@media print { body { padding: 0; } tr { page-break-inside: avoid; } }
"""


def esc(s):
    return html.escape(str(s))


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
            cells.append(f'<td class="{"num" if i in right_cols else ""}">{esc(cell)}</td>')
        body.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


# External affiliates only (not Blair, Trin, or Emmie). Aug 1 – Sep 4, 2026. IDs only — no names.
OTHER_LIFETIME = [
    ["#15", "65", "$2,238.35"],
    ["#84", "4", "$0.00"],
    ["#25", "2", "$82.67"],
    ["#146", "2", "$105.59"],
    ["#181", "2", "$19.50"],
    ["#2", "1", "$19.50"],
    ["#103", "1", "$19.50"],
    ["#13", "1", "$18.00"],
    ["#93", "1", "$48.00"],
]

TOTAL_ORDERS = 67
TOTAL_AMT = 2338.86


def render():
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Last-click vs lifetime</title><style>{CSS}</style></head>
<body>
<h1>Last-click commissions over lifetime links</h1>
<p class="subtitle">Blair, Trin &amp; Emmie · Aug 1 – Sep 4, 2026</p>
<p class="note">
When a customer clicks Blair, Trin, or Emmie's affiliate link, that referral cookie takes priority over an
existing lifetime link to another affiliate. On these orders, the customer returned within the cookie window
and commission went to whoever's link was clicked last — not to the affiliate who held the lifetime link.
</p>

<div class="callout">
<strong>{TOTAL_ORDERS} orders · ${TOTAL_AMT:,.2f}</strong> in sale commissions earned by Blair, Trin, or Emmie
because their link was the last click — overriding another affiliate's lifetime link.
</div>

<h2>How this works</h2>
{table(
    ["Step", "What happened", "Result"],
    [
        ["1", "Customer was previously linked to another affiliate for lifetime commissions", "That affiliate would earn on a return visit with no new link click"],
        ["2", "Customer later clicks Blair, Trin, or Emmie's link", "A 30-day referral cookie is set"],
        ["3", "Customer places an order within the cookie window", "Last-click cookie beats the lifetime link"],
        ["4", "Commission on this order", "Blair / Trin / Emmie earns their sale rate (30% or 40%)"],
    ],
)}

<h2>Lifetime links overridden</h2>
{table(
    ["Lifetime affiliate ID", "Orders", "Commission to Blair / Trin / Emmie"],
    OTHER_LIFETIME,
    right_cols={1, 2},
)}
<p class="foot">
Other affiliates only (IDs 81, 51, 138 excluded). The lifetime affiliate
would have earned at the lower lifetime rate (~10%) on a naked return visit; the last-click affiliate earned
their full sale rate on these orders.
</p>

<div class="footer">Generated Sep 4, 2026 · true-sciences.com affiliate commission review</div>
</body></html>"""


def main():
    slug = "bte-lifetime-cookie-wins"
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
