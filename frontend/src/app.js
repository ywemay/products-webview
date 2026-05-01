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
        lastSelectedIndex: -1,
        clipboard: null,  // { action: 'copy'|'cut', files: [...] }
        searchQuery: '',
        searchResults: null, // null = not searching, [] = no results, [items] = results
        dealFiles: [],
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

// PyWebView JS API bridge — run GTK dialogs on the main thread.
// window.pywebview.api.pickDirectory() and pickPhotos() are exposed
// by the Api class in app.py. They return Promises.
function callDialogApi(method) {
    if (window.pywebview && window.pywebview.api && typeof window.pywebview.api[method] === 'function') {
        console.log('[app] Calling pywebview.api.' + method + '()');
        return window.pywebview.api[method]();
    }
    // Fallback: HTTP-based GTK picker
    console.warn('[app] pywebview.api.' + method + ' not available, using HTTP fallback');
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
    saveProduct:           (path, product) => apiCall('POST', '/api/save', { path, product }),
    editPrice:             (path, index, price, currency) =>
                               apiCall('POST', '/api/price/edit',
                                       { path, index, price, currency }),
    deletePrice:           (path, index) => apiCall('POST', '/api/price/delete', { path, index }),
    exportPhoto:           (path, index) => apiCall('POST', '/api/photo/export', { path, index }),
    movePhoto:             (path, index, direction) =>
                               apiCall('POST', '/api/photo/move',
                                       { path, index, direction }),
    openUrl:               (url) => apiCall('GET', '/api/open-url?url=' + encodeURIComponent(url)),
    deleteProducts:        (paths) => apiCall('POST', '/api/delete-products', { paths }),
    copyProducts:          (paths, targetDir) => apiCall('POST', '/api/copy-products', { paths, targetDir }),
    moveProducts:          (paths, targetDir) => apiCall('POST', '/api/move-products', { paths, targetDir }),
    listItems:             (d) => apiCall('POST', '/api/list-items', { dir: d }),
    getCompany:            (d) => apiCall('POST', '/api/company', { dir: d }),
    saveCompany:           (d, company) => apiCall('POST', '/api/company/save', { dir: d, company }),
    addContact:            (d, contact) => apiCall('POST', '/api/company/contact/add', { dir: d, contact }),
    updateContact:         (d, index, contact) => apiCall('POST', '/api/company/contact/update', { dir: d, contact, index }),
    deleteContact:         (d, index) => apiCall('POST', '/api/company/contact/delete', { dir: d, index }),
    listDeals:             (d) => apiCall('POST', '/api/deals/list', { dir: d }),
    getDeal:               (d, f) => apiCall('POST', '/api/deals/get', { dir: d, filename: f }),
    saveDeal:              (d, deal) => apiCall('POST', '/api/deals/save', { dir: d, deal }),
    deleteDeal:            (d, f) => apiCall('POST', '/api/deals/delete', { dir: d, filename: f }),
    openSystem:           (path) => apiCall('POST', '/api/open-system', { path: path }),
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
