# Company File Manager

A desktop application for browsing and managing all company business files:
products (.prod), companies (.comp), deals (.deal), and any document files
(PDFs, office docs, text files, etc.).

Think of it as a file manager focused on business data — it shows product
prices, variation groups, photos, company profiles, and deal metadata
alongside regular file browsing.

Built with Python, PyWebView (WebKitGTK), and Bottle HTTP.

## Architecture

- Bottle HTTP server on a random localhost port
- Serves both API endpoints and static HTML/JS/CSS frontend
- PyWebView wraps it in a native window
- All data lives in `.prod` / `.comp` / `.deal` files (no database)

See `../docs/` for architecture and file format details.
