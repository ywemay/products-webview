#!/usr/bin/env bash
# Run the Company File Manager desktop app
cd "$(dirname "$0")"
LOG="logs/$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs
PIP_BREAK_SYSTEM_PACKAGES=1 python3 -u app.py 2>&1 | tee "$LOG"
echo
echo "Log saved to $LOG"
