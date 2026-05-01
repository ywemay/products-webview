#!/usr/bin/env python3
"""Company File Manager — PyWebView desktop application.

Browse and manage company business files: products (.prod), companies (.comp),
deals (.deal), and any document files (PDFs, office files, text, etc.).

Architecture:
  - A Bottle HTTP server runs on a random localhost port.
    It serves both the API endpoints AND the static frontend files.
  - pywebview creates a native WebKitGTK window pointing at the Bottle server.
  - The frontend communicates with the server via fetch() API calls.
  - All .prod file I/O happens through `prodlib`.
"""

import json
import os
import random
import sys
import threading
import traceback


# ---------------------------------------------------------------------------
# Logging: writes to stderr (captured by run.sh tee to log file)
# ---------------------------------------------------------------------------
def log(msg):
    print(f"[company-file-manager] {msg}", file=sys.stderr, flush=True)


def log_error(msg):
    print(f"[company-file-manager ERROR] {msg}", file=sys.stderr, flush=True)
    traceback.print_exc(file=sys.stderr)

import webview
from bottle import Bottle, response, request, static_file, run as bottle_run

import prodlib.store as store
from prodlib.core import Product
from prodlib.company import Company, Contact

# ---------------------------------------------------------------------------
# Bottle HTTP API (port is set via set_api_port before routes are accessed)
# ---------------------------------------------------------------------------
bottle_app = Bottle()

_api_port = 18000
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")


def set_api_port(p):
    global _api_port
    _api_port = p


def json_ok(data):
    response.content_type = "application/json"
    return json.dumps({"ok": True, "data": data})


def json_err(msg, status=400):
    response.status = status
    response.content_type = "application/json"
    return json.dumps({"error": msg})


# Static files ------------------------------------------------------------
@bottle_app.route("/")
def serve_index():
    with open(os.path.join(FRONTEND_DIR, "index.html"), "r") as f:
        html = f.read()
    inject = (
        f'<script>window.API_PORT = {_api_port};</script>\n'
        f'<script src="src/app.js"></script>'
    )
    html = html.replace('<script src="src/app.js"></script>', inject)
    response.content_type = "text/html"
    return html


@bottle_app.route("/src/<filename:path>")
def serve_static(filename):
    return static_file(filename, root=os.path.join(FRONTEND_DIR, "src"))


# Settings ----------------------------------------------------------------
@bottle_app.get("/api/settings")
def api_get_settings():
    return json_ok(store.get_settings())


@bottle_app.post("/api/settings")
def api_save_settings():
    try:
        data = request.json
    except Exception:
        return json_err("invalid JSON body")
    store.save_settings(data or {})
    return json_ok(None)


# Directory / Navigation --------------------------------------------------
@bottle_app.post("/api/list-products")
def api_list_products():
    body = request.json or {}
    return json_ok(store.list_products(body.get("dir", "")))


@bottle_app.post("/api/list-subdirs")
def api_list_subdirs():
    body = request.json or {}
    return json_ok(store.list_subdirs(body.get("dir", "")))


@bottle_app.post("/api/list-items")
def api_list_items():
    """Return combined list of subdirectories (with .comp file info) and .prod files."""
    body = request.json or {}
    return json_ok(store.list_items(body.get("dir", "")))


@bottle_app.post("/api/create-subdir")
def api_create_subdir():
    body = request.json or {}
    parent = body.get("dir", "")
    name = body.get("name", "")
    if not parent or not name:
        return json_err("dir and name are required")
    try:
        result = store.create_subdir(parent, name)
        return json_ok(result)
    except OSError as e:
        return json_err(str(e))


# Products CRUD -----------------------------------------------------------
@bottle_app.post("/api/open")
def api_open_product():
    body = request.json or {}
    path = body.get("path", "")
    if not path:
        return json_err("path is required")
    try:
        return json_ok(store.open_product(path))
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/create")
def api_create_product():
    body = request.json or {}
    path = body.get("path", "")
    title = body.get("title", "")
    code = body.get("code", "")
    description = body.get("description", "")
    if not path:
        return json_err("path is required")
    try:
        return json_ok(store.create_product(path, title, code, description))
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/add-price")
def api_add_price():
    body = request.json or {}
    path = body.get("path")
    if not path:
        return json_err("path is required")
    try:
        store.add_price(path, body.get("currency", "USD"),
                        body.get("variation", ""), float(body.get("price", 0)))
        return json_ok(None)
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/add-photo")
def api_add_photo():
    body = request.json or {}
    path = body.get("path")
    photo_path = body.get("photoPath")
    if not path or not photo_path:
        return json_err("path and photoPath are required")
    try:
        store.add_photo(path, photo_path)
        return json_ok(None)
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/upload-photos")
def api_upload_photos():
    """Upload photos via multipart form — used by the JS file picker."""
    path = request.forms.get("path")
    if not path:
        return json_err("path is required")
    photos = request.files.getall("photos") or []
    if not photos:
        return json_err("no photos uploaded")
    try:
        for photo in photos:
            data = photo.file.read()
            p = Product.open(path)
            p.add_photo(data)
            p.save(path)
        return json_ok(None)
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/remove-photo")
def api_remove_photo():
    body = request.json or {}
    path = body.get("path")
    index = body.get("index")
    if path is None or index is None:
        return json_err("path and index are required")
    try:
        store.remove_photo(path, int(index))
        return json_ok(None)
    except (ValueError, OSError, IndexError) as e:
        return json_err(str(e))


@bottle_app.post("/api/price-history")
def api_price_history():
    body = request.json or {}
    path = body.get("path", "")
    if not path:
        return json_err("path is required")
    try:
        return json_ok(store.get_price_history(path))
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/save")
def api_save_product():
    """Save product fields (title, code, unit, description, variation_groups)."""
    body = request.json or {}
    path = body.get("path", "")
    if not path:
        return json_err("path is required")
    try:
        result = store.save_product(path, body.get("product", {}))
        result["filepath"] = path
        return json_ok(result)
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/update-description")
def api_update_description():
    body = request.json or {}
    path = body.get("path", "")
    description = body.get("description", "")
    if not path:
        return json_err("path is required")
    try:
        p = Product.open(path)
        p.header.description = description
        p.save(path)
        return json_ok(None)
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/price/edit")
def api_price_edit():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    if not path or index < 0:
        return json_err("path and index are required")
    try:
        store.edit_price(path, index, body.get("price", None), body.get("currency", None))
        return json_ok(store.get_price_history(path))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/price/delete")
def api_price_delete():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    if not path or index < 0:
        return json_err("path and index are required")
    try:
        store.delete_price(path, index)
        return json_ok(store.get_price_history(path))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/photo/export")
def api_photo_export():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    if not path or index < 0:
        return json_err("path and index are required")
    try:
        result = store.export_photo(path, index)
        return json_ok(result)
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/photo/move")
def api_photo_move():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    direction = body.get("direction", 0)
    if not path or index < 0 or direction == 0:
        return json_err("path, index, and direction are required")
    try:
        store.move_photo(path, index, direction)
        return json_ok(store.open_product(path))
    except Exception as e:
        return json_err(str(e))


@bottle_app.get("/api/open-url")
def api_open_url():
    """Open a URL in the default OS browser/mail client."""
    url = request.query.get("url", "")
    if not url:
        return json_err("url is required")
    try:
        import webbrowser
        webbrowser.open(url)
        return json_ok({"opened": True})
    except Exception as e:
        return json_err(str(e))


# File dialog helpers ----------------------------------------------------
# We expose these as methods on the Api class, which pywebview makes
# available to JavaScript as window.pywebview.api.pickDirectory() and
# window.pywebview.api.pickPhotos().
#
# From Python, we use webview.windows[0].create_file_dialog() which
# opens the native GTK dialog on the main thread without deadlocking.


class Api:
    """
    PyWebView JS API — runs on the GTK main thread.
    Methods are called from JS as window.pywebview.api.methodName().
    """

    def pickDirectory(self):
        log("pickDirectory: opening GTK folder chooser via pywebview...")
        import webview
        result = webview.windows[0].create_file_dialog(
            webview.FOLDER_DIALOG
        )
        path = result[0] if result else None
        log(f"pickDirectory: selected '{path}'")
        return path

    def pickPhotos(self):
        log("pickPhotos: opening GTK file chooser via pywebview...")
        import webview
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True
        )
        log(f"pickPhotos: selected {len(result) if result else 0} file(s)")
        return result or []


@bottle_app.post("/api/pick-directory")
def api_pick_directory():
    return json_err("use JS bridge: window.pywebview.api.pickDirectory()")


@bottle_app.post("/api/pick-photos")
def api_pick_photos():
    return json_err("use JS bridge: window.pywebview.api.pickPhotos()")


@bottle_app.post("/api/delete-products")
def api_delete_products():
    """Delete multiple .prod files."""
    body = request.json or {}
    paths = body.get("paths", [])
    if not paths:
        return json_err("paths is required")
    deleted = []
    errors = []
    for p in paths:
        try:
            os.remove(p)
            deleted.append(p)
        except OSError as e:
            errors.append({"path": p, "error": str(e)})
    return json_ok({"deleted": deleted, "errors": errors})


@bottle_app.post("/api/copy-products")
def api_copy_products():
    """Copy .prod files (and their sidecar images) to a target directory."""
    body = request.json or {}
    paths = body.get("paths", [])
    target_dir = body.get("targetDir", "")
    if not paths or not target_dir:
        return json_err("paths and targetDir are required")
    copied = []
    errors = []
    os.makedirs(target_dir, exist_ok=True)
    for src in paths:
        try:
            name = os.path.basename(src)
            dst = os.path.join(target_dir, name)
            import shutil
            shutil.copy2(src, dst)
            copied.append(dst)
        except OSError as e:
            errors.append({"path": src, "error": str(e)})
    return json_ok({"copied": copied, "errors": errors})


@bottle_app.post("/api/move-products")
def api_move_products():
    """Move .prod files to a target directory."""
    body = request.json or {}
    paths = body.get("paths", [])
    target_dir = body.get("targetDir", "")
    if not paths or not target_dir:
        return json_err("paths and targetDir are required")
    moved = []
    errors = []
    os.makedirs(target_dir, exist_ok=True)
    for src in paths:
        try:
            name = os.path.basename(src)
            dst = os.path.join(target_dir, name)
            import shutil
            shutil.move(src, dst)
            moved.append(dst)
        except OSError as e:
            errors.append({"path": src, "error": str(e)})
    return json_ok({"moved": moved, "errors": errors})


@bottle_app.post("/api/log-client-error")
def api_log_client_error():
    """Receive JavaScript errors from the frontend and log them."""
    try:
        data = request.json
        log(f"[CLIENT {data.get('level', 'log')}] {data.get('msg', '')}")
        if data.get('stack'):
            log(f"  stack: {data['stack']}")
    except Exception:
        pass
    return json_ok(None)


@bottle_app.get("/api/health")
def api_health():
    return json_ok("ok")


# Company CRUD -----------------------------------------------------------
@bottle_app.post("/api/company")
def api_get_company():
    """GET .comp file data from a directory."""
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        c = Company.load(directory)
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/company/save")
def api_save_company():
    """Save .comp file to a directory."""
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        company_data = body.get("company", {})
        c = Company(directory)
        c.name = company_data.get("name", "")
        c.address = company_data.get("address", "")
        c.website = company_data.get("website", "")
        c.company_type = company_data.get("company_type", "")
        c.emails = company_data.get("emails", [])
        c.phones = company_data.get("phones", [])
        for cd in company_data.get("contacts", []):
            c.contacts.append(Contact.from_dict(cd))
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


# Contact CRUD -----------------------------------------------------------
@bottle_app.post("/api/company/contact/add")
def api_add_contact():
    """Add a contact to a .comp file."""
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        c = Company.load(directory)
        contact_data = body.get("contact", {})
        contact = Contact.from_dict(contact_data)
        c.contacts.append(contact)
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/company/contact/update")
def api_update_contact():
    """Update a contact by index in a .comp file."""
    body = request.json or {}
    directory = body.get("dir", "")
    index = body.get("index")
    if not directory or index is None:
        return json_err("dir and index are required")
    try:
        c = Company.load(directory)
        idx = int(index)
        if idx < 0 or idx >= len(c.contacts):
            return json_err(f"contact index {idx} out of range")
        contact_data = body.get("contact", {})
        c.contacts[idx] = Contact.from_dict(contact_data)
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/company/contact/delete")
def api_delete_contact():
    """Delete a contact by index from a .comp file."""
    body = request.json or {}
    directory = body.get("dir", "")
    index = body.get("index")
    if not directory or index is None:
        return json_err("dir and index are required")
    try:
        c = Company.load(directory)
        idx = int(index)
        if idx < 0 or idx >= len(c.contacts):
            return json_err(f"contact index {idx} out of range")
        c.contacts.pop(idx)
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


# Deals CRUD -------------------------------------------------------------
@bottle_app.post("/api/open-system")
def api_open_system():
    """Open a file with the system default handler (xdg-open)."""
    body = request.json or {}
    path = body.get("path", "")
    log(f"open-system called with path: {path}")
    if not path:
        return json_err("path is required")
    try:
        import subprocess
        import platform
        system = platform.system()
        if system == "Darwin":
            subprocess.Popen(["open", path])
        elif system == "Windows":
            os.startfile(path)
        else:
            subprocess.Popen(["xdg-open", path])
        return json_ok({"opened": True})
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/deals/list")
def api_list_deals():
    """List all deals in a company directory's Deals subdirectory."""
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        return json_ok(store.list_deals(directory))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/deals/get")
def api_get_deal():
    """Get a single deal by filename."""
    body = request.json or {}
    directory = body.get("dir", "")
    filename = body.get("filename", "")
    if not directory or not filename:
        return json_err("dir and filename are required")
    try:
        return json_ok(store.get_deal(directory, filename))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/deals/save")
def api_save_deal():
    """Create or update a deal."""
    body = request.json or {}
    directory = body.get("dir", "")
    deal_data = body.get("deal", {})
    if not directory:
        return json_err("dir is required")
    try:
        return json_ok(store.save_deal(directory, deal_data))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/deals/delete")
def api_delete_deal():
    """Delete a deal by filename."""
    body = request.json or {}
    directory = body.get("dir", "")
    filename = body.get("filename", "")
    if not directory or not filename:
        return json_err("dir and filename are required")
    try:
        store.delete_deal(directory, filename)
        return json_ok(None)
    except Exception as e:
        return json_err(str(e))


# ---------------------------------------------------------------------------
# PyWebView entry point
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# CORS hook — ensure no cross-origin issues
# ---------------------------------------------------------------------------
@bottle_app.hook('after_request')
def enable_cors():
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'


@bottle_app.route('/api/<:re:.*>', method='OPTIONS')
def handle_options():
    return


def start_server(port: int):
    """Run the Bottle server on a background thread."""
    bottle_run(bottle_app, host="127.0.0.1", port=port, quiet=True)


def main():
    port = random.randint(18000, 18999)
    log(f"Starting server on 127.0.0.1:{port}")
    set_api_port(port)

    # Start HTTP server in background
    server_thread = threading.Thread(target=start_server, args=(port,), daemon=True)
    server_thread.start()
    log("Server thread started")

    # Create the WebView window with a JS API object for file dialogs
    api = Api()
    log("Creating WebView window...")
    webview.create_window(
        "Company File Manager",
        url=f"http://127.0.0.1:{port}/",
        width=1024,
        height=768,
        resizable=True,
        js_api=api,
    )

    # Start the GUI loop (blocks until window is closed)
    log("Starting GTK main loop...")
    webview.start(gui="gtk", private_mode=False)
    log("Application closed.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log_error("Fatal crash in main()")
        sys.exit(1)
