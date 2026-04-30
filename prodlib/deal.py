"""
Deal management for product directories.

Each directory can have a Deals/ subfolder containing YYYY-MM-DD-<title>.deal files.

Format:
  deal:
    title: str                   # Human-readable title
    date: str                    # ISO date YYYY-MM-DD
    status: str                  # pending | confirmed | shipped | completed | cancelled
    additional_costs: float      # Additional costs (shipping, customs, etc.)
    additional_costs_currency: str  # Currency for additional costs
    notes: str                   # Free-form notes
    currency: str                # Default currency for this deal

  order:                         # Ordered items
    - product: str               # Relative path to .prod file (from products root)
      product_title: str         # Denormalized title for display
      quantity: int
      unit_price: float          # Unit price
      currency: str              # Currency for this item (overrides deal currency)
      total: float               # Computed or manual total
      notes: str

  warehouse:                     # Warehouse receipt / shipment records
    - date: str                  # When items arrived
      items:
        - product: str           # Relative path to .prod file
          product_title: str     # Denormalized title
          quantity: int
"""

import os
import re
from datetime import date
from typing import Optional

import yaml


ORDER_FIELDS = ["product", "product_title", "quantity", "unit_price",
                "currency", "total", "notes"]

WAREHOUSE_FIELDS = ["date", "items"]
WAREHOUSE_ITEM_FIELDS = ["product", "product_title", "quantity"]


class OrderItem:
    def __init__(self):
        self.product: str = ""
        self.product_title: str = ""
        self.quantity: int = 0
        self.min_qty: int = 0
        self.unit_price: float = 0.0
        self.currency: str = ""
        self.total: float = 0.0
        self.notes: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> "OrderItem":
        o = cls()
        o.product = d.get("product", "")
        o.product_title = d.get("product_title", "")
        o.quantity = int(d.get("quantity", 0))
        o.min_qty = int(d.get("min_qty", 0))
        o.unit_price = float(d.get("unit_price", 0))
        o.currency = d.get("currency", "")
        o.total = float(d.get("total", 0))
        o.notes = d.get("notes", "")
        return o

    def to_dict(self) -> dict:
        d = {}
        if self.product: d["product"] = self.product
        if self.product_title: d["product_title"] = self.product_title
        if self.quantity: d["quantity"] = self.quantity
        if self.min_qty: d["min_qty"] = self.min_qty
        if self.unit_price: d["unit_price"] = self.unit_price
        if self.currency: d["currency"] = self.currency
        if self.total: d["total"] = self.total
        if self.notes: d["notes"] = self.notes
        return d


class WarehouseItem:
    def __init__(self):
        self.product: str = ""
        self.product_title: str = ""
        self.quantity: int = 0

    @classmethod
    def from_dict(cls, d: dict) -> "WarehouseItem":
        w = cls()
        w.product = d.get("product", "")
        w.product_title = d.get("product_title", "")
        w.quantity = int(d.get("quantity", 0))
        return w

    def to_dict(self) -> dict:
        d = {}
        if self.product: d["product"] = self.product
        if self.product_title: d["product_title"] = self.product_title
        if self.quantity: d["quantity"] = self.quantity
        return d


class WarehouseRecord:
    def __init__(self):
        self.date: str = ""
        self.items: list = []

    @classmethod
    def from_dict(cls, d: dict) -> "WarehouseRecord":
        w = cls()
        w.date = d.get("date", "")
        for i in d.get("items", []):
            w.items.append(WarehouseItem.from_dict(i))
        return w

    def to_dict(self) -> dict:
        d = {}
        if self.date: d["date"] = self.date
        if self.items:
            d["items"] = [i.to_dict() for i in self.items]
        return d


class Deal:
    """Represents a single .deal YAML file."""

    def __init__(self, directory: str, filename: str = ""):
        self.directory = directory      # The directory containing the .deal file
        self.filename = filename        # e.g. "2026-04-30-sample.deal"
        self.title: str = ""
        self.date: str = ""
        self.status: str = "pending"
        self.additional_costs: float = 0.0
        self.additional_costs_currency: str = ""
        self.notes: str = ""
        self.currency: str = "USD"
        self.order: list = []           # List[OrderItem]
        self.warehouse: list = []       # List[WarehouseRecord]

    @property
    def filepath(self) -> str:
        return os.path.join(self.directory, self.filename) if self.filename else ""

    @classmethod
    def load(cls, filepath: str) -> "Deal":
        """Load a .deal file. Raises FileNotFoundError, ValueError."""
        if not os.path.isfile(filepath):
            raise FileNotFoundError(f"Deal file not found: {filepath}")

        d = cls(directory=os.path.dirname(filepath),
                filename=os.path.basename(filepath))

        with open(filepath, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        deal_data = data.get("deal", {})
        d.title = deal_data.get("title", "")
        d.date = deal_data.get("date", "")
        d.status = deal_data.get("status", "pending")
        d.additional_costs = float(deal_data.get("additional_costs", 0))
        d.additional_costs_currency = deal_data.get("additional_costs_currency", "")
        d.notes = deal_data.get("notes", "")
        d.currency = deal_data.get("currency", "USD")

        for o in data.get("order", []):
            d.order.append(OrderItem.from_dict(o))

        for w in data.get("warehouse", []):
            d.warehouse.append(WarehouseRecord.from_dict(w))

        return d

    def save(self):
        """Save to the directory + filename."""
        if not self.filename:
            raise ValueError("filename is required to save")

        os.makedirs(self.directory, exist_ok=True)
        filepath = self.filepath

        deal_section = {}
        if self.title: deal_section["title"] = self.title
        if self.date: deal_section["date"] = self.date
        deal_section["status"] = self.status
        if self.additional_costs: deal_section["additional_costs"] = self.additional_costs
        if self.additional_costs_currency: deal_section["additional_costs_currency"] = self.additional_costs_currency
        if self.notes: deal_section["notes"] = self.notes
        deal_section["currency"] = self.currency

        data = {"deal": deal_section}

        if self.order:
            data["order"] = [o.to_dict() for o in self.order]
        if self.warehouse:
            data["warehouse"] = [w.to_dict() for w in self.warehouse]

        with open(filepath, "w", encoding="utf-8") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "title": self.title,
            "date": self.date,
            "status": self.status,
            "additional_costs": self.additional_costs,
            "additional_costs_currency": self.additional_costs_currency,
            "notes": self.notes,
            "currency": self.currency,
            "order": [o.to_dict() for o in self.order],
            "warehouse": [w.to_dict() for w in self.warehouse],
            "order_count": len(self.order),
            "warehouse_records": len(self.warehouse),
        }

    def generate_filename(self) -> str:
        """Generate a filename from date + title."""
        d = self.date or date.today().isoformat()
        safe_title = re.sub(r'[^a-zA-Z0-9_-]+', '_', self.title or 'untitled').strip('_')[:40]
        return f"{d}-{safe_title}.deal"


def list_deals(directory: str) -> list[dict]:
    """List all .deal files in a directory. Returns brief info dicts."""
    try:
        entries = os.listdir(directory)
    except FileNotFoundError:
        return []

    results = []
    for name in sorted(entries, reverse=True):  # newest first
        if name.endswith(".deal") and os.path.isfile(os.path.join(directory, name)):
            try:
                d = Deal.load(os.path.join(directory, name))
                results.append(d.to_dict())
            except Exception:
                results.append({
                    "filename": name,
                    "title": name,
                    "date": name[:10] if len(name) >= 10 else "",
                    "status": "unknown",
                })
    return results
