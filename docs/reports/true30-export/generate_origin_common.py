#!/usr/bin/env python3
"""Shared rendering helpers for the commission origin PDFs."""

from __future__ import annotations

import html

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def esc(value) -> str:
    return html.escape(str(value))


def usd(value: float) -> str:
    return f"${value:,.2f}"


def table(headers, rows, right_cols=None, total_row=None) -> str:
    right_cols = right_cols or set()
    head = "".join(
        f'<th class="{"num" if i in right_cols else ""}">{esc(h)}</th>'
        for i, h in enumerate(headers)
    )
    body = []
    for row in rows:
        cells = "".join(
            f'<td class="{"num" if i in right_cols else ""}">{esc(c)}</td>'
            for i, c in enumerate(row)
        )
        body.append(f"<tr>{cells}</tr>")
    if total_row:
        cells = "".join(
            f'<td class="{"num" if i in right_cols else ""}">{esc(c)}</td>'
            for i, c in enumerate(total_row)
        )
        body.append(f'<tr class="total">{cells}</tr>')
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"
