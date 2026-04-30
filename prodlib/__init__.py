"""prodlib - Python implementation of the .prod binary file format v2.

Mirrors the Go implementation in products-lib/prod/.
"""

from .core import Product, Header
from .company import Company, Contact
from .store import list_items, get_price_history

