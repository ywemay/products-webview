"""Backend store ─ the high-level CRUD layer used by the WebView frontend."""

import os
import base64

from .core import Product, PriceRecord, generate_combinations


def _make_thumbnail(data: bytes, max_size: int = 120) -> str:
    """Return a base64 data-URL (no server-side resize; we send the JPEG data
    and let the browser handle it).  For large images, clientside CSS will
    constrain the card thumbnail to 120px.
    """
    return "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")


def list_products(dir_path: str) -> list[str]:
    """Return full paths of .prod files under dir_path."""
    try:
        entries = os.listdir(dir_path)
    except FileNotFoundError:
        return []
    result = []
    for name in entries:
        if name.endswith(".prod") and os.path.isfile(os.path.join(dir_path, name)):
            result.append(os.path.join(dir_path, name))
    return result


def list_subdirs(dir_path: str) -> list[str]:
    """Return directory names (not full paths) of subdirectories under dir_path."""
    try:
        entries = os.listdir(dir_path)
    except FileNotFoundError:
        return []
    return [e for e in sorted(entries)
            if os.path.isdir(os.path.join(dir_path, e))]


def list_items(dir_path: str) -> list[dict]:
    """Return a combined list of subdirectories (with company.yaml enrichment)
    and .prod files under dir_path.

    Each item has:
      type: "folder" | "file"
      name: str
      path: str
      company: dict or None (only for folders)
    """
    items = []
    try:
        entries = os.listdir(dir_path)
    except FileNotFoundError:
        return []

    # Import company module lazily to avoid circular imports
    from .company import Company

    for name in sorted(entries):
        full_path = os.path.join(dir_path, name)
        if os.path.isdir(full_path):
            item = {
                "type": "folder",
                "name": name,
                "path": full_path,
                "company": None,
            }
            # Try to load company.yaml
            company_yaml = os.path.join(full_path, "company.yaml")
            if os.path.isfile(company_yaml):
                try:
                    c = Company.load(full_path)
                    item["company"] = {
                        "name": c.name,
                        "address": c.address,
                        "website": c.website,
                        "company_type": c.company_type,
                        "emails": c.emails,
                        "phones": c.phones,
                        "contactCount": len(c.contacts),
                    }
                except Exception:
                    pass
            items.append(item)
        elif name.endswith(".prod") and os.path.isfile(full_path):
            items.append({
                "type": "file",
                "name": name,
                "path": full_path,
                "subtype": "prod",
                "company": None,
            })
        elif name.endswith(".deal") and os.path.isfile(full_path):
            from .deal import Deal
            deal_info = {"name": name, "path": full_path, "subtype": "deal"}
            try:
                d = Deal.load(full_path)
                deal_info["deal"] = {
                    "title": d.title,
                    "date": d.date,
                    "status": d.status,
                    "order_count": len(d.order),
                    "warehouse_records": len(d.warehouse),
                }
            except Exception:
                pass
            items.append({
                "type": "file",
                "name": name,
                "path": full_path,
                "subtype": "deal",
                "company": None,
                "deal_info": deal_info.get("deal"),
            })

    return items


def create_subdir(parent_dir: str, name: str) -> str:
    """Create a subdirectory. Returns the full path."""
    full = os.path.join(parent_dir, name)
    os.makedirs(full, exist_ok=True)
    return full


def _groups_to_dicts(groups):
    """Convert VariationGroup dataclass list to plain dicts for JSON serialization."""
    return [{"name": g.name, "values": list(g.values), "affects_price": g.affects_price, "affects_appearance": g.affects_appearance} for g in groups]


def open_product(path: str) -> dict:
    """Open a .prod file and return a JSON-serialisable info dict."""
    p = Product.open(path)
    return {
        "title": p.header.title,
        "uuid": p.header.uuid,
        "code": p.header.code,
        "unit": p.header.unit,
        "description": p.header.description,
        "variation_groups": _groups_to_dicts(p.header.variation_groups),
        "photoCount": len(p.photos),
        "priceCount": len(p.price_history),
        "photos": [_make_thumbnail(d) for d in p.photos],
    }


def create_product(path: str, title: str, code: str,
                   description: str) -> dict:
    """Create a new .prod file and return its info."""
    Product.create(path, title=title, code=code, description=description)
    return open_product(path)


def save_product(path: str, data: dict) -> dict:
    """Save product fields (title, code, description, variation_groups)."""
    p = Product.open(path)
    if "title" in data:
        p.header.title = data["title"]
    if "code" in data:
        p.header.code = data["code"]
    if "unit" in data:
        p.header.unit = data["unit"]
    if "description" in data:
        p.header.description = data["description"]
    if "variation_groups" in data:
        groups = []
        for g in data["variation_groups"]:
            from .core import VariationGroup
            groups.append(VariationGroup(
                name=g.get("name", ""),
                values=list(g.get("values", [])),
                affects_price=g.get("affects_price", True),
                affects_appearance=g.get("affects_appearance", True),
            ))
        p.header.variation_groups = groups
    p.save(path)
    return open_product(path)


def add_price(path: str, currency: str, variation: str,
              price: float) -> None:
    p = Product.open(path)
    import time
    
    # Build flat variation index from all group values
    flat_vars = []
    for g in p.header.variation_groups:
        flat_vars.extend(g.values)
    
    var_idx = -1
    if variation:
        for i, v in enumerate(flat_vars):
            if v == variation:
                var_idx = i
                break
    pr = PriceRecord(
        timestamp=int(time.time()),
        variation_index=var_idx,
        price_hundredths=int(price * 100 + 0.5),
        currency=currency,
    )
    p.add_price(pr)
    p.save(path)


def add_photo(path: str, photo_path: str) -> None:
    p = Product.open(path)
    with open(photo_path, "rb") as f:
        data = f.read()
    p.add_photo(data)
    p.save(path)


def remove_photo(path: str, index: int) -> None:
    p = Product.open(path)
    p.remove_photo(index)
    p.save(path)


def get_price_history(path: str) -> list[dict]:
    p = Product.open(path)
    from datetime import datetime, timezone
    
    # Build flat variation lookup
    flat_vars = []
    for g in p.header.variation_groups:
        flat_vars.extend(g.values)
    
    result = []
    for rec in p.price_history:
        try:
            dt = datetime.fromtimestamp(rec.timestamp, tz=timezone.utc)
        except (ValueError, OSError, OverflowError):
            dt = datetime.fromtimestamp(rec.timestamp / 1000, tz=timezone.utc)
        result.append({
            "timestamp": rec.timestamp,
            "date": dt.isoformat(),
            "variation": (flat_vars[rec.variation_index]
                          if 0 <= rec.variation_index < len(flat_vars)
                          else ""),
            "price": rec.price_hundredths / 100.0,
            "currency": rec.currency,
        })
    return result


def edit_price(path: str, index: int, price: float = None, currency: str = None) -> None:
    p = Product.open(path)
    if index < 0 or index >= len(p.price_history):
        raise IndexError(f"price index {index} out of range")
    rec = p.price_history[index]
    if price is not None:
        rec.price_hundredths = int(price * 100 + 0.5)
    if currency is not None:
        if len(currency) != 3:
            raise ValueError("currency must be 3 characters")
        rec.currency = currency
    p.save(path)


def delete_price(path: str, index: int) -> None:
    p = Product.open(path)
    if index < 0 or index >= len(p.price_history):
        raise IndexError(f"price index {index} out of range")
    p.price_history.pop(index)
    p.save(path)


def export_photo(path: str, index: int) -> dict:
    """Return photo as base64 data for browser download."""
    p = Product.open(path)
    if index < 0 or index >= len(p.photos):
        raise IndexError(f"photo index {index} out of range")
    import base64
    return {
        "index": index,
        "mime": "image/jpeg",
        "data": base64.b64encode(p.photos[index]).decode("ascii"),
        "filename": f"photo_{index + 1}.jpg",
    }


def move_photo(path: str, index: int, direction: int) -> None:
    p = Product.open(path)
    if index < 0 or index >= len(p.photos):
        raise IndexError(f"photo index {index} out of range")
    new_idx = index + direction
    if new_idx < 0 or new_idx >= len(p.photos):
        return  # can't move beyond bounds
    p.photos[index], p.photos[new_idx] = p.photos[new_idx], p.photos[index]
    p.save(path)


def get_settings() -> dict:
    """Load settings from JSON file."""
    store_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(store_dir, exist_ok=True)
    cfg_path = os.path.join(store_dir, "settings.json")
    if os.path.exists(cfg_path):
        import json
        with open(cfg_path) as f:
            return json.load(f)
    return {"currency": "CNY", "language": "en"}


def save_settings(settings: dict) -> None:
    store_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(store_dir, exist_ok=True)
    cfg_path = os.path.join(store_dir, "settings.json")
    import json
    with open(cfg_path, "w") as f:
        json.dump(settings, f)


# ============== DEALS ==============

def get_deals_dir(company_dir: str) -> str:
    """Return the Deals subdirectory path for a given company directory."""
    return os.path.join(company_dir, "Deals")


def list_deals(company_dir: str) -> list[dict]:
    """List all deals in the Deals/ subdirectory."""
    from .deal import list_deals as _list_deals
    deals_dir = get_deals_dir(company_dir)
    return _list_deals(deals_dir)


def get_deal(company_dir: str, filename: str) -> dict:
    """Get a single deal by filename."""
    from .deal import Deal
    deals_dir = get_deals_dir(company_dir)
    filepath = os.path.join(deals_dir, filename)
    d = Deal.load(filepath)
    return d.to_dict()


def save_deal(company_dir: str, deal_data: dict) -> dict:
    """Save a deal. Creates or updates."""
    from .deal import Deal, OrderItem, WarehouseRecord, WarehouseItem
    deals_dir = get_deals_dir(company_dir)
    os.makedirs(deals_dir, exist_ok=True)

    d = Deal(deals_dir)
    d.filename = deal_data.get("filename", "")
    d.title = deal_data.get("title", "")
    d.date = deal_data.get("date", "")
    d.status = deal_data.get("status", "pending")
    d.additional_costs = float(deal_data.get("additional_costs", 0))
    d.additional_costs_currency = deal_data.get("additional_costs_currency", "")
    d.notes = deal_data.get("notes", "")
    d.currency = deal_data.get("currency", "USD")

    for o in deal_data.get("order", []):
        item = OrderItem.from_dict(o)
        d.order.append(item)

    for w in deal_data.get("warehouse", []):
        rec = WarehouseRecord.from_dict(w)
        d.warehouse.append(rec)

    if not d.filename:
        d.filename = d.generate_filename()

    d.save()
    return d.to_dict()


def delete_deal(company_dir: str, filename: str) -> None:
    """Delete a .deal file."""
    deals_dir = get_deals_dir(company_dir)
    filepath = os.path.join(deals_dir, filename)
    if os.path.isfile(filepath):
        os.remove(filepath)
