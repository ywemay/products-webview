# Products Manager

Desktop application for managing product data, prices, and photos using the `.prod` binary file format.

Built with **[pywebview](https://github.com/r0x0r/pywebview)** — a lightweight Python wrapper around the OS-native WebView component (WebKitGTK on Linux, WebKit on macOS, Edge WebView2/CEF on Windows).

## Requirements

- **Python 3.10+**
- **Linux:** `python3-gi`, `gir1.2-webkit2-4.1`, `gir1.2-gtk-3.0`
- **macOS:** nothing extra (system WebKit)
- **Windows:** nothing extra (WebView2 or CEF)

## Quick Start

```bash
# Create a virtual environment (recommended)
python3 -m venv venv --system-site-packages  # Linux: need system PyGObject
source venv/bin/activate

# Install dependencies
pip install pywebview

# Run
python3 app.py
```

On Linux, if you get `ModuleNotFoundError: No module named 'gi'`:

```bash
sudo apt install python3-gi gir1.2-webkit2-4.1
# Then recreate venv with --system-site-packages
```

Or just run without venv:

```bash
PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install --user pywebview
python3 app.py
```

## Project Structure

```
products-webview/
├── app.py              # Main entry — Bottle API server + pywebview window
├── prodlib/            # Python .prod file format library
│   ├── core.py         # Binary format read/write (compatible with Go prod library)
│   └── store.py        # High-level CRUD operations
├── frontend/           # Web frontend (HTML + JS + CSS)
│   └── src/
│       ├── app.js      # State management + API client
│       ├── main.js     # UI rendering + event handling
│       └── style.css   # Styles
├── run.sh              # Convenience launcher
├── .github/workflows/  # CI build for Linux, Windows, macOS
└── data/               # Settings persistence (created at runtime)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serves frontend (with API port injected) |
| GET | `/src/<path>` | Static files (JS, CSS) |
| GET | `/api/settings` | Load settings |
| POST | `/api/settings` | Save settings |
| POST | `/api/list-products` | List .prod files in a directory |
| POST | `/api/list-subdirs` | List subdirectories |
| POST | `/api/create-subdir` | Create a subdirectory |
| POST | `/api/open` | Open a .prod file |
| POST | `/api/create` | Create a new .prod file |
| POST | `/api/add-price` | Add a price record |
| POST | `/api/add-photo` | Add a photo (by file path) |
| POST | `/api/upload-photos` | Upload photos (multipart) |
| POST | `/api/remove-photo` | Remove a photo by index |
| POST | `/api/price-history` | Get price history |
| POST | `/api/update-description` | Update product description |
| POST | `/api/pick-directory` | Open native GTK folder picker |
| POST | `/api/pick-photos` | Open native GTK photo picker |
| GET | `/api/health` | Health check |

## Building for Distribution

GitHub Actions builds for all three platforms automatically on push/tag. See `.github/workflows/build.yml`.

### Manual builds

```bash
pip install pyinstaller

# Linux
pyinstaller --onefile --windowed --name "Products-Linux" \
  --add-data "frontend:frontend" \
  --hidden-import prodlib --hidden-import prodlib.core \
  --hidden-import prodlib.store --hidden-import bottle app.py

# Windows (on Windows)
pyinstaller --onefile --windowed --name "Products" ^
  --add-data "frontend;frontend" ^
  --hidden-import prodlib --hidden-import prodlib.core ^
  --hidden-import prodlib.store --hidden-import bottle app.py

# macOS (on macOS)
pyinstaller --onefile --windowed --name "Products" \
  --add-data "frontend:frontend" \
  --hidden-import prodlib --hidden-import prodlib.core \
  --hidden-import prodlib.store --hidden-import bottle app.py
```

## File Format

Uses the `.prod` binary format (v2) — compatible with the Go `products-lib/prod` library:

```
PROD\x02 | header JSON length (u32) | header JSON | 
price count (u32) | price records... | 
photo count (u32) | offset table | photo data...
```

## License

MIT
