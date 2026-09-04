#!/usr/bin/env python3
"""Audit B/T/E repeat commissions since 8/17 for stale-cookie lifetime eligibility."""

from __future__ import annotations

import csv
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

BTE = {
    81: {"name": "Blair", "lifetime_rate": 10, "sale_rate": 30},
    51: {"name": "Trin", "lifetime_rate": 10, "sale_rate": 30},
    138: {"name": "Emmie", "lifetime_rate": 10, "sale_rate": 30},
}

SINCE = "2026-08-17"
RULES_EFFECTIVE = datetime(2026, 9, 1, tzinfo=timezone.utc)
REPORT_DIR = Path(__file__).resolve().parents[1] / "docs" / "reports"

SQL = r"""
SELECT c.id AS commission_id, c.reference AS order_id, c.date_created, c.type, c.amount, c.status,
       c.visit_id, c.customer_id, c.affiliate_id, IFNULL(cu.email, '') AS email,
       IFNULL(cm.meta_value, '') AS linked_affiliate_id,
       IFNULL(v.commission_id, 0) AS visit_converted_commission_id,
       (SELECT COUNT(*) FROM zww_slicewp_commissions c2
        WHERE c2.customer_id = c.customer_id AND c2.affiliate_id = c.affiliate_id
          AND c2.id < c.id AND c2.status IN ('paid','unpaid','pending')) AS prior_n
FROM zww_slicewp_commissions c
LEFT JOIN zww_slicewp_customers cu ON cu.id = c.customer_id
LEFT JOIN zww_slicewp_customer_meta cm ON cm.slicewp_customer_id = c.customer_id AND cm.meta_key = 'affiliate_id'
LEFT JOIN zww_slicewp_visits v ON v.id = c.visit_id
WHERE c.affiliate_id IN (81,51,138)
  AND c.type IN ('sale','lifetime_sale','subscription')
  AND c.origin = 'woo'
  AND c.date_created >= '2026-08-17 00:00:00'
  AND c.status IN ('paid','unpaid','pending')
  AND (SELECT COUNT(*) FROM zww_slicewp_commissions c2
       WHERE c2.customer_id = c.customer_id AND c2.affiliate_id = c.affiliate_id
         AND c2.id < c.id AND c2.status IN ('paid','unpaid','pending')) > 0
ORDER BY c.date_created, c.id;
"""

COUPON_SQL = """
SELECT oi.order_id, LOWER(oi.order_item_name) AS coupon_code
FROM zww_woocommerce_order_items oi
WHERE oi.order_item_type = 'coupon'
  AND oi.order_id IN ({ids});
"""

AFF_COUPON_SQL = """
SELECT LOWER(p.post_title) AS code, CAST(pm.meta_value AS UNSIGNED) AS affiliate_id
FROM zww_posts p
JOIN zww_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = 'slicewp_affiliate_id'
WHERE p.post_type = 'shop_coupon'
  AND pm.meta_value IN ('81','51','138');
"""

LINE_SQL = """
SELECT oi.order_id, SUM(CAST(oim.meta_value AS DECIMAL(12,2))) AS line_total
FROM zww_woocommerce_order_items oi
JOIN zww_woocommerce_order_itemmeta oim ON oim.order_item_id = oi.order_item_id AND oim.meta_key = '_line_total'
WHERE oi.order_item_type = 'line_item'
  AND oi.order_id IN ({ids})
GROUP BY oi.order_id;
"""


def run_sql(sql: str) -> str:
    one_line = " ".join(sql.split())
    remote = f"cd ~/www/true-sciences.com/public_html && wp db query {shlex.quote(one_line)} 2>/dev/null"
    return subprocess.check_output(["ssh", "tsprod", remote], text=True)


def parse_tsv(raw: str) -> list[dict[str, str]]:
    lines = [ln for ln in raw.strip().splitlines() if ln.strip()]
    if len(lines) < 2:
        return []
    reader = csv.DictReader(lines, delimiter="\t")
    return list(reader)


def chunked(ids: list[int], size: int = 400):
    for i in range(0, len(ids), size):
        yield ids[i : i + size]


def main() -> int:
    raw = run_sql(SQL)
    rows = parse_tsv(raw)
    if not rows:
        print("No repeat rows returned.", file=sys.stderr)
        return 1

    order_ids = sorted({int(r["order_id"]) for r in rows})
    aff_coupons: dict[str, int] = {}
    for part in parse_tsv(run_sql(AFF_COUPON_SQL)):
        aff_coupons[part["code"]] = int(part["affiliate_id"])

    order_coupons: dict[int, set[str]] = {}
    for chunk in chunked(order_ids):
        ids = ",".join(str(i) for i in chunk)
        for part in parse_tsv(run_sql(COUPON_SQL.format(ids=ids))):
            oid = int(part["order_id"])
            order_coupons.setdefault(oid, set()).add(part["coupon_code"])

    line_totals: dict[int, float] = {}
    for chunk in chunked(order_ids):
        ids = ",".join(str(i) for i in chunk)
        for part in parse_tsv(run_sql(LINE_SQL.format(ids=ids))):
            line_totals[int(part["order_id"])] = float(part["line_total"])

    should_lifetime: list[dict] = []

    for r in rows:
        commission_id = int(r["commission_id"])
        order_id = int(r["order_id"])
        affiliate_id = int(r["affiliate_id"])
        customer_id = int(r["customer_id"] or 0)
        visit_id = int(r["visit_id"] or 0)
        visit_conv = int(r["visit_converted_commission_id"] or 0)
        linked = int(r["linked_affiliate_id"] or 0) == affiliate_id
        prior_n = int(r["prior_n"])

        coupons = order_coupons.get(order_id, set())
        has_aff_coupon = any(aff_coupons.get(c) == affiliate_id for c in coupons)
        visit_stale = visit_id <= 0 or (visit_conv > 0 and visit_conv < commission_id)
        fresh_link = (
            not has_aff_coupon
            and visit_id > 0
            and not (visit_conv > 0 and visit_conv < commission_id)
        )
        should = (
            prior_n > 0
            and linked
            and not has_aff_coupon
            and not fresh_link
        )

        amount = float(r["amount"])
        line_total = line_totals.get(order_id, 0.0)
        lifetime_rate = BTE[affiliate_id]["lifetime_rate"]
        expected_lifetime = round(line_total * lifetime_rate / 100, 2) if line_total else None
        looks_lifetime = (
            expected_lifetime is not None and abs(amount - expected_lifetime) < 0.03
        )
        current_type = r["type"]
        order_dt = datetime.strptime(r["date_created"], "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone.utc
        )
        post_sep = order_dt >= RULES_EFFECTIVE

        rec = {
            "commission_id": commission_id,
            "order_id": order_id,
            "order_date": r["date_created"],
            "affiliate": BTE[affiliate_id]["name"],
            "affiliate_id": affiliate_id,
            "email": r["email"],
            "customer_id": customer_id,
            "lifetime_linked": "yes" if linked else "no",
            "prior_commissions": prior_n,
            "visit_id": visit_id,
            "visit_converted_commission_id": visit_conv,
            "visit_stale": "yes" if visit_stale else "no",
            "fresh_link": "yes" if fresh_link else "no",
            "affiliate_coupon": "yes" if has_aff_coupon else "no",
            "coupons": "|".join(sorted(coupons)) if coupons else "-",
            "should_be_lifetime": "yes" if should else "no",
            "current_type": current_type,
            "amount": f"{amount:.2f}",
            "line_total": f"{line_total:.2f}" if line_total else "",
            "expected_lifetime_10pct": f"{expected_lifetime:.2f}" if expected_lifetime is not None else "",
            "looks_lifetime_rate": "yes" if looks_lifetime else "no",
            "mislabeled_type": "yes" if should and current_type != "lifetime_sale" else "no",
            "overpaid_vs_lifetime": "yes"
            if should
            and expected_lifetime is not None
            and amount > expected_lifetime + 0.03
            else "no",
            "overpay_amount": f"{amount - expected_lifetime:.2f}"
            if should and expected_lifetime is not None and amount > expected_lifetime + 0.03
            else "",
            "status": r["status"],
            "post_sep1_rules": "yes" if post_sep else "no",
        }

        if should:
            should_lifetime.append(rec)

    mislabeled = [r for r in should_lifetime if r["mislabeled_type"] == "yes"]
    overpaid = [r for r in should_lifetime if r["overpaid_vs_lifetime"] == "yes"]
    pre_sep = [r for r in should_lifetime if r["post_sep1_rules"] == "no"]
    post_sep = [r for r in should_lifetime if r["post_sep1_rules"] == "yes"]

    out = REPORT_DIR / "lifetime-stale-cookie-audit-2026-08-17.csv"
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(should_lifetime[0].keys()) if should_lifetime else ["note"])
        w.writeheader()
        w.writerows(should_lifetime)

    print(f"Repeat B/T/E commissions since {SINCE}: {len(rows)}")
    print(f"Should be lifetime (stale cookie / no fresh click): {len(should_lifetime)}")
    print(f"  mislabeled type (not lifetime_sale): {len(mislabeled)}")
    print(f"  overpaid vs 10% lifetime rate: {len(overpaid)}")
    print(f"  before Sep 1 (no backfill): {len(pre_sep)}")
    print(f"  on/after Sep 1: {len(post_sep)}")
    print(f"Report: {out}")

    by_aff: dict[str, int] = {}
    for r in mislabeled:
        by_aff[r["affiliate"]] = by_aff.get(r["affiliate"], 0) + 1
    print("\nMislabeled by affiliate:", by_aff)

    total_overpay = sum(float(r["overpay_amount"]) for r in overpaid if r["overpay_amount"])
    print(f"Total overpay vs 10% on mis-scoped rows: ${total_overpay:,.2f}")

    print("\nSample mislabeled (first 15):")
    for r in mislabeled[:15]:
        print(
            f"  #{r['commission_id']} order {r['order_id']} {r['affiliate']} "
            f"visit={r['visit_id']} type={r['current_type']} amt={r['amount']} "
            f"expect={r['expected_lifetime_10pct']} {r['status']} sep1={r['post_sep1_rules']}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
