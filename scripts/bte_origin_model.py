#!/usr/bin/env python3
"""Classify how each order arrived and who first brought the customer.

Consumes the raw production pull from bte-origin-extract.py. No network or
database access happens here, so the model can be re-run and audited offline.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "docs" / "reports" / "true30-export" / "origin-raw.json"

BTE = {81: "Blair", 51: "Trin", 138: "Emmie"}

# True Sciences runs its own paid ads and Klaviyo sends through affiliate
# accounts, so their traffic arrives on /aff/<slug> links like any partner's.
# Credit them to the channel they represent rather than to "an affiliate".
HOUSE_ACCOUNTS = {181: "paid_ad", 234: "klaviyo"}
HOUSE_NAMES = {181: "True Sciences paid ads", 234: "True Sciences email marketing"}

# Affiliate 15 has no row in the affiliates table, no visits and no commission
# in its history, but 884 customers still carry it as their lifetime link. It
# was deleted from the program and left orphaned links behind.
DELETED_AFFILIATES = {15, 2, 9, 10}

PAID_AD_SOURCES = {"fb", "ig", "an", "facebook.com", "m.facebook.com", "l.facebook.com",
                   "instagram.com", "l.instagram.com", "tiktok.com", "msha.ke"}
GMAIL_SOURCES = {"mail.google.com", "com.google.android.gm"}

ORIGIN_LABELS = {
    "affiliate_link": "Affiliate link click",
    "klaviyo": "True Sciences email (Klaviyo)",
    "email_client": "Email client (Gmail)",
    "paid_ad": "Paid ad",
    "organic": "Organic search",
    "referral": "Referral site",
    "house_deleted": "Affiliate no longer on the program",
    "direct": "Direct / typed in",
    "unknown": "Unknown",
}


def money(value: str | float) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def parse_dt(value: str) -> datetime | None:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


class Model:
    def __init__(self, raw: dict):
        self.raw = raw
        self.affiliate_names = {
            int(a["id"]): (a.get("display_name") or f"Affiliate #{a['id']}")
            for a in raw["affiliates"] if a.get("id")
        }
        self.slug_to_affiliate = {}
        for row in raw.get("slugs", []):
            slug = (row.get("slug") or "").strip().lower()
            if slug:
                self.slug_to_affiliate[slug] = int(row["affiliate_id"])

        self.orders = []
        for row in raw["orders"]:
            row["order_id"] = int(row["order_id"])
            row["total"] = money(row.get("total"))
            row["dt"] = parse_dt(row.get("order_date", ""))
            self.orders.append(row)
        self.orders.sort(key=lambda r: (r["dt"] or datetime.min, r["order_id"]))
        self.by_order_id = {o["order_id"]: o for o in self.orders}

        # Commission per order: prefer the highest-value sale row for that order.
        self.commission_by_order: dict[int, dict] = {}
        for row in raw["commissions"]:
            try:
                oid = int(str(row["order_id"]).strip())
            except ValueError:
                continue
            row["amount"] = money(row.get("amount"))
            row["affiliate_id"] = int(row["affiliate_id"] or 0)
            best = self.commission_by_order.get(oid)
            if best is None or row["amount"] > best["amount"]:
                self.commission_by_order[oid] = row

        self.lifetime_by_email = {}
        for row in raw.get("lifetime_links", []):
            email = (row.get("email") or "").strip().lower()
            if email:
                self.lifetime_by_email[email] = int(row["lifetime_affiliate_id"] or 0)

        self.deleted_affiliates = set(DELETED_AFFILIATES)
        for row in raw.get("lifetime_links", []):
            if str(row.get("affiliate_deleted", "0")) == "1":
                self.deleted_affiliates.add(int(row["lifetime_affiliate_id"] or 0))
        self.deleted_affiliates.discard(0)

        self._build_customer_sequences()
        for order in self.orders:
            order["origin"], order["origin_affiliate"] = self.classify(order)
            # A Klaviyo click token can ride on any link, including an
            # affiliate's own, so track it independently of the last-click
            # bucket: it answers "did our email deliver this visit?"
            order["via_klaviyo"] = "_kx=" in (order.get("session_entry") or "").lower()

    def _build_customer_sequences(self) -> None:
        seen: dict[str, int] = defaultdict(int)
        first_order: dict[str, int] = {}
        for order in self.orders:
            email = (order.get("email") or "").strip().lower()
            order["email"] = email
            if not email:
                order["seq"] = 0
                order["is_repeat"] = False
                continue
            order["seq"] = seen[email]
            order["is_repeat"] = seen[email] > 0
            if email not in first_order:
                first_order[email] = order["order_id"]
            seen[email] += 1
        self.first_order_id_by_email = first_order

    def classify(self, order: dict) -> tuple[str, int | None]:
        entry = (order.get("session_entry") or "").lower()
        referrer = (order.get("referrer") or "").lower()
        utm_source = (order.get("utm_source") or "").strip().lower()
        utm_medium = (order.get("utm_medium") or "").strip().lower()
        source_type = (order.get("source_type") or "").strip().lower()

        match = re.search(r"/aff/([^/?&#\s]+)", entry)
        if match:
            token = match.group(1).lower()
            affiliate_id = None
            if token.isdigit():
                affiliate_id = int(token)
            elif token in self.slug_to_affiliate:
                affiliate_id = self.slug_to_affiliate[token]
            if affiliate_id in HOUSE_ACCOUNTS:
                return HOUSE_ACCOUNTS[affiliate_id], affiliate_id
            return "affiliate_link", affiliate_id

        if "_kx=" in entry:
            return "klaviyo", None
        if utm_source in GMAIL_SOURCES or "mail.google" in referrer or "android.gm" in referrer:
            return "email_client", None
        if utm_medium == "paid" or utm_source in PAID_AD_SOURCES:
            return "paid_ad", None
        if source_type == "organic":
            return "organic", None
        if source_type == "referral":
            return "referral", None
        if source_type in ("typein", "admin"):
            return "direct", None
        return "unknown", None

    def first_touch(self, email: str) -> dict | None:
        """The customer's very first order, and who was credited for it."""
        oid = self.first_order_id_by_email.get(email)
        if oid is None:
            return None
        first = self.by_order_id[oid]
        commission = self.commission_by_order.get(oid)
        owner = commission["affiliate_id"] if commission else None
        return {
            "order_id": oid,
            "date": first.get("order_date", ""),
            "origin": first["origin"],
            "origin_affiliate": first["origin_affiliate"],
            "via_klaviyo": first["via_klaviyo"],
            "commission_affiliate": owner,
        }

    def bte_commissions(self, start: str, end: str) -> list[dict]:
        """Every B/T/E sale commission on an order placed in [start, end)."""
        out = []
        for oid, commission in self.commission_by_order.items():
            if commission["affiliate_id"] not in BTE:
                continue
            order = self.by_order_id.get(oid)
            if not order or not order["dt"]:
                continue
            if not (start <= order["order_date"] < end):
                continue
            email = order["email"]
            ft = self.first_touch(email) if email else None
            out.append({
                "order_id": oid,
                "date": order["order_date"],
                "total": order["total"],
                "affiliate_id": commission["affiliate_id"],
                "affiliate": BTE[commission["affiliate_id"]],
                "commission": commission["amount"],
                "type": commission["type"],
                "status": commission["status"],
                "origin": order["origin"],
                "origin_affiliate": order["origin_affiliate"],
                "is_repeat": order["is_repeat"],
                "via_klaviyo": order["via_klaviyo"],
                "seq": order["seq"],
                "visit_date": commission.get("visit_date", ""),
                "lag_days": self.lag_days(commission.get("visit_date", ""), order.get("order_date", "")),
                "email": email,
                "lifetime_affiliate": self.lifetime_by_email.get(email),
                "first_touch": ft,
            })
        out.sort(key=lambda r: r["date"])
        return out

    @staticmethod
    def lag_days(visit_date: str, order_date: str) -> float | None:
        """Days between the click that earned the commission and the order."""
        start, end = parse_dt(visit_date or ""), parse_dt(order_date or "")
        if not start or not end:
            return None
        return round((end - start).total_seconds() / 86400.0, 2)

    def name(self, affiliate_id: int | None) -> str:
        if not affiliate_id:
            return "—"
        if affiliate_id in HOUSE_NAMES:
            return HOUSE_NAMES[affiliate_id]
        if affiliate_id in BTE:
            return BTE[affiliate_id]
        if affiliate_id in self.deleted_affiliates:
            return "an affiliate no longer on the program"
        return self.affiliate_names.get(affiliate_id, f"Affiliate #{affiliate_id}")


def load() -> Model:
    return Model(json.loads(RAW.read_text()))
