"""Company YAML management for product directory subfolders.

Each subdirectory can contain a company.yaml file with:
  company:
    name: str
    address: str
    website: str
    company_type: str  # customer, supplier, shipping_company, bank, post_office, other
    emails: list[str]
    phones: list[str]
  contacts:
    - fn: str          # Full name
      n: str           # Structured name (optional)
      tel: str         # Phone (optional)
      email: str       # Email (optional)
      org: str         # Organization (optional)
      role: str        # Role (optional)
      title: str       # Job title (optional)
      adr: str         # Address (optional)
      note: str        # Note (optional)
      bday: str        # Birthday (optional)
      url: str         # URL (optional)
      categories: str  # Categories (optional)
"""

import os
from typing import Optional

import yaml
from dataclasses import dataclass, field, asdict


CONTACT_FIELDS = ["fn", "n", "tel", "email", "org", "role", "title",
                  "adr", "note", "bday", "url", "categories"]


@dataclass
class Contact:
    fn: str = ""            # Full name
    n: str = ""             # Structured name
    tel: str = ""           # Phone number
    email: str = ""         # Email
    org: str = ""           # Organization
    role: str = ""          # Role
    title: str = ""         # Job title
    adr: str = ""           # Address
    note: str = ""          # Note
    bday: str = ""          # Birthday
    url: str = ""           # URL
    categories: str = ""    # Categories

    @classmethod
    def from_dict(cls, d: dict) -> "Contact":
        return cls(
            fn=d.get("fn", ""),
            n=d.get("n", ""),
            tel=d.get("tel", ""),
            email=d.get("email", ""),
            org=d.get("org", ""),
            role=d.get("role", ""),
            title=d.get("title", ""),
            adr=d.get("adr", ""),
            note=d.get("note", ""),
            bday=d.get("bday", ""),
            url=d.get("url", ""),
            categories=d.get("categories", ""),
        )

    def to_dict(self) -> dict:
        result = {}
        for f in CONTACT_FIELDS:
            val = getattr(self, f, "")
            if val:
                result[f] = val
        return result


class Company:
    """Represents a company.yaml file in a product subdirectory."""

    def __init__(self, directory: str):
        self.directory = directory
        self.name: str = ""
        self.address: str = ""
        self.website: str = ""
        self.company_type: str = ""
        self.emails: list = []
        self.phones: list = []
        self.contacts: list = []

    @classmethod
    def load(cls, directory: str) -> "Company":
        """Load company.yaml from a directory. Returns a Company instance
        with default values if the file doesn't exist."""
        c = cls(directory)
        yaml_path = os.path.join(directory, "company.yaml")
        if os.path.isfile(yaml_path):
            with open(yaml_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            company_data = data.get("company", {})
            c.name = company_data.get("name", "")
            c.address = company_data.get("address", "")
            c.website = company_data.get("website", "")
            c.company_type = company_data.get("company_type", "")
            c.emails = company_data.get("emails", [])
            c.phones = company_data.get("phones", [])
            for cd in data.get("contacts", []):
                c.contacts.append(Contact.from_dict(cd))
        return c

    def save(self):
        """Save the Company data to company.yaml in the directory."""
        os.makedirs(self.directory, exist_ok=True)
        yaml_path = os.path.join(self.directory, "company.yaml")
        company_section = {}
        if self.name:
            company_section["name"] = self.name
        if self.address:
            company_section["address"] = self.address
        if self.website:
            company_section["website"] = self.website
        if self.company_type:
            company_section["company_type"] = self.company_type
        if self.emails:
            company_section["emails"] = self.emails
        if self.phones:
            company_section["phones"] = self.phones

        data = {}
        if company_section:
            data["company"] = company_section
        if self.contacts:
            data["contacts"] = [c.to_dict() for c in self.contacts]

        with open(yaml_path, "w", encoding="utf-8") as f:
            if data:
                yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
            else:
                f.write("# empty\n")

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "address": self.address,
            "website": self.website,
            "company_type": self.company_type,
            "emails": self.emails,
            "phones": self.phones,
            "contacts": [c.to_dict() for c in self.contacts],
            "contactCount": len(self.contacts),
        }
