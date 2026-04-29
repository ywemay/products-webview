#!/usr/bin/env bash
# Run the Products Manager desktop app
cd "$(dirname "$0")"
PIP_BREAK_SYSTEM_PACKAGES=1 python3 app.py
