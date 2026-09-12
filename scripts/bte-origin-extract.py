#!/usr/bin/env python3
"""Pull production order + commission history for the B/T/E origin report.

Read-only. Writes a raw cache so the PDF generators can run without re-querying
production. All classification happens in bte_origin_model.py.
"""

from __future__ import annotations

import json
from pathlib import Path

from tsprod_sql import run_sql

OUT = Path(__file__).resolve().parents[1] / "docs" / "reports" / "true30-export" / "origin-raw.json"

ORDER_STATUSES = "('wc-completed','wc-processing')"


def b64(expr: str) -> str:
    """Base64 a free-text column so it survives wp db query's TSV output.

    URLs can contain tabs or newlines, which would corrupt the TSV. REPLACE()
    is not an option: WP-CLI 2.12 scans the SQL for write keywords and treats
    any query containing REPLACE as a REPLACE INTO, so it discards the result
    set and prints "Rows affected: -1" instead.
    """
    return f"TO_BASE64(IFNULL({expr},''))"


def unb64(value: str) -> str:
    """Decode a TO_BASE64 column, undoing MySQL's line wrapping first.

    TO_BASE64 breaks its output every 76 characters and the mysql batch writer
    emits those breaks as the two-character escape \\n. Feeding that straight to
    b64decode silently corrupts the value, because the backslash is discarded as
    non-alphabet while the 'n' is a valid base64 character and gets decoded as
    data -- so everything past the first 57 bytes shifts.
    """
    import base64

    if not value:
        return ""
    cleaned = value.replace("\\n", "").replace("\n", "").replace("\\t", "").replace("\r", "")
    try:
        return base64.b64decode(cleaned, validate=True).decode("utf-8", "replace")
    except Exception:
        try:
            return base64.b64decode(cleaned).decode("utf-8", "replace")
        except Exception:
            return ""


B64_COLUMNS = {"session_entry", "referrer", "landing_url"}

ORDERS_SQL = f"""
SELECT o.id AS order_id,
       o.date_created_gmt AS order_date,
       o.total_amount AS total,
       LOWER(IFNULL(o.billing_email,'')) AS email,
       {b64('se.meta_value')} AS session_entry,
       {b64('rf.meta_value')} AS referrer,
       IFNULL(us.meta_value,'') AS utm_source,
       IFNULL(um.meta_value,'') AS utm_medium,
       IFNULL(uc.meta_value,'') AS utm_campaign,
       IFNULL(st.meta_value,'') AS source_type,
       IFNULL(ck.meta_value,'') AS cookie_aff
FROM zww_wc_orders o
LEFT JOIN zww_wc_orders_meta se ON se.order_id=o.id AND se.meta_key='_wc_order_attribution_session_entry'
LEFT JOIN zww_wc_orders_meta rf ON rf.order_id=o.id AND rf.meta_key='_wc_order_attribution_referrer'
LEFT JOIN zww_wc_orders_meta us ON us.order_id=o.id AND us.meta_key='_wc_order_attribution_utm_source'
LEFT JOIN zww_wc_orders_meta um ON um.order_id=o.id AND um.meta_key='_wc_order_attribution_utm_medium'
LEFT JOIN zww_wc_orders_meta uc ON uc.order_id=o.id AND uc.meta_key='_wc_order_attribution_utm_campaign'
LEFT JOIN zww_wc_orders_meta st ON st.order_id=o.id AND st.meta_key='_wc_order_attribution_source_type'
LEFT JOIN zww_wc_orders_meta ck ON ck.order_id=o.id AND ck.meta_key='_ts_slicewp_referrer_affiliate_id'
WHERE o.status IN {ORDER_STATUSES}
ORDER BY o.id
"""

COMMISSIONS_SQL = """
SELECT c.id AS commission_id,
       c.affiliate_id,
       c.type,
       c.status,
       c.amount,
       c.date_created,
       c.reference AS order_id,
       c.visit_id,
       c.customer_id,
       IFNULL(v.date_created,'') AS visit_date
FROM zww_slicewp_commissions c
LEFT JOIN zww_slicewp_visits v ON v.id = c.visit_id
WHERE c.origin='woo'
  AND c.type IN ('sale','lifetime_sale')
  AND c.status IN ('paid','unpaid','pending')
ORDER BY c.id
"""

AFFILIATES_SQL = """
SELECT a.id, IFNULL(u.display_name,'') AS display_name, IFNULL(a.status,'') AS status
FROM zww_slicewp_affiliates a
LEFT JOIN zww_users u ON u.ID = a.user_id
"""

SLUGS_SQL = """
SELECT am.slicewp_affiliate_id AS affiliate_id, am.meta_value AS slug
FROM zww_slicewp_affiliate_meta am
WHERE am.meta_key = 'custom_slug' AND am.meta_value <> ''
"""

# cu.affiliate_id is the authoritative lifetime link: it covers 5,628 of 5,631
# customers, where the 'affiliate_id' customer_meta row covers only 4,190 and
# disagrees with the column on 64 of them.
LIFETIME_SQL = """
SELECT cu.id AS customer_id, LOWER(IFNULL(cu.email,'')) AS email,
       cu.affiliate_id AS lifetime_affiliate_id,
       cu.date_created AS customer_since,
       CASE WHEN a.id IS NULL THEN 1 ELSE 0 END AS affiliate_deleted
FROM zww_slicewp_customers cu
LEFT JOIN zww_slicewp_affiliates a ON a.id = cu.affiliate_id
WHERE cu.affiliate_id > 0
"""

VISITS_SQL = f"""
SELECT v.id AS visit_id, v.affiliate_id, v.date_created,
       {b64('v.landing_url')} AS landing_url,
       v.commission_id
FROM zww_slicewp_visits v
WHERE v.date_created >= '2026-06-01'
  AND v.commission_id > 0
"""


def main() -> None:
    payload = {}
    for name, sql in (
        ("orders", ORDERS_SQL),
        ("commissions", COMMISSIONS_SQL),
        ("affiliates", AFFILIATES_SQL),
        ("slugs", SLUGS_SQL),
        ("lifetime_links", LIFETIME_SQL),
        ("visits", VISITS_SQL),
    ):
        rows = run_sql(sql)
        for row in rows:
            for col in B64_COLUMNS & row.keys():
                row[col] = unb64(row[col])
        payload[name] = rows
        print(f"{name}: {len(rows)} rows")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
