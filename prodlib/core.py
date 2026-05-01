"""Core .prod file format implementation."""

import json
import os
import struct
import tempfile
import uuid as _uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional

MAGIC_V2 = b"PROD\x02"
MAGIC_V3 = b"PROD\x03"
MAX_PHOTOS = 25


def _generate_uuid() -> str:
    return str(_uuid.uuid4())


def _generate_code(uuid_str: str) -> str:
    return "PROD-" + uuid_str[:8]


def _normalize_timestamp(ts: int) -> int:
    """Normalize a timestamp that might be in milliseconds to seconds."""
    if ts > 10**11:  # millisecond timestamp
        return ts // 1000
    return ts


@dataclass
class VariationGroup:
    name: str = ""
    values: list = field(default_factory=list)
    affects_price: bool = True
    affects_appearance: bool = True


@dataclass
class Header:
    version: int = 3
    title: str = ""
    uuid: str = ""
    code: str = ""
    description: str = ""
    unit: str = ""
    variation_groups: list = field(default_factory=list)


@dataclass
class PriceRecord:
    timestamp: int = 0       # Unix seconds
    variation_index: int = -1
    price_hundredths: int = 0  # price * 100 + 0.5
    currency: str = "USD"


def generate_combinations(variation_groups: list) -> list[dict]:
    """Generate all combinations across variation groups.
    
    First group changes slowest, last group changes fastest.
    Returns list of dicts with 'values' (list) and 'label' (str).
    """
    if not variation_groups:
        return []
    
    # If any group has no values, there are no valid combinations
    for g in variation_groups:
        if not g.get("values") if isinstance(g, dict) else not g.values:
            return []
    
    groups = variation_groups
    total = 1
    for g in groups:
        vals = g.get("values") if isinstance(g, dict) else g.values
        total *= len(vals)
    
    result = []
    for i in range(total):
        values = []
        remain = i
        # Last group cycles fastest
        for gi in range(len(groups) - 1, -1, -1):
            g = groups[gi]
            vals = g.get("values") if isinstance(g, dict) else g.values
            idx = remain % len(vals)
            values.insert(0, vals[idx])
            remain //= len(vals)
        
        # Build label
        parts = [v for v in values if v]
        label = " / ".join(parts) if parts else ""
        
        result.append({"values": values, "label": label})
    
    return result


def _convert_v2_variations(raw: dict) -> list[dict]:
    """Convert old flat 'variations' list to new 'variation_groups' format."""
    old_vars = raw.get("variations", [])
    if old_vars and not raw.get("variation_groups"):
        return [{"name": "", "values": old_vars, "affects_price": True}]
    return raw.get("variation_groups", [])


def price_affecting_combinations(variation_groups: list) -> list[dict]:
    """Return combinations from groups where affects_price is True.
    
    If no groups affect price, returns a single "Base" combination.
    """
    affected = []
    for g in variation_groups:
        if isinstance(g, dict):
            if g.get("affects_price", True):
                affected.append(g)
        else:
            if getattr(g, "affects_price", True):
                affected.append(g)
    if not affected:
        return [{"values": [], "label": "Base"}]
    return generate_combinations(affected)


class Product:
    """In-memory representation of a .prod file."""

    def __init__(self, header: Optional[Header] = None):
        self.header = header or Header()
        self.price_history: list[PriceRecord] = []
        self.photos: list[bytes] = []

    @classmethod
    def create(cls, path: str, title: str = "",
               code: str = "", description: str = "") -> "Product":
        uid = _generate_uuid()
        if not code:
            code = _generate_code(uid)
        hdr = Header(version=3, title=title, uuid=uid,
                     code=code, description=description)
        p = cls(hdr)
        p.save(path)
        return p

    @classmethod
    def open(cls, path: str) -> "Product":
        with open(path, "rb") as f:
            magic = f.read(5)
            if magic == MAGIC_V2 or magic == MAGIC_V3:
                pass  # valid
            else:
                raise ValueError("not a valid .prod file")

            hdr_len = struct.unpack("<I", f.read(4))[0]
            hdr_buf = f.read(hdr_len)
            raw = json.loads(hdr_buf.decode("utf-8", errors="replace"))
            
            # v2 → v3 migration: convert flat variations to variation groups
            if raw.get("version", 2) < 3:
                raw["version"] = 3
            
            variation_groups = _convert_v2_variations(raw)
            
            hdr = Header(
                version=raw.get("version", 3),
                title=raw.get("title", ""),
                uuid=raw.get("uuid", ""),
                code=raw.get("code", ""),
                unit=raw.get("unit", ""),
                description=raw.get("description", ""),
                variation_groups=[
                    VariationGroup(name=g.get("name", ""), values=g.get("values", []), affects_price=g.get("affects_price", True), affects_appearance=g.get("affects_appearance", True))
                    for g in variation_groups
                ],
            )
            p = cls(hdr)

            # Price history block
            rec_count = struct.unpack("<I", f.read(4))[0]
            for _ in range(rec_count):
                ts = _normalize_timestamp(struct.unpack("<q", f.read(8))[0])
                vi = struct.unpack("<i", f.read(4))[0]
                ph = struct.unpack("<q", f.read(8))[0]
                curr = f.read(3).decode("ascii")
                p.price_history.append(PriceRecord(ts, vi, ph, curr))

            # Photo block
            photo_count = struct.unpack("<I", f.read(4))[0]
            if photo_count > 0:
                offsets = [struct.unpack("<I", f.read(4))[0]
                           for _ in range(photo_count)]
                data_start = f.tell()
                for i, off in enumerate(offsets):
                    f.seek(data_start + off)
                    plen = struct.unpack("<I", f.read(4))[0]
                    p.photos.append(f.read(plen))

        return p

    def save(self, path: str):
        self.header.version = 3
        dirname = os.path.dirname(path)
        fd, tmp = tempfile.mkstemp(dir=dirname or ".", prefix=".prod-tmp-")
        try:
            with os.fdopen(fd, "wb") as f:
                # Magic (v3)
                f.write(MAGIC_V3)
                # Header
                hdr_json = json.dumps(asdict(self.header),
                                      ensure_ascii=False).encode("utf-8")
                f.write(struct.pack("<I", len(hdr_json)))
                f.write(hdr_json)
                # Price history
                f.write(struct.pack("<I", len(self.price_history)))
                for rec in self.price_history:
                    # Normalize timestamp on save too
                    ts = _normalize_timestamp(rec.timestamp)
                    f.write(struct.pack("<q", ts))
                    f.write(struct.pack("<i", rec.variation_index))
                    f.write(struct.pack("<q", rec.price_hundredths))
                    if len(rec.currency) != 3:
                        raise ValueError(
                            f"currency must be 3 chars, got {rec.currency!r}")
                    f.write(rec.currency[:3].encode("ascii"))
                # Photos
                f.write(struct.pack("<I", len(self.photos)))
                if self.photos:
                    # Offset table
                    current = 0
                    offsets = []
                    for photo in self.photos:
                        offsets.append(current)
                        current += 4 + len(photo)
                    for off in offsets:
                        f.write(struct.pack("<I", off))
                    # Photo data
                    for photo in self.photos:
                        f.write(struct.pack("<I", len(photo)))
                        f.write(photo)

            os.rename(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise

    def add_price(self, record: PriceRecord):
        self.price_history.append(record)

    def add_photo(self, data: bytes):
        if len(self.photos) >= MAX_PHOTOS:
            raise ValueError("max 25 photos per product")
        self.photos.append(data)

    def remove_photo(self, index: int):
        if index < 0 or index >= len(self.photos):
            raise IndexError(
                f"photo index {index} out of range (0-{len(self.photos) - 1})")
        self.photos.pop(index)
