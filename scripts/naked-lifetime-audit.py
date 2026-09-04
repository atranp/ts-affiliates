#!/usr/bin/env python3
"""Find naked repeat orders since 8/17 for B/T/E lifetime-linked customers."""

from __future__ import annotations

import csv
import shlex
import subprocess
from pathlib import Path

BTE = {81: "Blair", 51: "Trin", 138: "Emmie"}
SINCE = "2026-08-17 00:00:00"
OUT = Path(__file__).resolve().parents[1] / "docs" / "reports" / "naked-lifetime-audit-2026-08-17.csv"

# Repeat WC orders since 8/17 for customers lifetime-linked to B/T/E.
ORDERS_SQL = r"""
SELECT o.id AS order_id,
       o.date_created_gmt AS order_date,
       o.customer_id AS wc_customer_id,
       LOWER(o.billing_email) AS email,
       CAST(linked.meta_value AS UNSIGNED) AS linked_affiliate_id,
       CAST(ref.meta_value AS UNSIGNED) AS referrer_meta,
       CAST(vmeta.meta_value AS UNSIGNED) AS referrer_visit_meta,
       (SELECT COUNT(*) FROM zww_wc_orders o2
        WHERE o2.customer_id = o.customer_id AND o2.customer_id > 0
          AND o2.date_created_gmt < o.date_created_gmt
          AND o2.status IN ('wc-completed','wc-processing','wc-on-hold')) AS prior_wc_orders
FROM zww_wc_orders o
JOIN zww_slicewp_customers cu ON LOWER(cu.email) = LOWER(o.billing_email)
JOIN zww_slicewp_customer_meta linked ON linked.slicewp_customer_id = cu.id
  AND linked.meta_key = 'affiliate_id'
  AND linked.meta_value IN ('81','51','138')
LEFT JOIN zww_wc_orders_meta ref ON ref.order_id = o.id
  AND ref.meta_key = '_ts_slicewp_referrer_affiliate_id'
LEFT JOIN zww_wc_orders_meta vmeta ON vmeta.order_id = o.id
  AND vmeta.meta_key = '_ts_slicewp_referrer_visit_id'
WHERE o.date_created_gmt >= '2026-08-17 00:00:00'
  AND o.status IN ('wc-completed','wc-processing','wc-on-hold')
  AND o.customer_id > 0
HAVING prior_wc_orders > 0
ORDER BY o.date_created_gmt;
"""

COMMISSIONS_SQL = r"""
SELECT c.id, c.reference, c.affiliate_id, c.type, c.amount, c.status, c.visit_id, c.customer_id
FROM zww_slicewp_commissions c
WHERE c.origin = 'woo'
  AND c.date_created >= '2026-08-17 00:00:00'
  AND c.status IN ('paid','unpaid','pending');
"""

AFF_COUPONS_SQL = r"""
SELECT LOWER(p.post_title) AS code, CAST(pm.meta_value AS UNSIGNED) AS affiliate_id
FROM zww_posts p
JOIN zww_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = 'slicewp_affiliate_id'
WHERE p.post_type = 'shop_coupon' AND pm.meta_value IN ('81','51','138');
"""

ORDER_COUPONS_SQL = """
SELECT oi.order_id, LOWER(oi.order_item_name) AS coupon_code
FROM zww_woocommerce_order_items oi
WHERE oi.order_item_type = 'coupon' AND oi.order_id IN ({ids});
"""


def run_sql(sql: str) -> str:
    one_line = " ".join(sql.split())
    remote = f"cd ~/www/true-sciences.com/public_html && wp db query {shlex.quote(one_line)} 2>/dev/null"
    return subprocess.check_output(["ssh", "tsprod", remote], text=True)


def parse_tsv(raw: str) -> list[dict[str, str]]:
    lines = [ln for ln in raw.strip().splitlines() if ln.strip()]
    if len(lines) < 2:
        return []
    return list(csv.DictReader(lines, delimiter="\t"))


def chunked(ids: list[int], size: int = 400):
    for i in range(0, len(ids), size):
        yield ids[i : i + size]


def as_int(val: str) -> int:
    if not val or val.upper() == "NULL":
        return 0
    return int(val)


def main() -> None:
    orders = parse_tsv(run_sql(ORDERS_SQL))
    commissions = parse_tsv(run_sql(COMMISSIONS_SQL))
    aff_coupons = {r["code"]: int(r["affiliate_id"]) for r in parse_tsv(run_sql(AFF_COUPONS_SQL))}

    comm_by_order: dict[int, list[dict]] = {}
    for c in commissions:
        oid = int(c["reference"])
        comm_by_order.setdefault(oid, []).append(c)

    order_ids = [int(o["order_id"]) for o in orders]
    order_coupons: dict[int, set[str]] = {}
    for chunk in chunked(order_ids):
        ids = ",".join(str(i) for i in chunk)
        for row in parse_tsv(run_sql(ORDER_COUPONS_SQL.format(ids=ids))):
            order_coupons.setdefault(int(row["order_id"]), set()).add(row["coupon_code"])

    naked: list[dict] = []
    for o in orders:
        oid = int(o["order_id"])
        linked = int(o["linked_affiliate_id"])
        referrer = as_int(o.get("referrer_meta", ""))
        visit_meta = as_int(o.get("referrer_visit_meta", ""))
        coupons = order_coupons.get(oid, set())
        has_aff_coupon = any(aff_coupons.get(c) == linked for c in coupons)
        has_cookie_or_link = referrer > 0 or visit_meta > 0
        is_naked = not has_cookie_or_link and not has_aff_coupon

        comms = comm_by_order.get(oid, [])
        linked_comm = [c for c in comms if int(c["affiliate_id"]) == linked]
        any_comm = comms
        lifetime_comm = [c for c in comms if c["type"] == "lifetime_sale"]

        if not is_naked:
            continue

        naked.append(
            {
                "order_id": oid,
                "order_date": o["order_date"],
                "email": o["email"],
                "linked_affiliate_id": linked,
                "linked_affiliate": BTE.get(linked, str(linked)),
                "prior_wc_orders": o["prior_wc_orders"],
                "referrer_meta": referrer,
                "referrer_visit_meta": visit_meta,
                "coupons": "|".join(sorted(coupons)) if coupons else "-",
                "has_bte_commission": "yes" if linked_comm else "no",
                "commission_id": linked_comm[0]["id"] if linked_comm else "",
                "commission_type": linked_comm[0]["type"] if linked_comm else "",
                "commission_amount": linked_comm[0]["amount"] if linked_comm else "",
                "commission_status": linked_comm[0]["status"] if linked_comm else "",
                "any_affiliate_commission": "yes" if any_comm else "no",
                "other_affiliate_id": any_comm[0]["affiliate_id"] if any_comm and not linked_comm else "",
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(naked[0].keys()) if naked else ["note"])
        w.writeheader()
        w.writerows(naked)

    lifetime_all = [c for c in commissions if c["type"] == "lifetime_sale" and int(c["affiliate_id"]) in BTE]
    naked_with_comm = [r for r in naked if r["has_bte_commission"] == "yes"]
    naked_no_comm = [r for r in naked if r["has_bte_commission"] == "no" and r["any_affiliate_commission"] == "no"]
    naked_other_wins = [r for r in naked if r["any_affiliate_commission"] == "yes" and r["has_bte_commission"] == "no"]

    print(f"Lifetime-linked repeat WC orders since 8/17: {len(orders)}")
    print(f"Truly naked (no referrer meta, no visit meta, no B/T/E coupon): {len(naked)}")
    print(f"  naked + B/T/E commission paid: {len(naked_with_comm)}")
    print(f"  naked + NO affiliate commission at all: {len(naked_no_comm)}")
    print(f"  naked + different affiliate paid: {len(naked_other_wins)}")
    print(f"lifetime_sale commissions (B/T/E, since 8/17): {len(lifetime_all)}")
    print(f"Report: {OUT}")

    if naked_no_comm:
        print("\nNaked repeats with NO commission (lifetime candidates missed?):")
        for r in naked_no_comm[:20]:
            print(f"  order {r['order_id']} {r['order_date']} {r['linked_affiliate']} {r['email']}")

    if naked_with_comm:
        print("\nNaked repeats that DID get B/T/E commission:")
        for r in naked_with_comm[:15]:
            print(
                f"  order {r['order_id']} #{r['commission_id']} {r['commission_type']} "
                f"${r['commission_amount']} {r['linked_affiliate']}"
            )

    if lifetime_all:
        print("\nlifetime_sale rows:")
        for c in lifetime_all:
            print(f"  #{c['id']} order {c['reference']} aff {c['affiliate_id']} ${c['amount']} {c['status']}")


if __name__ == "__main__":
    main()
