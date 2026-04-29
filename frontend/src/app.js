// Simple state management — no framework.
const app = {
    state: {
        currentDir: '',
        defaultDir: '',
        files: [],
        subdirs: [],
        selectedFile: '',
        product: null,
        activeTab: 'photos',
        priceHistory: [],
        settings: {
            company: '',
            currency: 'USD',
            defaultDir: ''
        },
        showSettings: false,
        showStartupDialog: false,
        showCreateDirDialog: false,
        loading: false,
        error: '',
        success: '',
        fullscreenPhoto: null,
        selectedFiles: [],
        selectMode: false,
    },

    setState(updates) {
        Object.assign(this.state, updates);
        render();
    },

    getState() {
        return this.state;
    }
};

// API base URL — the Bottle server runs on 127.0.0.1:<port>
// window.API_PORT is injected by the Python app
const API_PORT = window.API_PORT || 18520;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

async function apiCall(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data;
}

async function apiUpload(path, file) {
    const formData = new FormData();
    formData.append('path', path);
    formData.append('photos', file);
    const res = await fetch(`${API_BASE}/api/upload-photos`, {
        method: 'POST',
        body: formData,
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data;
}

// PyWebView JS API — runs on main thread, safe for GTK dialogs
function callDialogApi(method) {
    // Direct pywebview JS API call (runs on GTK thread — no deadlock)
    if (window.pywebview && window.pywebview.api && typeof window.pywebview.api[method] === 'function') {
        return window.pywebview.api[method]();
    }
    // Fallback: HTTP-based GTK picker (may deadlock on some setups)
    return apiCall('POST', '/api/' + method.replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); }));
}

const api = {
    getSettings:          () => apiCall('GET',  '/api/settings'),
    saveSettings:         (s) => apiCall('POST', '/api/settings', s),
    openProduct:          (p) => apiCall('POST', '/api/open',        { path: p }),
    createProduct:        (path, title, code, desc) =>
                               apiCall('POST', '/api/create',
                                       { path, title, code, description: desc || '' }),
    listProducts:         (d) => apiCall('POST', '/api/list-products', { dir: d }),
    listSubdirs:          (d) => apiCall('POST', '/api/list-subdirs',  { dir: d }),
    createSubdir:         (d, n) => apiCall('POST', '/api/create-subdir', { dir: d, name: n }),
    addPrice:             (path, currency, variation, price) =>
                               apiCall('POST', '/api/add-price',
                                       { path, currency, variation, price }),
    addPhoto:             (path, photoPath) =>
                               apiCall('POST', '/api/add-photo', { path, photoPath }),
    uploadPhotos:         (path, file) => apiUpload(path, file),
    removePhoto:          (path, idx) => apiCall('POST', '/api/remove-photo', { path, index: idx }),
    getPriceHistory:      (p) => apiCall('POST', '/api/price-history', { path: p }),
    updateDescription:    (path, desc) =>
                               apiCall('POST', '/api/update-description',
                                       { path, description: desc }),
    deleteProducts:        (paths) => apiCall('POST', '/api/delete-products', { paths }),
    pickDirectory:        () => callDialogApi('pickDirectory'),
    pickPhotos:           () => callDialogApi('pickPhotos'),
};

// Backward compat shim for main.js code that references window.go
window.go = { main: { App: {} } };
const shimMap = {
    GetSettings:       'getSettings',
    SaveSettings:      'saveSettings',
    OpenProduct:       'openProduct',
    CreateProduct:     'createProduct',
    ListProducts:      'listProducts',
    ListSubdirs:       'listSubdirs',
    CreateSubdir:      'createSubdir',
    AddPrice:          'addPrice',
    AddPhoto:          'addPhoto',
    RemovePhoto:       'removePhoto',
    GetPriceHistory:   'getPriceHistory',
};
for (const [goName, apiName] of Object.entries(shimMap)) {
    if (api[apiName]) {
        window.go.main.App[goName] = api[apiName];
    }
}
