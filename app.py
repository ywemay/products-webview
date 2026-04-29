#!/usr/bin/env python3
"""Products Manager — PyWebView desktop application.

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
    print(f"[products-webview] {msg}", file=sys.stderr, flush=True)


def log_error(msg):
    print(f"[products-webview ERROR] {msg}", file=sys.stderr, flush=True)
    traceback.print_exc(file=sys.stderr)

import webview
from bottle import Bottle, response, request, static_file, run as bottle_run

import prodlib.store as store
from prodlib.core import Product

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


# File dialog helpers ----------------------------------------------------
# The JS frontend calls window.pywebview.api.pickDirectory() / pickPhotos()
# directly. These methods run on the GTK main thread and are safe to call.
# The HTTP routes (/api/pick-directory, /api/pick-photos) still exist as
# fallbacks but are not the primary path.


class Api:
    """PyWebView JS API — runs on the GTK main thread."""

    def pickDirectory(self):
        log("pickDirectory: opening GTK folder chooser...")
        try:
            import gi
            gi.require_version('Gtk', '3.0')
            from gi.repository import Gtk
            dialog = Gtk.FileChooserDialog(
                title="Choose a directory",
                action=Gtk.FileChooserAction.SELECT_FOLDER,
            )
            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
            dialog.add_button("Open", Gtk.ResponseType.OK)
            result = dialog.run()
            path = None
            if result == Gtk.ResponseType.OK:
                path = dialog.get_filename()
                log(f"pickDirectory: user selected {path}")
            else:
                log("pickDirectory: user cancelled")
            dialog.destroy()
            return path
        except Exception as e:
            log_error(f"pickDirectory failed: {e}")
            raise

    def pickPhotos(self):
        log("pickPhotos: opening GTK file chooser...")
        try:
            import gi
            gi.require_version('Gtk', '3.0')
            from gi.repository import Gtk
            dialog = Gtk.FileChooserDialog(
                title="Select photos",
                action=Gtk.FileChooserAction.OPEN,
            )
            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
            dialog.add_button("Open", Gtk.ResponseType.OK)
            dialog.set_select_multiple(True)
            filt = Gtk.FileFilter()
            filt.set_name("Images")
            filt.add_mime_type("image/jpeg")
            filt.add_mime_type("image/png")
            filt.add_mime_type("image/webp")
            dialog.add_filter(filt)
            dialog.add_shortcut_folder(os.path.expanduser("~/Pictures"))
            result = dialog.run()
            paths = []
            if result == Gtk.ResponseType.OK:
                paths = dialog.get_filenames()
                log(f"pickPhotos: user selected {len(paths)} file(s)")
            else:
                log("pickPhotos: user cancelled")
            dialog.destroy()
            return paths
        except Exception as e:
            log_error(f"pickPhotos failed: {e}")
            raise


@bottle_app.post("/api/pick-directory")
def api_pick_directory():
    return json_err("pywebview API not available")


@bottle_app.post("/api/pick-photos")
def api_pick_photos():
    return json_err("pywebview API not available")


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


@bottle_app.get("/api/health")
def api_health():
    return json_ok("ok")


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

    # Create the WebView window with a JS API object
    api = Api()
    log("Creating WebView window...")
    webview.create_window(
        "Products Manager",
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
