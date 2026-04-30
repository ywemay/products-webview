#!/usr/bin/env bash
# register-linux.sh — Register .prod file association on Linux
# Run after installing or building the app binary.
#
# Usage: ./register-linux.sh /path/to/Products-Linux

set -e

APP_BIN="${1:-}"
if [ -z "$APP_BIN" ]; then
    # Try default location: dist/Products-Linux
    SCRIPT_DIR="$(dirname "$0")"
    APP_BIN="$(realpath "$SCRIPT_DIR/../dist/Products-Linux" 2>/dev/null || true)"
fi

if [ -z "$APP_BIN" ] || [ ! -f "$APP_BIN" ]; then
    echo "❌ App binary not found."
    echo "Usage: $0 /path/to/Products-Linux"
    echo ""
    echo "Tip: Build first with: pyinstaller --onefile --windowed --name Products-Linux app.py"
    exit 1
fi

APP_BIN="$(realpath "$APP_BIN")"
APP_DIR="$(dirname "$APP_BIN")"
PROJECT_DIR="$(realpath "$(dirname "$0")/..")"

# Generate a PNG icon from app.ico if available, or use a fallback
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
mkdir -p "$ICON_DIR"

ICON_PATH="$ICON_DIR/products-editor.png"
if [ -f "$PROJECT_DIR/app.png" ]; then
    cp "$PROJECT_DIR/app.png" "$ICON_PATH"
elif command -v convert &>/dev/null && [ -f "$PROJECT_DIR/app.ico" ]; then
    convert "$PROJECT_DIR/app.ico" "$ICON_PATH"
else
    # Create a simple placeholder icon (colored square with text)
    echo "ℹ️  No icon found — using placeholder. Place app.png in the project root for a custom icon."
fi

# Create .desktop entry
APP_ID="products-editor"

mkdir -p ~/.local/share/applications
mkdir -p ~/.local/share/mime/packages

# MIME type definition
cat > ~/.local/share/mime/packages/application-x-prod.xml << 'XMLEOF'
<?xml version="1.0"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-prod">
    <comment>Product file</comment>
    <glob pattern="*.prod"/>
    <icon name="application-x-prod"/>
  </mime-type>
</mime-info>
XMLEOF

# Desktop entry
cat > ~/.local/share/applications/products-editor.desktop << DESKTOPEOF
[Desktop Entry]
Type=Application
Name=Products Editor
Comment=Edit .prod product files
Exec="$APP_BIN" %f
Icon=${ICON_PATH}
Terminal=false
Categories=Office;Database;
MimeType=application/x-prod;
NoDisplay=false
DESKTOPEOF

# Apply
update-mime-database ~/.local/share/mime 2>/dev/null || true
update-desktop-database ~/.local/share/applications 2>/dev/null || true
xdg-mime default products-editor.desktop application/x-prod 2>/dev/null || true

echo "✅ .prod file association registered for $(whoami)"
echo "   Binary: $APP_BIN"
echo "   Double-click a .prod file to open with Products Editor"
