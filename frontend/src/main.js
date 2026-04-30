/* Products Wails App v2.5 — Frontend logic
 * Gallery view + 3-tab editor (Photos, Variations, Prices)
 * Extended price fields stored in localStorage (v2.5 frontend-only)
 * Variations stored in localStorage (awaiting backend endpoint for persistence)
 */

function init() {
    render();
    bindEvents();

    // Load settings (includes saved defaultDir on server side)
    loadSettings().then(function() {
        var s = app.getState();
        var savedDir = s.settings.defaultDir || '';
        if (savedDir) {
            // User already chose a directory — auto-open it
            app.setState({ defaultDir: savedDir });
            setTimeout(function() {
                loadDirectory(savedDir);
            }, 100);
        } else {
            // First launch — show the startup dialog
            app.setState({ showStartupDialog: true });
        }
    });
}

// ========== LOCALSTORAGE HELPERS ==========

function getPriceExtrasKey(productUuid, timestamp) {
    return `price-extras-${productUuid}-${timestamp}`;
}

function getVariationsKey(productUuid) {
    return `product-variations-${productUuid}`;
}

function loadLocalVariations(productUuid) {
    if (!productUuid) return null;
    const val = localStorage.getItem(getVariationsKey(productUuid));
    return val ? JSON.parse(val) : null;
}

function saveLocalVariations(productUuid, variations) {
    if (!productUuid) return;
    localStorage.setItem(getVariationsKey(productUuid), JSON.stringify({
        variations: variations,
        savedAt: Date.now()
    }));
}

function loadLocalPriceExtras(productUuid, timestamp) {
    const val = localStorage.getItem(getPriceExtrasKey(productUuid, timestamp));
    return val ? JSON.parse(val) : null;
}

function saveLocalPriceExtras(productUuid, timestamp, extras) {
    localStorage.setItem(getPriceExtrasKey(productUuid, timestamp), JSON.stringify(extras));
}

function removeLocalPriceExtras(productUuid, timestamp) {
    localStorage.removeItem(getPriceExtrasKey(productUuid, timestamp));
}

// ========== STARTUP DIALOG ==========

function renderStartupDialog() {
    const s = app.getState();
    const overlay = document.getElementById('startup-overlay');
    overlay.classList.toggle('open', s.showStartupDialog);

    if (s.showStartupDialog) {
        document.getElementById('startup-dir-input').value = s.defaultDir || '';
        document.getElementById('startup-dir-prompt').textContent =
            'Set your products directory to get started.';
    }
}

// ========== CREATE DIR DIALOG ==========

function renderCreateDirDialog() {
    const s = app.getState();
    const overlay = document.getElementById('createdir-overlay');
    overlay.classList.toggle('open', s.showCreateDirDialog);

    if (s.showCreateDirDialog) {
        document.getElementById('createdir-name-input').value = '';
        document.getElementById('createdir-name-input').focus();
    }
}

// ========== SETTINGS ==========

async function loadSettings() {
    try {
        const settings = await api.getSettings();
        app.setState({ settings });
    } catch (err) {
        console.warn('Failed to load settings:', err);
    }
}

// ========== COMPANY EDITOR STATE ==========

var companyEditorState = {
    directory: '',
    company: null
};

// ========== RENDER ==========

function render() {
    renderHeader();
    renderSettingsModal();
    renderStartupDialog();
    renderCreateDirDialog();
    renderSidebar();
    renderContent();
    renderMessages();
    renderPhotoOverlay();
    renderSelectionState();
}

function renderSelectionState() {
    const s = app.getState();
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    // Toggle selected class on cards
    const cards = grid.querySelectorAll('.product-card');
    for (const card of cards) {
        const file = card.dataset.file;
        if (s.selectedFiles.indexOf(file) !== -1) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    }

    // Update header for select mode
    const header = document.getElementById('gallery-header');
    if (header) {
        if (s.selectMode) {
            header.classList.add('select-mode');
            const countEl = header.querySelector('.selection-count');
            if (countEl) countEl.textContent = s.selectedFiles.length + ' selected';
        } else {
            header.classList.remove('select-mode');
        }
    }
}

function renderHeader() {
    const s = app.getState();
    const header = document.getElementById('header');
    header.querySelector('.logo').textContent = '📦 Products';

    const companySpan = header.querySelector('.company-display');
    if (companySpan) {
        companySpan.textContent = s.settings.company ? '🏢 ' + s.settings.company : '';
    }
}

function renderSettingsModal() {
    const s = app.getState();
    const overlay = document.getElementById('settings-overlay');
    overlay.classList.toggle('open', s.showSettings);

    if (s.showSettings) {
        document.getElementById('settings-company').value = s.settings.company || '';
        document.getElementById('settings-currency').value = s.settings.currency || 'USD';
        document.getElementById('settings-products-dir').value = s.defaultDir || '';
    }
}

function renderSidebar() {
    const s = app.getState();
    const list = document.getElementById('file-list');
    const dirDisplay = document.getElementById('current-dir');
    const dirLabel = document.getElementById('dir-label');

    if (s.currentDir) {
        var parts = s.currentDir.replace(/\/+$/, '').split('/');
        dirLabel.textContent = '📁 ' + (parts.pop() || s.currentDir);
        dirDisplay.textContent = s.currentDir;
        dirDisplay.style.display = 'block';
    } else {
        dirLabel.textContent = 'No directory selected';
        dirDisplay.style.display = 'none';
    }

    // Update sidebar header buttons
    var changeDirBtn = document.getElementById('sidebar-change-dir');
    if (changeDirBtn) {
        changeDirBtn.style.display = s.currentDir ? '' : 'none';
    }
    var upDirBtn = document.getElementById('sidebar-up-dir');
    if (upDirBtn) {
        upDirBtn.style.display = s.currentDir ? '' : 'none';
    }

    if (s.loading) {
        list.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
        return;
    }

    if (!s.currentDir) {
        list.innerHTML = '<div class="empty-tab">Open a directory to browse products</div>';
        return;
    }

    var html = '';

    // Parent directory link (if not at root)
    var parentDir = getParentDir(s.currentDir);
    if (parentDir) {
        html += '<div class="file-item folder-item" data-subdir=".." title="Go up">' +
            '<span class="icon">🔝</span>' +
            '<span class="name" style="color:var(--text-muted)">..</span>' +
            '</div>';
    }

    // Subdirectories section
    if (s.subdirs && s.subdirs.length > 0) {
        html += '<div class="sidebar-section-title">Folders</div>';
        s.subdirs.forEach(function(item) {
            var sub = item.name ? item.name : item;
            var companyInfo = item.company || null;
            
            html += '<div class="file-item folder-item" data-subdir="' + escapeHtml(sub) + '" title="' + escapeHtml(s.currentDir + '/' + sub) + '">' +
                '<span class="icon">📁</span>' +
                '<div class="folder-info">' +
                '<span class="name">' + escapeHtml(sub) + '</span>';
            
            if (companyInfo && companyInfo.name) {
                var addrTrunc = companyInfo.address ? (companyInfo.address.length > 30 ? companyInfo.address.substring(0, 30) + '…' : companyInfo.address) : '';
                html += '<span class="company-meta">' +
                    escapeHtml(companyInfo.name) +
                    (addrTrunc ? ', ' + escapeHtml(addrTrunc) : '') +
                    (companyInfo.contactCount > 0 ? ' · ' + companyInfo.contactCount + ' contacts' : '') +
                    '</span>';
            }
            
            html += '</div>' +
                '<span class="folder-item-actions">' +
                '<button class="btn btn-xs" data-action="edit-folder-company" data-subdir="' + escapeHtml(sub) + '" title="Edit company">✏️</button>' +
                '</span>' +
                '</div>';
        });
    }

    // Create folder button
    html += '<div class="file-item create-folder-item" data-action="create-dir">' +
        '<span class="icon" style="opacity:0.5">➕</span>' +
        '<span class="name" style="color:var(--text-muted);font-style:italic">New Folder</span>' +
        '</div>';
    html += '<div class="sidebar-separator"></div>';

    // Products section
    html += '<div class="sidebar-section-title">Products</div>';

    if (s.files.length === 0) {
        html += '<div class="empty-tab">No .prod files found</div>';
    } else {
        s.files.forEach(function(f) {
            var name = f.split('/').pop();
            var isSelected = f === s.selectedFile;
            html += '<div class="file-item ' + (isSelected ? 'selected' : '') + '" data-file="' + escapeHtml(f) + '">' +
                '<span class="icon">📄</span>' +
                '<span class="name">' + escapeHtml(name) + '</span>' +
                '<span class="file-item-actions" style="margin-left:auto;display:none">' +
                '<button class="btn btn-xs btn-danger" data-action="sidebar-delete" data-file="' + escapeHtml(f) + '">✕</button>' +
                '</span></div>';
        });
    }

    list.innerHTML = html;
    updateCompanyBar();
}

function toggleFileSelection(file, shiftKey, ctrlKey) {
    const s = app.getState();
    let sel = [...s.selectedFiles];
    var lastIdx = s.lastSelectedIndex;

    // Find index of clicked file in the full file list
    var clickedIdx = -1;
    for (var i = 0; i < s.files.length; i++) {
        if (s.files[i] === file) {
            clickedIdx = i;
            break;
        }
    }

    if (shiftKey && lastIdx >= 0 && clickedIdx >= 0) {
        // Range selection: select all files between lastSelectedIndex and clickedIdx
        var startIdx = Math.min(lastIdx, clickedIdx);
        var endIdx = Math.max(lastIdx, clickedIdx);
        for (var i = startIdx; i <= endIdx; i++) {
            var f = s.files[i];
            if (sel.indexOf(f) === -1) {
                sel.push(f);
            }
        }
        app.setState({
            selectedFiles: sel,
            selectMode: sel.length > 0,
            lastSelectedIndex: lastIdx,
        });
        return;
    }

    if (ctrlKey) {
        const idx = sel.indexOf(file);
        if (idx !== -1) {
            sel.splice(idx, 1);
        } else {
            sel.push(file);
        }
        app.setState({
            selectedFiles: sel,
            selectMode: sel.length > 0,
            lastSelectedIndex: clickedIdx >= 0 ? clickedIdx : lastIdx,
        });
        return;
    }

    // Single click — clear others, select this one
    if (sel.length === 1 && sel[0] === file) {
        sel = [];
    } else {
        sel = [file];
    }
    app.setState({
        selectedFiles: sel,
        selectMode: sel.length > 0,
        lastSelectedIndex: clickedIdx >= 0 ? clickedIdx : -1,
    });
}

function renderContent() {
    const s = app.getState();
    const emptyState = document.getElementById('empty-state');
    const galleryView = document.getElementById('gallery-view');
    const detailHeader = document.getElementById('detail-header');
    const tabs = document.getElementById('tabs');
    const tabContent = document.getElementById('tab-content');
    const editorNav = document.getElementById('editor-nav');

    if (!s.currentDir) {
        // No directory — show empty state
        emptyState.style.display = 'flex';
        galleryView.style.display = 'none';
        detailHeader.style.display = 'none';
        tabs.style.display = 'none';
        tabContent.innerHTML = '';
        tabContent.style.display = 'none';
        editorNav.style.display = 'none';
        return;
    }

    // Hide product editor UI (now uses external editor)
    detailHeader.style.display = 'none';
    tabs.style.display = 'none';
    tabContent.innerHTML = '';
    tabContent.style.display = 'none';
    editorNav.style.display = 'none';

    if (companyEditorState.directory) {
        // Company editor mode
        emptyState.style.display = 'none';
        galleryView.style.display = 'none';
        detailHeader.style.display = 'none';
        tabs.style.display = 'none';
        tabContent.style.display = 'block';
        editorNav.style.display = 'flex';
        renderCompanyEditor(tabContent);
    } else {
        // Gallery mode (directory open, no product selected)
        emptyState.style.display = 'none';
        galleryView.style.display = 'flex';
        detailHeader.style.display = 'none';
        tabs.style.display = 'none';
        tabContent.innerHTML = '';
        tabContent.style.display = 'none';
        editorNav.style.display = 'none';
        renderGallery();
    }
    // Update company bar visibility
    updateCompanyBar();
}

function renderDetailHeader() {
    const s = app.getState();
    const p = s.product;
    const header = document.getElementById('detail-header');

    header.innerHTML = `
        <h2>${escapeHtml(p.title)}</h2>
        <div class="meta">
            <span><span class="label">Code:</span> ${escapeHtml(p.code)}</span>
            <span><span class="label">UUID:</span> ${escapeHtml(p.uuid)}</span>
            <span><span class="label">Photos:</span> ${p.photoCount}/25</span>
            <span><span class="label">Prices:</span> ${p.priceCount}</span>
        </div>
    `;
}

function renderTabs() {
    const s = app.getState();
    const tabsEl = document.getElementById('tabs');
    tabsEl.innerHTML = `
        <button class="tab-btn ${s.activeTab === 'photos' ? 'active' : ''}" data-tab="photos">🖼️ Photos</button>
        <button class="tab-btn ${s.activeTab === 'variations' ? 'active' : ''}" data-tab="variations">🏷️ Variations</button>
        <button class="tab-btn ${s.activeTab === 'prices' ? 'active' : ''}" data-tab="prices">💲 Prices</button>
        <button class="tab-btn ${s.activeTab === 'description' ? 'active' : ''}" data-tab="description">📝 Description</button>
    `;
}

function renderEditorTabContent() {
    const s = app.getState();
    const container = document.getElementById('tab-content');

    if (s.activeTab === 'photos') {
        renderPhotosTab(container);
    } else if (s.activeTab === 'variations') {
        renderVariationsTab(container);
    } else if (s.activeTab === 'prices') {
        renderPricesTab(container);
    } else if (s.activeTab === 'description') {
        renderDescriptionTab(container);
    }
}

// ========== PHOTOS TAB ==========

function renderPhotosTab(container) {
    const s = app.getState();
    const p = s.product;

    let html = '<div class="photo-grid">';

    if (p.photos && p.photos.length > 0) {
        p.photos.forEach((photo, idx) => {
            html += `<div class="photo-item" data-photo-index="${idx}">
                <img src="${photo}" alt="Photo ${idx + 1}" loading="lazy">
                <button class="remove-btn" data-action="remove-photo" data-index="${idx}" title="Remove photo">✕</button>
            </div>`;
        });
    }

    html += '</div>';

    if (p.photoCount < 25) {
        var slotsLeft = 25 - p.photoCount;
        html += `
            <div class="form-row">
                <div class="form-group" style="flex:3">
                    <label>Add Photos (${slotsLeft} slots left)</label>
                    <input type="file" id="photo-file-input" accept="image/jpeg,image/png" multiple />
                </div>
                <button class="btn btn-primary" id="add-photo-btn">➕ Upload</button>
            </div>
        `;
    }

    if (!p.photos || p.photos.length === 0) {
        html += '<div class="empty-tab">No photos yet. Add one above.</div>';
    }

    container.innerHTML = html;
}

// ========== VARIATIONS TAB ==========

function renderVariationsTab(container) {
    const s = app.getState();
    const p = s.product;

    const localVars = loadLocalVariations(p.uuid);
    const variations = localVars ? localVars.variations : (p.variations || []);
    const hasLocal = localVars !== null;
    const hasBackendVars = p.variations && p.variations.length > 0;

    let html = '';

    if (hasLocal) {
        html += `<div class="variation-hint" style="border-color:rgba(249,226,175,0.3);background:rgba(249,226,175,0.08);">
            📝 Variations are stored locally in this browser. They will be overwritten if you re-open the product.
        </div>`;
    } else if (!hasBackendVars) {
        html += `<div class="variation-hint" style="border-color:rgba(166,227,161,0.2);background:rgba(166,227,161,0.08);">
            💡 Variations help organize different product variants (e.g. size, color, weight).
            Add your first variation below.
        </div>`;
    }

    html += '<div class="section-header" style="margin-top:12px">Current Variations</div>';

    if (variations.length === 0) {
        html += '<div class="empty-tab" style="padding:16px">No variations defined yet.</div>';
    } else {
        html += '<div id="variations-list">';
        variations.forEach((v, idx) => {
            html += `<div class="variation-item" data-variation-idx="${idx}">
                <span class="variation-name">🏷️ ${escapeHtml(v)}</span>
                <button class="variation-remove" data-action="remove-variation" data-variation-idx="${idx}" title="Remove variation">✕</button>
            </div>`;
        });
        html += '</div>';
    }

    html += `
        <div class="variation-add-row">
            <input type="text" id="new-variation-input" placeholder="e.g. Small, Red, 500ml..." />
            <button class="btn btn-primary" id="add-variation-btn">➕ Add</button>
        </div>
    `;

    container.innerHTML = html;
}

// ========== PRICES TAB ==========

function renderPricesTab(container) {
    const s = app.getState();
    const p = s.product;

    const localVars = loadLocalVariations(p.uuid);
    const variations = localVars ? localVars.variations : (p.variations || []);
    const hasLocalVars = localVars !== null;

    // Add price form
    let html = `
        <div class="section-header">Add Price</div>
        <div class="form-row-compact">
            <div class="form-group form-group-small">
                <label>Price</label>
                <input type="number" step="0.01" min="0" id="price-input" placeholder="19.99" />
            </div>
            <div class="form-group form-group-small">
                <label>Currency</label>
                <input type="text" id="currency-input" maxlength="3" placeholder="USD" value="${escapeHtml(s.settings.currency || 'USD')}" />
            </div>
            <div class="form-group">
                <label>Variation</label>
                <select id="variation-select">
                    <option value="">— None —</option>
                    ${variations.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
                </select>
            </div>
    `;

    // Extended price fields
    html += `
            <div class="form-group form-group-small">
                <label>Package</label>
                <select id="price-package-type">
                    <option value="">—</option>
                    <option value="carton">Carton</option>
                    <option value="box">Box</option>
                    <option value="pallet">Pallet</option>
                    <option value="bag">Bag</option>
                    <option value="unit">Unit</option>
                    <option value="blister-pack">Blister Pack</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="form-group form-group-small">
                <label>Inner Pkg Ct</label>
                <input type="number" min="0" id="price-inner-count" placeholder="0" value="0" />
            </div>
            <div class="form-group form-group-small">
                <label>In/Out Ct</label>
                <input type="number" min="0" id="price-inner-outer-count" placeholder="0" value="0" />
            </div>
        </div>
        <div class="form-row-compact">
            <div class="form-group" style="flex:1">
                <label>Notes</label>
                <input type="text" id="price-notes" placeholder="e.g. Bulk discount, seasonal pricing..." />
            </div>
            <button class="btn btn-primary" id="add-price-btn" style="margin-bottom:0;align-self:end">➕ Add Price</button>
        </div>
    `;

    if (hasLocalVars) {
        html += `<div class="variation-hint" style="margin-bottom:12px">
            📝 Variations loaded from local storage. Changes to variations are not persisted to the .prod file.
        </div>`;
    }

    // Price history table
    html += '<div class="section-header">Price History</div>';

    if (s.priceHistory && s.priceHistory.length > 0) {
        html += `<table class="price-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Variation</th>
                    <th>Price</th>
                    <th>Currency</th>
                    <th>Package</th>
                    <th>Inner</th>
                    <th>In/Out</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>
        `;

        s.priceHistory.forEach(r => {
            const priceStr = r.price.toFixed(2);
            const extras = loadLocalPriceExtras(p.uuid, r.timestamp);

            html += `<tr>
                <td>${escapeHtml(r.date)}</td>
                <td>${escapeHtml(r.variation || '—')}</td>
                <td>${priceStr}</td>
                <td>${escapeHtml(r.currency)}</td>
                <td>${extras && extras.packageType ? `<span class="package-tag">${escapeHtml(extras.packageType)}</span>` : '—'}</td>
                <td>${extras && extras.innerPackageCount ? escapeHtml(String(extras.innerPackageCount)) : '—'}</td>
                <td>${extras && extras.innerOuterCount ? escapeHtml(String(extras.innerOuterCount)) : '—'}</td>
                <td class="price-note">${extras && extras.notes ? escapeHtml(extras.notes) : '—'}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
    } else {
        html += '<div class="empty-tab">No prices recorded yet.</div>';
    }

    container.innerHTML = html;
}

// ========== DESCRIPTION TAB ==========

function renderDescriptionTab(container) {
    const s = app.getState();
    const p = s.product;

    const desc = p.description || '';

    let html = `
        <div class="section-header">Product Description (Markdown)</div>
        <div class="description-editor-wrapper">
            <textarea id="description-editor" rows="12" placeholder="Write markdown description here...\n\n**Bold** *italic*\n- bullet list\n\n> quote">${escapeHtml(desc)}</textarea>
        </div>
        <div class="form-row" style="margin-top:12px">
            <button class="btn btn-primary" id="save-description-btn">💾 Save Description</button>
            <span id="description-status" style="margin-left:12px;font-size:0.9em"></span>
        </div>
        <div class="description-preview-wrapper" style="margin-top:16px">
            <div class="section-header">Preview</div>
            <div id="description-preview" class="markdown-preview">
                ${renderMarkdown(desc)}
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Wire up save button
    document.getElementById('save-description-btn').addEventListener('click', async function() {
        const newDesc = document.getElementById('description-editor').value;
        document.getElementById('save-description-btn').textContent = '💾 Saving...';
        document.getElementById('save-description-btn').disabled = true;
        try {
            await api.updateDescription(s.selectedFile, newDesc);
            s.product.description = newDesc;
            document.getElementById('description-status').textContent = '✅ Saved';
            document.getElementById('description-status').style.color = '#a6e3a1';
            // Update preview live
            document.getElementById('description-preview').innerHTML = renderMarkdown(newDesc);
        } catch (err) {
            document.getElementById('description-status').textContent = '❌ Error: ' + err.message;
            document.getElementById('description-status').style.color = '#f38ba8';
        } finally {
            document.getElementById('save-description-btn').textContent = '💾 Save Description';
            document.getElementById('save-description-btn').disabled = false;
        }
    });

    // Live preview on input
    const editor = document.getElementById('description-editor');
    editor.addEventListener('input', function() {
        document.getElementById('description-preview').innerHTML = renderMarkdown(this.value);
    });
}

function renderMarkdown(text) {
    if (!text) return '<em style="color:#6c7086">No description yet</em>';
    let html = escapeHtml(text);
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Unordered list
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    // Ordered list
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');
    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    // Wrap isolated <li> items in <ul>
    html = html.replace(/(<li>.*?<\/li>(\s*<br>\s*<li>.*?<\/li>)*)/gs, '<ul>$1</ul>');
    // Clean up empty/duplicate wraps
    html = html.replace(/<p><ul>/g, '<ul>');
    html = html.replace(/<\/ul><\/p>/g, '</ul>');
    return html;
}

// ========== GALLERY ==========

function renderGalleryHeader() {
    const s = app.getState();
    const header = document.getElementById('gallery-header');
    if (s.selectMode) {
        header.classList.add('select-mode');
        const count = s.selectedFiles.length;
        header.innerHTML = `
            <span class="selection-count">${count} selected</span>
            <span class="spacer"></span>
            <button class="btn btn-sm" data-action="deselect-all">✕ Deselect</button>
            <button class="btn btn-sm btn-primary" data-action="copy-selected">📋 Copy</button>
            <button class="btn btn-sm btn-primary" data-action="cut-selected">✂️ Cut</button>
            <button class="btn btn-sm btn-accent" data-action="add-to-deal">📋 Add to Deal</button>
            <button class="btn btn-sm btn-danger" data-action="delete-selected">🗑 Delete</button>
        `;
    } else {
        header.classList.remove('select-mode');
        var clipboard = app.getState().clipboard;
        var folderCount = (s.subdirs && s.subdirs.length) || 0;
        var fileCount = s.files.length;
        var text = '';
        if (folderCount > 0) text += folderCount + ' folder(s)';
        if (folderCount > 0 && fileCount > 0) text += ' · ';
        if (fileCount > 0) text += fileCount + ' product(s)';
        if (!text) text = 'empty';
        var isSearching = s.searchQuery && s.searchQuery.length > 0;
        var pasteHtml = clipboard ? ' <button class="btn btn-sm" data-action="paste-files">📋 Paste (' + clipboard.files.length + ')</button>' : '';
        header.innerHTML = `
            <span id="gallery-count">${isSearching ? '🔍 ' + s.searchResults.length + ' result(s)' : text}</span>
            <div class="gallery-search" style="flex:1;max-width:300px;margin:0 12px">
                <input type="text" id="search-input" placeholder="🔍 Search products..." value="${escapeHtml(s.searchQuery)}"
                    style="width:100%;padding:4px 8px;font-size:13px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-primary);outline:none" />
            </div>
            <span class="gallery-notice">${isSearching ? '' : 'Click folder to navigate, product to edit; Ctrl+click to select'}</span>
            ${pasteHtml}
        `;
        // Bind live search
        var searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }
    }
}

function getSelectedFiles() {
    return app.getState().selectedFiles;
}

function isFileSelected(file) {
    return app.getState().selectedFiles.indexOf(file) !== -1;
}

async function handleAddSelectedToDeal() {
    var s = app.getState();
    var files = s.selectedFiles;
    var dir = s.currentDir;
    if (!dir || files.length === 0) return;

    // Check if current directory has a .comp file
    try {
        var company = await api.getCompany(dir);
    } catch (err) {
        alert('This directory does not have a company. Create one first.');
        return;
    }

    // Get deals list
    var deals;
    try {
        deals = await api.listDeals(dir);
    } catch (err) {
        // No Deals folder yet — create a new deal
        deals = [];
    }

    // Filter pending/confirmed deals
    var activeDeals = deals.filter(function(d) {
        return d.status === 'pending' || d.status === 'confirmed';
    });

    if (activeDeals.length === 0) {
        // Create a new deal automatically
        var today = new Date().toISOString().slice(0, 10);
        var newDeal = {
            title: 'Quick Order ' + today,
            date: today,
            status: 'pending',
            currency: 'USD',
            additional_costs: 0,
            additional_costs_currency: '',
            notes: 'Created from selection',
            order: [],
            warehouse: [],
            filename: today + '-Quick_Order.deal'
        };

        // Add selected files as order items (with price from product)
        var dealCurrency = s.settings.currency || 'USD';
        for (var fi = 0; fi < files.length; fi++) {
            var file = files[fi];
            var displayName = file.split('/').pop().replace(/\.prod$/, '');
            var unitPrice = 0;
            var code = '';
            try {
                var prodData = await api.openProduct(file);
                code = prodData.code || '';
                if (prodData.priceCount > 0) {
                    try {
                        var hist = await api.getPriceHistory(file);
                        if (hist && hist.length > 0) unitPrice = hist[hist.length - 1].price || 0;
                    } catch (e) {}
                }
            } catch (e) {}
            newDeal.order.push({
                product: file,
                product_title: displayName,
                quantity: 1,
                unit_price: unitPrice,
                currency: dealCurrency,
                total: unitPrice,
                notes: '',
                _code: code
            });
        };

        try {
            var result = await api.saveDeal(dir, newDeal);
            app.setState({ selectedFiles: [], selectMode: false, success: 'Deal "' + result.title + '" created with ' + files.length + ' product(s)!' });
        } catch (err) {
            app.setState({ error: 'Failed to create deal: ' + err.message });
        }
    } else if (activeDeals.length === 1) {
        // Auto-add to the only active deal
        var deal = activeDeals[0];
        try {
            var fullDeal = await api.getDeal(dir, deal.filename);
            var dealCurrency = fullDeal.currency || 'USD';
            for (var fi2 = 0; fi2 < files.length; fi2++) {
                var file2 = files[fi2];
                // Skip if already in the deal
                if (fullDeal.order && fullDeal.order.some(function(o) { return o.product === file2; })) continue;
                var displayName2 = file2.split('/').pop().replace(/\.prod$/, '');
                var unitPrice2 = 0;
                try {
                    var hist2 = await api.getPriceHistory(file2);
                    if (hist2 && hist2.length > 0) unitPrice2 = hist2[hist2.length - 1].price || 0;
                } catch (e) {}
                fullDeal.order.push({
                    product: file2,
                    product_title: displayName2,
                    quantity: 1,
                    unit_price: unitPrice2,
                    currency: dealCurrency,
                    total: unitPrice2,
                    notes: ''
                });
            }
            var result = await api.saveDeal(dir, fullDeal);
            app.setState({ selectedFiles: [], selectMode: false, success: 'Added ' + files.length + ' product(s) to deal "' + result.title + '"!' });
        } catch (err) {
            app.setState({ error: 'Failed: ' + err.message });
        }
    } else {
        // Multiple active deals — show a picker
        var overlay = document.getElementById('deal-picker-overlay') || null;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'deal-picker-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) overlay.style.display = 'none';
            });
        }

        var h = '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);width:450px;padding:16px">';
        h += '<strong>📋 Select Deal</strong>';
        h += '<p style="font-size:13px;color:var(--text-muted);margin:8px 0">Multiple active deals found. Which one should receive the products?</p>';
        activeDeals.forEach(function(d) {
            h += '<div class="deal-option" data-file="' + escapeHtml(d.filename) + '" style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;cursor:pointer">';
            h += '<strong>' + escapeHtml(d.title || d.filename) + '</strong>';
            h += ' <span style="font-size:12px;color:var(--text-muted)">(' + escapeHtml(d.date) + ', ' + d.order_count + ' items)</span>';
            h += '</div>';
        });
        h += '<button class="btn" id="deal-picker-cancel" style="margin-top:8px">Cancel</button>';
        h += '</div>';
        overlay.innerHTML = h;
        overlay.style.display = 'flex';

        overlay.querySelectorAll('.deal-option').forEach(function(el) {
            el.addEventListener('click', async function() {
                overlay.style.display = 'none';
                var filename = el.dataset.file;
                try {
                    var fullDeal = await api.getDeal(dir, filename);
                    var dealCurrency = fullDeal.currency || 'USD';
                    for (var fi3 = 0; fi3 < files.length; fi3++) {
                        var file3 = files[fi3];
                        if (fullDeal.order && fullDeal.order.some(function(o) { return o.product === file3; })) continue;
                        var displayName3 = file3.split('/').pop().replace(/\.prod$/, '');
                        var unitPrice3 = 0;
                        try {
                            var hist3 = await api.getPriceHistory(file3);
                            if (hist3 && hist3.length > 0) unitPrice3 = hist3[hist3.length - 1].price || 0;
                        } catch (e) {}
                        fullDeal.order.push({
                            product: file3,
                            product_title: displayName3,
                            quantity: 1,
                            unit_price: unitPrice3,
                            currency: dealCurrency,
                            total: unitPrice3,
                            notes: ''
                        });
                    }
                    var result = await api.saveDeal(dir, fullDeal);
                    app.setState({ selectedFiles: [], selectMode: false, success: 'Added to deal "' + result.title + '"!' });
                } catch (err) {
                    app.setState({ error: 'Failed: ' + err.message });
                }
            });
        });

        document.getElementById('deal-picker-cancel').addEventListener('click', function() {
            overlay.style.display = 'none';
        });
    }
}

async function handleDeleteSelected() {
    const files = getSelectedFiles();
    if (files.length === 0) return;

    const confirmed = await _showConfirmDialog(
        'Delete ' + files.length + ' product file(s)? This cannot be undone.'
    );
    if (!confirmed) return;

    app.setState({ loading: true, error: '', success: '' });
    try {
        const result = await api.deleteProducts(files);
        const deleted = result.deleted || [];
        const errors = result.errors || [];
        if (errors.length > 0) {
            app.setState({
                error: 'Deleted ' + deleted.length + ', failed: ' +
                       errors.map(e => e.path.split('/').pop()).join(', '),
                selectedFiles: [],
                selectMode: false,
                loading: false,
            });
        } else {
            app.setState({
                success: 'Deleted ' + deleted.length + ' file(s).',
                selectedFiles: [],
                selectMode: false,
                loading: false,
            });
        }
        // Reload the directory
        var dir = app.getState().currentDir;
        if (dir) await loadDirectory(dir);
    } catch (err) {
        app.setState({ loading: false, error: 'Delete failed: ' + err.message });
    }
}

async function handleDeleteFile(file) {
    const confirmed = await _showConfirmDialog(
        'Delete "' + file.split('/').pop() + '"? This cannot be undone.'
    );
    if (!confirmed) return;

    app.setState({ loading: true, error: '', success: '' });
    try {
        await api.deleteProducts([file]);
        app.setState({ loading: false, success: 'File deleted.' });
        var dir = app.getState().currentDir;
        if (dir) await loadDirectory(dir);
    } catch (err) {
        app.setState({ loading: false, error: 'Delete failed: ' + err.message });
    }
}

// ========== COPY / CUT / PASTE ==========

function handleCopySelected() {
    var files = getSelectedFiles();
    if (files.length === 0) return;
    app.setState({
        clipboard: { action: 'copy', files: files },
        selectedFiles: [],
        selectMode: false,
        success: files.length + ' file(s) copied to clipboard.'
    });
}

function handleCutSelected() {
    var files = getSelectedFiles();
    if (files.length === 0) return;
    app.setState({
        clipboard: { action: 'cut', files: files },
        selectedFiles: [],
        selectMode: false,
        success: files.length + ' file(s) cut to clipboard.'
    });
}

async function handlePasteFiles() {
    var s = app.getState();
    var cb = s.clipboard;
    if (!cb || !cb.files || cb.files.length === 0) {
        app.setState({ error: 'Nothing to paste.' });
        return;
    }
    if (!s.currentDir) {
        app.setState({ error: 'No directory to paste into.' });
        return;
    }
    
    app.setState({ loading: true, error: '', success: '' });
    try {
        var targetDir = s.currentDir;
        if (cb.action === 'copy') {
            var result = await api.copyProducts(cb.files, targetDir);
            if (result.errors && result.errors.length > 0) {
                app.setState({
                    loading: false,
                    error: 'Copied ' + result.copied.length + ', errors: ' + result.errors.map(function(e) { return e.path.split('/').pop(); }).join(', ')
                });
            } else {
                app.setState({
                    loading: false,
                    clipboard: null,
                    success: 'Pasted ' + result.copied.length + ' file(s).'
                });
            }
        } else if (cb.action === 'cut') {
            var result = await api.moveProducts(cb.files, targetDir);
            if (result.errors && result.errors.length > 0) {
                app.setState({
                    loading: false,
                    error: 'Moved ' + result.moved.length + ', errors: ' + result.errors.map(function(e) { return e.path.split('/').pop(); }).join(', ')
                });
            } else {
                app.setState({
                    loading: false,
                    clipboard: null,
                    success: 'Moved ' + result.moved.length + ' file(s).'
                });
            }
        }
        // Reload directory
        await loadDirectory(s.currentDir);
    } catch (err) {
        app.setState({ loading: false, error: 'Paste failed: ' + err.message });
    }
}

// ========== GALLERY (cards) ==========

let galleryAbort = false;

function handleSearch() {
    var input = document.getElementById('search-input');
    if (!input) return;
    var q = input.value.trim().toLowerCase();
    var s = app.getState();
    
    if (!q) {
        // Clear search — show all
        app.setState({ searchQuery: '', searchResults: null });
        return;
    }
    
    // Search across file names
    var results = [];
    s.files.forEach(function(f) {
        var name = f.split('/').pop().replace(/\.prod$/, '').toLowerCase();
        if (name.indexOf(q) !== -1) {
            results.push({ type: 'file', data: f, match: name });
        }
    });
    // Search subfolder names (and their company names)
    if (s.subdirs) {
        s.subdirs.forEach(function(item) {
            var folderName = (item.name || item).toLowerCase();
            var companyName = (item.company && item.company.name) ? item.company.name.toLowerCase() : '';
            if (folderName.indexOf(q) !== -1 || companyName.indexOf(q) !== -1) {
                results.push({ type: 'folder', data: item });
            }
        });
    }
    
    app.setState({ searchQuery: q, searchResults: results });
    // Re-render gallery with filtered results
    renderFilteredGallery(q, results);
}

function renderFilteredGallery(q, results) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    
    if (results.length === 0) {
        grid.innerHTML = '<div class="empty-tab">No results for "' + escapeHtml(q) + '"</div>';
        return;
    }
    
    var html = '';
    var productFiles = [];
    results.forEach(function(item) {
        if (item.type === 'folder') {
            var d = item.data;
            var folderName = d.name || d;
            var companyInfo = d.company || null;
            html += '<div class="product-card folder-card" data-folder="' + escapeHtml(folderName) + '">';
            html += '<div class="card-thumb" style="background:var(--bg-surface2);display:flex;align-items:center;justify-content:center"><span style="font-size:40px">📁</span></div>';
            html += '<div class="card-body">';
            html += '<div class="card-title">' + escapeHtml(folderName) + '</div>';
            if (companyInfo && companyInfo.name) {
                html += '<div class="card-code" style="font-size:12px;color:var(--accent);font-weight:500">' + escapeHtml(companyInfo.name) + '</div>';
            }
            html += '</div></div>';
        } else {
            var f = item.data;
            var name = f.split('/').pop().replace(/\.prod$/, '');
            // Use the same placeholder format as loadGalleryCards
            html += '<div class="product-card" data-file="' + escapeHtml(f) + '" data-gallery-idx="' + productFiles.length + '">' +
                '<div class="card-check"><span class="check-box"></span></div>' +
                '<div class="card-thumb"><span class="no-photo">📦</span></div>' +
                '<div class="card-body">' +
                '<div class="card-title">' + escapeHtml(name) + '</div>' +
                '<div class="card-code">loading...</div>' +
                '<div class="card-no-price">—</div>' +
                '</div></div>';
            productFiles.push(f);
        }
    });
    grid.innerHTML = html;
    
    // Load product details progressively (same as loadGalleryCards)
    if (productFiles.length > 0) {
        var progress = document.getElementById('gallery-progress');
        var progressText = document.getElementById('gallery-progress-text');
        progress.style.display = 'flex';
        progressText.textContent = 'Loading product data...';
        
        galleryAbort = false;
        (async function() {
            for (var i = 0; i < productFiles.length; i++) {
                if (galleryAbort) break;
                var file = productFiles[i];
                progressText.textContent = 'Search: loading ' + (i + 1) + '/' + productFiles.length + '...';
                try {
                    var product = await api.openProduct(file);
                    if (galleryAbort) break;
                    updateGalleryCard(file, product);
                } catch (err) {}
            }
            progress.style.display = 'none';
        })();
    }
}

async function renderGallery() {
    const s = app.getState();
    const grid = document.getElementById('gallery-grid');
    renderGalleryHeader();
    const progress = document.getElementById('gallery-progress');
    const progressText = document.getElementById('gallery-progress-text');

    // If there's a search query active, don't re-render gallery normally
    if (s.searchQuery && s.searchQuery.length > 0) {
        // searchResults already set by handleSearch; gallery header repainted
        galleryAbort = true;
        return;
    }

    var currentDir = app.getState().currentDir;

    // Fetch current directory's .comp file (if it exists)
    var currentCompany = null;
    try {
        currentCompany = await api.getCompany(currentDir);
        if (currentCompany && !currentCompany.name) currentCompany = null;
    } catch (e) {
        currentCompany = null;
    }

    // Build combined list: current-dir company card first, then folders, then products
    var items = [];
    
    // Current directory company card (always first)
    if (currentCompany) {
        items.push({ type: 'current-company', data: currentCompany });
    }
    
    // Subfolders
    if (s.subdirs && s.subdirs.length > 0) {
        s.subdirs.forEach(function(item) {
            items.push({ type: 'folder', data: item });
        });
    }
    // Deal files (in Deals/ subfolder)
    if (s.dealFiles && s.dealFiles.length > 0) {
        s.dealFiles.forEach(function(df) {
            items.push({ type: 'deal', data: df });
        });
    }
    
    // Product files
    if (s.files.length > 0) {
        s.files.forEach(function(f) {
            items.push({ type: 'file', data: f });
        });
    }

    if (items.length === 0) {
        grid.innerHTML = '<div class="empty-tab">This directory is empty</div>';
        return;
    }

    // Render all cards
    var html = '';
    var productFiles = [];
    items.forEach(function(item) {
        if (item.type === 'current-company') {
            // Current-dir company card — click opens externally in company-editor
            var c = item.data;
            var compFilePath = (c.filename && currentDir) ? currentDir + '/' + c.filename : '';
            var typeLabel = c.company_type ? c.company_type.replace(/_/g, ' ').replace(/\b\w/g, function(s) { return s.toUpperCase(); }) : '';
            html += '<div class="product-card current-company-card" data-action="open-company-editor"' + (compFilePath ? ' data-company-path="' + escapeHtml(compFilePath) + '"' : '') + '>';
            html += '<div class="card-thumb" style="background:linear-gradient(135deg,var(--accent),var(--accent-hover));display:flex;align-items:center;justify-content:center"><span style="font-size:36px">🏢</span></div>';
            html += '<div class="card-body">';
            html += '<div class="card-title" style="color:var(--accent)">' + escapeHtml(c.name) + '</div>';
            // Show company type prominently
            html += '<div class="card-code" style="font-size:13px;color:var(--text-secondary);font-weight:600">' + escapeHtml(typeLabel || 'Company') + '</div>';
            if (c.address) {
                var addrTrunc = c.address.length > 40 ? c.address.substring(0, 40) + '…' : c.address;
                html += '<div class="card-no-price" style="font-size:12px;color:var(--text-secondary);margin-top:4px">📍 ' + escapeHtml(addrTrunc) + '</div>';
            }
            html += '<div class="card-no-price" style="font-size:12px;color:var(--text-muted)">👤 ' + (c.contactCount || 0) + ' contacts</div>';
            if (c.website) html += '<div class="card-no-price" style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔗 ' + escapeHtml(c.website) + '</div>';
            html += '</div></div>';
        } else if (item.type === 'folder') {
            var d = item.data;
            var folderName = d.name || d;
            var companyInfo = d.company || null;

            html += '<div class="product-card folder-card" data-folder="' + escapeHtml(folderName) + '">';
            html += '<div class="card-thumb" style="background:var(--bg-surface2);display:flex;align-items:center;justify-content:center"><span style="font-size:40px">📁</span></div>';
            html += '<div class="card-body">';
            html += '<div class="card-title">' + escapeHtml(folderName) + '</div>';
            if (companyInfo && companyInfo.name) {
                html += '<div class="card-code" style="font-size:12px;color:var(--accent);font-weight:500">' + escapeHtml(companyInfo.name) + '</div>';
                if (companyInfo.address) {
                    var addrTrunc = companyInfo.address.length > 35 ? companyInfo.address.substring(0, 35) + '…' : companyInfo.address;
                    html += '<div class="card-no-price" style="font-size:11px;color:var(--text-secondary)">📍 ' + escapeHtml(addrTrunc) + '</div>';
                }
                html += '<div class="card-no-price" style="font-size:11px;color:var(--text-muted)">👤 ' + (companyInfo.contactCount || 0) + ' contacts</div>';
            } else {
                html += '<div class="card-code" style="font-size:12px;color:var(--text-muted)">No company</div>';
            }
            html += '</div></div>';
        } else if (item.type === 'deal') {
        var di = item.data;
        var dealMeta = di.deal_info || {};
        var dealName = di.name;
        var statusEmoji = '⏳';
        var statusColor = 'var(--text-muted)';
        if (dealMeta.status === 'confirmed') { statusColor = 'var(--accent-green)'; statusEmoji = '✅'; }
        else if (dealMeta.status === 'shipped') { statusColor = 'var(--accent-orange)'; statusEmoji = '🚚'; }
        else if (dealMeta.status === 'completed') { statusColor = 'var(--accent-green)'; statusEmoji = '🎉'; }
        else if (dealMeta.status === 'cancelled') { statusColor = 'var(--accent-red)'; statusEmoji = '🚫'; }
        var dealFilePath = (currentDir + '/Deals/' + di.name);
        html += '<div class="product-card deal-card" data-deal-file="' + escapeHtml(di.name) + '" data-deal-path="' + escapeHtml(dealFilePath) + '">';
        html += '<div class="card-thumb" style="background:var(--bg-surface);display:flex;align-items:center;justify-content:center"><span style="font-size:36px">📋</span></div>';
        html += '<div class="card-body">';
        html += '<div class="card-title">' + escapeHtml(dealMeta.title || dealName.replace(/\.deal$/, '')) + '</div>';
        if (dealMeta.status) html += '<div class="card-code" style="font-size:12px;color:' + statusColor + ';font-weight:500">' + statusEmoji + ' ' + escapeHtml(dealMeta.status) + '</div>';
        if (dealMeta.date) html += '<div class="card-no-price" style="font-size:11px;color:var(--text-secondary)">📅 ' + escapeHtml(dealMeta.date) + '</div>';
        html += '<div class="card-no-price" style="font-size:11px;color:var(--text-muted)">📦 ' + (dealMeta.order_count || 0) + ' items · 📥 ' + (dealMeta.warehouse_records || 0) + ' warehouse</div>';
        html += '</div></div>';
    } else {
            productFiles.push(item.data);
        }
    });
    grid.innerHTML = html;

    if (productFiles.length > 0) {
        progress.style.display = 'flex';
        progressText.textContent = 'Loading product data...';
        loadGalleryCards(productFiles);
    } else {
        progress.style.display = 'none';
    }
}

async function loadGalleryCards(files) {
    galleryAbort = false;

    const grid = document.getElementById('gallery-grid');
    const progress = document.getElementById('gallery-progress');
    const progressText = document.getElementById('gallery-progress-text');

    // Append placeholder product cards (folder cards are already rendered)
    files.forEach(function(f, idx) {
        const name = f.split('/').pop().replace(/\.prod$/, '');
        var cardHtml = '<div class="product-card" data-file="' + escapeHtml(f) + '" data-gallery-idx="' + idx + '">' +
            '<div class="card-check"><span class="check-box"></span></div>' +
            '<div class="card-thumb"><span class="no-photo">📦</span></div>' +
            '<div class="card-body">' +
            '<div class="card-title">' + escapeHtml(name) + '</div>' +
            '<div class="card-code">loading...</div>' +
            '<div class="card-no-price">—</div>' +
            '</div></div>';
        grid.insertAdjacentHTML('beforeend', cardHtml);
    });

    // Load products progressively
    for (let i = 0; i < files.length; i++) {
        if (galleryAbort) break;
        const file = files[i];
        progressText.textContent = 'Loading ' + (i + 1) + '/' + files.length + '...';
        try {
            const product = await api.openProduct(file);
            if (galleryAbort) break;
            updateGalleryCard(file, product);
        } catch (err) {
            // Skip failed products silently
        }
    }

    progress.style.display = 'none';
}

function updateGalleryCard(file, product) {
    const escapedFile = CSS.escape(file);
    const card = document.querySelector('.product-card[data-file="' + escapedFile + '"]');
    if (!card) return;

    const thumb = card.querySelector('.card-thumb');
    const titleEl = card.querySelector('.card-title');
    const codeEl = card.querySelector('.card-code');

    // Title
    titleEl.textContent = product.title || file.split('/').pop().replace(/\.prod$/, '');

    // Code
    codeEl.textContent = product.code || '—';

    // Thumbnail (first photo)
    if (product.photos && product.photos.length > 0) {
        thumb.innerHTML = '<img src="' + product.photos[0] + '" alt="' + escapeHtml(product.title) + '" loading="lazy">';
    } else {
        thumb.innerHTML = '<span class="no-photo">📦</span>';
    }

    // Get latest price for the card
    getLatestPriceForCard(file, card);
}

async function getLatestPriceForCard(file, card) {
    try {
        const history = await api.getPriceHistory(file);
        if (galleryAbort) return;
        if (history && history.length > 0) {
            const latest = history[history.length - 1];
            const priceStr = latest.price.toFixed(2);
            const body = card.querySelector('.card-body');
            if (body) {
                const oldPriceEl = body.querySelector('.card-price, .card-no-price');
                if (oldPriceEl) {
                    oldPriceEl.outerHTML = '<div class="card-price">' + priceStr + ' <span class="currency">' + escapeHtml(latest.currency) + '</span></div>';
                }
            }
        }
    } catch (err) {
        // No price — keep the "—" placeholder
    }
}

// ========== UTILITY — Find .comp file in directory ==========

var Company = {
    findCompanyFile: function(dir) {
        // Remove trailing slash
        dir = dir.replace(/\/$/, '');
        // First check for a .comp file directly in the directory
        var files = app.getState().files || [];
        var compFile = files.find(function(f) {
            return typeof f === 'string' && f.endsWith('.comp');
        });
        if (compFile) {
            return dir + '/' + compFile;
        }
        // Fallback: ask the server (async, not ideal, but sync fallback)
        return dir + '/*.comp';
    }
};

// ========== GALLERY CARD CLICK → EDITOR ==========

function openProductEditor(file) {
    // Open the .prod file with the system default handler
    // (the dedicated products-desktop-editor which handles one file at a time)
    api.openSystem(file).catch(function(err) {
        app.setState({ error: 'Failed to open file: ' + err.message });
    });
}

// ========== MESSAGES ==========

function renderMessages() {
    const s = app.getState();
    const container = document.getElementById('messages');
    if (s.error) {
        container.innerHTML = '<div class="message message-error">❌ ' + escapeHtml(s.error) + '</div>';
        setTimeout(function() { app.setState({ error: '' }); }, 5000);
    } else if (s.success) {
        container.innerHTML = '<div class="message message-success">✅ ' + escapeHtml(s.success) + '</div>';
        setTimeout(function() { app.setState({ success: '' }); }, 3000);
    } else {
        container.innerHTML = '';
    }
}

function renderPhotoOverlay() {
    const s = app.getState();
    const overlay = document.getElementById('photo-overlay');
    if (s.fullscreenPhoto !== null && s.product && s.product.photos) {
        overlay.innerHTML = '<img src="' + s.product.photos[s.fullscreenPhoto] + '" alt="Full size photo">';
        overlay.classList.add('open');
    } else {
        overlay.classList.remove('open');
    }
}

// ========== EVENT BINDING ==========

function bindEvents() {
    var body = document.body;

    // Global data-action clicks
    body.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;

        switch (action) {
            case 'open-dir': handleOpenDir(); break;
            case 'new-product': handleNewProduct(); break;
            case 'refresh': handleRefresh(); break;
            case 'settings': openSettings(); break;
            case 'save-settings': saveSettings(); break;
            case 'cancel-settings': closeSettings(); break;
            case 'back-to-gallery': handleBackToGallery(); break;
            case 'remove-variation':
                var idx = parseInt(btn.dataset.variationIdx);
                handleRemoveVariation(idx);
                break;
            case 'set-startup-dir': handleSetStartupDir(); break;
            case 'skip-startup': handleSkipStartup(); break;
            case 'browse-startup-dir':
                api.pickDirectory().then(function(dir) {
                    if (dir) {
                        document.getElementById('startup-dir-input').value = dir;
                    }
                }).catch(function(err) {
                    _showPromptDialog('Enter directory path:').then(function(d) {
                        if (d) document.getElementById('startup-dir-input').value = d;
                    });
                });
                break;
            case 'browse-settings-dir':
                api.pickDirectory().then(function(dir) {
                    if (dir) {
                        document.getElementById('settings-products-dir').value = dir;
                    }
                }).catch(function(err) {
                    _showPromptDialog('Enter directory path:').then(function(d) {
                        if (d) document.getElementById('settings-products-dir').value = d;
                    });
                });
                break;
            case 'change-dir': handleOpenDir(); break;
            case 'up-dir': handleUpDir(); break;
            case 'create-dir': handleShowCreateDir(); break;
            case 'do-create-dir': handleCreateSubdir(); break;
            case 'cancel-createdir': handleCancelCreateDir(); break;
            case 'delete-selected': handleDeleteSelected(); break;
            case 'copy-selected': handleCopySelected(); break;
            case 'cut-selected': handleCutSelected(); break;
            case 'paste-files': handlePasteFiles(); break;
            case 'add-to-deal': handleAddSelectedToDeal(); break;
            case 'deselect-all':
                app.setState({ selectedFiles: [], selectMode: false });
                break;
            case 'sidebar-delete':
                var delFile = btn.dataset.file;
                if (delFile) handleDeleteFile(delFile);
                break;
            case 'edit-folder-company':
                var esub = btn.dataset.subdir;
                if (esub) {
                    var eDir = app.getState().currentDir;
                    var subdirPath = eDir + '/' + esub;
                    var compFile = Company.findCompanyFile(subdirPath);
                    if (compFile) {
                        api.openSystem(compFile);
                    }
                }
                break;
            case 'edit-current-company':
                var curDir = app.getState().currentDir;
                if (curDir) {
                    var compFile = Company.findCompanyFile(curDir);
                    if (compFile) {
                        api.openSystem(compFile);
                    }
                }
                break;
            case 'create-current-company':
                var cDir = app.getState().currentDir;
                if (cDir) {
                    handleCreateCompany(cDir);
                }
                break;
            case 'company-remove-email':
                var emailIdx = parseInt(btn.dataset.idx);
                if (!isNaN(emailIdx)) {
                    var el = document.querySelector('.company-email-input[data-idx="' + emailIdx + '"]');
                    if (el) el.parentElement.remove();
                }
                break;
            case 'company-remove-phone':
                var phoneIdx = parseInt(btn.dataset.idx);
                if (!isNaN(phoneIdx)) {
                    var el = document.querySelector('.company-phone-input[data-idx="' + phoneIdx + '"]');
                    if (el) el.parentElement.remove();
                }
                break;
            case 'company-add-email':
                e.stopPropagation();
                handleCompanyAddEmail();
                break;
            case 'company-add-phone':
                e.stopPropagation();
                handleCompanyAddPhone();
                break;
            case 'company-edit-contact':
                var contactIdx = parseInt(btn.dataset.idx);
                if (!isNaN(contactIdx)) showContactForm(contactIdx);
                break;
            case 'company-delete-contact':
                (async function() {
                    var cIdx = parseInt(btn.dataset.idx);
                    if (isNaN(cIdx)) return;
                    var confirmed = await _showConfirmDialog('Delete this contact?');
                    if (!confirmed) return;
                    try {
                        var result = await api.deleteContact(companyEditorState.directory, cIdx);
                        companyEditorState.company = result;
                        renderCompanyEditor(document.getElementById('tab-content'));
                        app.setState({ success: 'Contact deleted.' });
                    } catch (err) {
                        app.setState({ error: 'Failed to delete contact: ' + err.message });
                    }
                })();
                break;
        }
    });

    // File list selection & subdirectory click
    body.addEventListener('click', function(e) {
        var item = e.target.closest('.file-item');
        if (!item) return;

        // Subdirectory click — navigate into it
        var subdir = item.dataset.subdir;
        if (subdir) {
            var currentDir = app.getState().currentDir;
            handleNavigateSubdir(currentDir + '/' + subdir);
            return;
        }

        // Product file click
        var path = item.dataset.file;
        if (path) {
            openProductEditor(path);
        }
    });

    // Gallery card click → folder nav, selection, or editor
    body.addEventListener('click', function(e) {
        var card = e.target.closest('.product-card');
        if (!card) return;

        // Current-company card → open externally in company-editor
        if (card.dataset.action === 'open-company-editor') {
            var curDir = app.getState().currentDir;
            if (curDir) {
                var companyPath = card.dataset.companyPath;
                if (companyPath) {
                    api.openSystem(companyPath);
                } else {
                    // Fallback: find .comp file in directory via API
                    api.getCompany(curDir).then(function(c) {
                        if (c && c.filename) {
                            api.openSystem(curDir + '/' + c.filename);
                        }
                    }).catch(function() {});
                }
            }
            return;
        }

        // Deal card → open externally in deal-editor
        var dealFile = card.dataset.dealFile;
        if (dealFile) {
            var curDir = app.getState().currentDir;
            if (curDir && dealFile) {
                var dealPath = card.dataset.dealPath || curDir + '/Deals/' + dealFile;
                api.openSystem(dealPath);
            }
            return;
        }

        // Folder card → navigate into it
        var folder = card.dataset.folder;
        if (folder) {
            var currentDir = app.getState().currentDir;
            handleNavigateSubdir(currentDir + '/' + folder);
            return;
        }

        var file = card.dataset.file;
        if (!file) return;

        // If clicking the checkbox area or holding modifier, toggle selection
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.target.closest('.card-check')) {
            toggleFileSelection(file, e.shiftKey, e.ctrlKey || e.metaKey);
            return;
        }

        // If in selection mode, clicking a card toggles it
        if (app.getState().selectMode) {
            toggleFileSelection(file, false, true);
            return;
        }

        openProductEditor(file);
    });

    // Double-click product card to open editor
    body.addEventListener('dblclick', function(e) {
        var card = e.target.closest('.product-card[data-file]');
        if (card) {
            var file = card.dataset.file;
            if (file) openProductEditor(file);
        }
    });

    // Tab switching
    body.addEventListener('click', function(e) {
        var tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
            var tab = tabBtn.dataset.tab;
            app.setState({ activeTab: tab });
            if (tab === 'prices') {
                loadPriceHistory();
            }
        }
    });

    // Photo click for fullscreen
    body.addEventListener('click', function(e) {
        var item = e.target.closest('.photo-item');
        if (item && !e.target.closest('.remove-btn')) {
            var idx = parseInt(item.dataset.photoIndex);
            app.setState({ fullscreenPhoto: idx });
        }
    });

    // Photo overlay close
    document.getElementById('photo-overlay').addEventListener('click', function() {
        app.setState({ fullscreenPhoto: null });
    });

    // Remove photo
    body.addEventListener('click', async function(e) {
        var btn = e.target.closest('[data-action="remove-photo"]');
        if (!btn) return;
        await handleRemovePhoto(parseInt(btn.dataset.index));
    });

    // Add photo
    body.addEventListener('click', async function(e) {
        if (e.target.id === 'add-photo-btn') await handleAddPhoto();
    });

    // Add price
    body.addEventListener('click', async function(e) {
        if (e.target.id === 'add-price-btn') await handleAddPrice();
    });

    // Add variation
    body.addEventListener('click', async function(e) {
        if (e.target.id === 'add-variation-btn') await handleAddVariation();
    });

    // Enter key shortcuts
    body.addEventListener('keydown', async function(e) {
        if (e.key === 'Enter') {
            if (e.target.id === 'photo-path-input') await handleAddPhoto();
            if (e.target.id === 'price-input' || e.target.id === 'price-notes') await handleAddPrice();
            if (e.target.id === 'new-variation-input') await handleAddVariation();
        }
    });

    // Close settings with Escape
    body.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && app.getState().showSettings) {
            closeSettings();
        }
    });

    // Escape to deselect, Delete to delete
    body.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const s = app.getState();
            if (s.selectMode) {
                app.setState({ selectedFiles: [], selectMode: false });
            }
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && app.getState().selectMode) {
            handleDeleteSelected();
        }
    });

    // Update card selection classes when selection state changes
    body.addEventListener('selectionchange', function() {
        // don't use this — we handle it via render
    });
}

// ========== HANDLERS ==========

function handleBackToGallery() {
    // Close both product editor and company editor
    companyEditorState = { directory: '', company: null };
    app.setState({
        product: null,
        selectedFile: '',
        activeTab: 'photos',
        priceHistory: []
    });
}

function updateCompanyBar() {
    var s = app.getState();
    var editBtn = document.getElementById('btn-edit-company');
    var createBtn = document.getElementById('btn-create-company');
    if (!editBtn || !createBtn) return;
    
    if (s.currentDir) {
        editBtn.style.display = '';
        createBtn.style.display = '';
    } else {
        editBtn.style.display = 'none';
        createBtn.style.display = 'none';
    }
}

async function handleCreateCompany(dirPath) {
    // Validate directory exists first
    try {
        app.setState({ loading: true, error: '' });
        var company = await api.saveCompany(dirPath, {
            name: '', address: '', website: '', company_type: '', emails: [], phones: [], contacts: []
        });
        companyEditorState = { directory: dirPath, company: company };
        app.setState({ loading: false });
        // Reload to refresh sidebar/folder cards with new company info
        loadDirectory(app.getState().currentDir);
    } catch (err) {
        app.setState({ loading: false, error: 'Failed to create company: ' + err.message });
    }
}

// ========== DIRECTORY NAVIGATION & CREATION ==========

async function handleSetStartupDir() {
    try {
        var input = document.getElementById('startup-dir-input');
        var dir = input ? input.value.trim() : '';
        if (!dir) {
            app.setState({ error: 'Please enter a directory path.' });
            return;
        }

        // Persist as default directory on server
        await api.saveSettings({ defaultDir: dir });
        app.setState({ defaultDir: dir, showStartupDialog: false });
        await loadDirectory(dir);
    } catch (err) {
        console.error('handleSetStartupDir failed:', err);
        app.setState({ loading: false, error: 'Failed to set directory: ' + (err.message || err) });
    }
}

function handleSkipStartup() {
    app.setState({ showStartupDialog: false });
}

function getParentDir(dir) {
    if (!dir || dir === '/' || dir === '') return null;
    var normalized = dir.replace(/\/+$/, '');
    var idx = normalized.lastIndexOf('/');
    if (idx <= 0) return '/';
    return normalized.substring(0, idx);
}

async function handleOpenDir() {
    try {
        var dir = await api.pickDirectory();
        if (!dir) return;
        app.setState({ defaultDir: dir });
        galleryAbort = true;
        await loadDirectory(dir);
        return;
    } catch (err) {
        // GTK dialog failed — fallback to text prompt
    }

    var dir = await _showPromptDialog('Enter directory path containing .prod files:');
    if (!dir || !dir.trim()) return;
    dir = dir.trim();

    app.setState({ defaultDir: dir });
    galleryAbort = true;
    await loadDirectory(dir);
}

function handleUpDir() {
    var s = app.getState();
    var parent = getParentDir(s.currentDir);
    if (parent) {
        app.setState({ defaultDir: parent });
        app.setState({ defaultDir: parent });
        galleryAbort = true;
        loadDirectory(parent);
    }
}

function handleShowCreateDir() {
    app.setState({ showCreateDirDialog: true });
}

function handleCancelCreateDir() {
    app.setState({ showCreateDirDialog: false });
}

async function handleCreateSubdir() {
    var s = app.getState();
    if (!s.currentDir) {
        app.setState({ error: 'No current directory. Open one first.', showCreateDirDialog: false });
        return;
    }

    var input = document.getElementById('createdir-name-input');
    var name = input ? input.value.trim() : '';
    if (!name) {
        app.setState({ error: 'Please enter a folder name.' });
        return;
    }

    try {
        var subdir = await api.createSubdir(s.currentDir, name);
        app.setState({ showCreateDirDialog: false, success: 'Folder "' + name + '" created.' });
        await loadDirectory(s.currentDir);
    } catch (err) {
        app.setState({ error: 'Failed to create folder: ' + err.message });
    }
}

async function handleRefresh() {
    var dir = app.getState().currentDir;
    if (dir) {
        galleryAbort = true;
        await loadDirectory(dir);
    }
}

async function loadDirectory(dir) {
    app.setState({
        loading: true,
        error: '',
        success: '',
        selectedFile: '',
        product: null,
        priceHistory: [],
        searchQuery: '',
        searchResults: null
    });
    // Close company editor when navigating
    companyEditorState = { directory: '', company: null };
    try {
        var items = await api.listItems(dir);
        var files = [];
        var dealFiles = [];
        var subdirs = [];
        for (var item of items) {
            if (item.type === 'file' && item.subtype === 'deal') {
                dealFiles.push(item);
            } else if (item.type === 'file') {
                files.push(item.path);
            } else if (item.type === 'folder') {
                subdirs.push(item);
            }
        }
        app.setState({ currentDir: dir, files: files || [], dealFiles: dealFiles || [], subdirs: subdirs || [], loading: false });
    } catch (err) {
        app.setState({ currentDir: dir, files: [], subdirs: [], loading: false, error: 'Failed to load directory: ' + err.message });
    }
}

async function handleNewProduct() {
    var s = app.getState();

    var code = await _showPromptDialog('Product code (leave empty for auto-generate):', '');

    var path;
    if (s.currentDir) {
        var name = (code && code.trim()) || 'new-product';
        path = s.currentDir.replace(/\/+$/, '') + '/' + name + '.prod';
    } else {
        path = await _showPromptDialog('Enter path for new product (e.g. /path/to/product.prod):');
        if (!path) return;
    }

    var title = await _showPromptDialog('Product title:');
    if (!title) return;

    app.setState({ loading: true, error: '' });

    try {
        var product = await api.createProduct(path, title, code || '');
        app.setState({
            product: product,
            selectedFile: path,
            loading: false,
            success: 'Product created: ' + title,
            activeTab: 'photos',
            priceHistory: []
        });
        if (s.currentDir && path.startsWith(s.currentDir)) {
            await loadDirectory(s.currentDir);
        }
    } catch (err) {
        app.setState({ loading: false, error: 'Failed to create product: ' + err.message });
    }
}

async function handleAddPhoto() {
    var s = app.getState();
    var input = document.getElementById('photo-file-input');
    if (!input || !input.files || input.files.length === 0) {
        app.setState({ error: 'Please select photo file(s) to upload.' });
        return;
    }
    if (!s.selectedFile || !s.product) { app.setState({ error: 'No product selected.' }); return; }

    var slotsLeft = 25 - s.product.photoCount;
    var filesToUpload = Array.from(input.files).slice(0, slotsLeft);
    if (filesToUpload.length === 0) {
        app.setState({ error: 'Photo limit reached (max 25).' });
        return;
    }

    app.setState({ loading: true, error: '', success: '' });

    try {
        for (var f of filesToUpload) {
            await api.uploadPhotos(s.selectedFile, f);
        }

        input.value = '';
        var product = await api.openProduct(s.selectedFile);
        var localVars = loadLocalVariations(product.uuid);
        if (localVars) product.variations = localVars.variations;
        var count = filesToUpload.length;
        app.setState({ product: product, loading: false, success: count + ' photo(s) added.' });
    } catch (err) {
        app.setState({ loading: false, error: 'Failed to add photo(s): ' + err.message });
    }
}

async function handleRemovePhoto(idx) {
    var s = app.getState();
    if (!s.selectedFile || !s.product) { app.setState({ error: 'No product selected.' }); return; }
    var confirmed = await _showConfirmDialog('Remove photo ' + (idx + 1) + '?');
    if (!confirmed) return;

    app.setState({ loading: true, error: '', success: '' });
    try {
        await api.removePhoto(s.selectedFile, idx);
        var product = await api.openProduct(s.selectedFile);
        var localVars = loadLocalVariations(product.uuid);
        if (localVars) product.variations = localVars.variations;
        app.setState({ product: product, loading: false, success: 'Photo removed.' });
    } catch (err) {
        app.setState({ loading: false, error: 'Failed to remove photo: ' + err.message });
    }
}

// ========== VARIATIONS HANDLERS ==========

function getCurrentProductVariations() {
    var s = app.getState();
    if (!s.product) return [];
    var localVars = loadLocalVariations(s.product.uuid);
    return localVars ? localVars.variations : (s.product.variations || []);
}

async function handleAddVariation() {
    var s = app.getState();
    if (!s.product) { app.setState({ error: 'No product selected.' }); return; }

    var input = document.getElementById('new-variation-input');
    var name = input ? input.value.trim() : '';
    if (!name) { app.setState({ error: 'Please enter a variation name.' }); return; }

    var current = getCurrentProductVariations();
    if (current.indexOf(name) !== -1) {
        app.setState({ error: 'Variation "' + name + '" already exists.' });
        return;
    }

    current.push(name);
    saveLocalVariations(s.product.uuid, current);

    var updatedProduct = Object.assign({}, s.product, { variations: current });
    app.setState({ product: updatedProduct, activeTab: 'variations', success: 'Variation "' + name + '" added (local).' });

    input.value = '';
}

async function handleRemoveVariation(idx) {
    var s = app.getState();
    if (!s.product) { app.setState({ error: 'No product selected.' }); return; }

    var current = getCurrentProductVariations();
    if (idx < 0 || idx >= current.length) return;

    var removed = current[idx];
    current.splice(idx, 1);
    saveLocalVariations(s.product.uuid, current);

    var updatedProduct = Object.assign({}, s.product, { variations: current });
    app.setState({ product: updatedProduct, activeTab: 'variations', success: 'Variation "' + removed + '" removed (local).' });
}

// ========== PRICE HANDLERS ==========

async function handleAddPrice() {
    var s = app.getState();
    if (!s.selectedFile || !s.product) { app.setState({ error: 'No product selected.' }); return; }

    var priceInput = document.getElementById('price-input');
    var currencyInput = document.getElementById('currency-input');
    var variationSelect = document.getElementById('variation-select');
    var packageTypeInput = document.getElementById('price-package-type');
    var innerCountInput = document.getElementById('price-inner-count');
    var innerOuterInput = document.getElementById('price-inner-outer-count');
    var notesInput = document.getElementById('price-notes');

    var price = parseFloat(priceInput ? priceInput.value : '');
    if (isNaN(price) || price <= 0) { app.setState({ error: 'Please enter a valid price.' }); return; }

    var currency = (currencyInput ? currencyInput.value : s.settings.currency || 'USD').toUpperCase().trim();
    if (currency.length !== 3) { app.setState({ error: 'Currency must be 3 letters (e.g. USD).' }); return; }

    var variation = variationSelect ? variationSelect.value : '';
    var packageType = packageTypeInput ? packageTypeInput.value : '';
    var innerCount = innerCountInput ? parseInt(innerCountInput.value) || 0 : 0;
    var innerOuter = innerOuterInput ? parseInt(innerOuterInput.value) || 0 : 0;
    var notes = notesInput ? notesInput.value.trim() : '';

    app.setState({ loading: true, error: '', success: '' });
    try {
        await api.addPrice(s.selectedFile, currency, variation, price);

        // After successful add, store the extra fields in localStorage
        var history = await api.getPriceHistory(s.selectedFile);
        if (history && history.length > 0) {
            var latest = history[history.length - 1];
            if (packageType || innerCount > 0 || innerOuter > 0 || notes) {
                saveLocalPriceExtras(s.product.uuid, latest.timestamp, {
                    packageType: packageType,
                    innerPackageCount: innerCount,
                    innerOuterCount: innerOuter,
                    notes: notes
                });
            }
        }

        // Clear form
        if (priceInput) priceInput.value = '';
        if (notesInput) notesInput.value = '';
        if (packageTypeInput) packageTypeInput.value = '';
        if (innerCountInput) innerCountInput.value = '0';
        if (innerOuterInput) innerOuterInput.value = '0';

        // Reload product and price history
        var product = await api.openProduct(s.selectedFile);
        var localVars = loadLocalVariations(product.uuid);
        if (localVars) product.variations = localVars.variations;

        app.setState({ product: product, priceHistory: history, loading: false, success: 'Added ' + currency + ' ' + price.toFixed(2) });
    } catch (err) {
        app.setState({ loading: false, error: 'Failed to add price: ' + err.message });
    }
}

async function loadPriceHistory() {
    var s = app.getState();
    if (!s.selectedFile) return;
    try {
        var history = await api.getPriceHistory(s.selectedFile);
        app.setState({ priceHistory: history || [] });
    } catch (err) {
        console.warn('Failed to load price history:', err);
    }
}

// ========== SETTINGS ==========

function openSettings() {
    app.setState({ showSettings: true });
}

function closeSettings() {
    app.setState({ showSettings: false });
}

async function saveSettings() {
    var company = document.getElementById('settings-company').value.trim();
    var currency = document.getElementById('settings-currency').value.trim().toUpperCase();
    var productsDir = document.getElementById('settings-products-dir').value.trim();

    if (currency.length !== 3) {
        app.setState({ error: 'Currency must be 3 letters (e.g. USD).' });
        return;
    }

    var settings = { company: company, currency: currency };
    if (productsDir) {
        settings.defaultDir = productsDir;
    }

    try {
        await api.saveSettings(settings);
        app.setState({
            settings: settings,
            defaultDir: productsDir,
            showSettings: false,
            success: 'Settings saved.',
        });

        // If directory changed, reload it
        if (productsDir && productsDir !== app.getState().currentDir) {
            galleryAbort = true;
            loadDirectory(productsDir);
        }
    } catch (err) {
        app.setState({ error: 'Failed to save settings: ' + err.message });
    }
}

// ========== UTILITY ==========

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ========== WEBKIT DIALOG SHIM ==========
// WebKitGTK 2.50+ silently returns null for prompt() and false for confirm().
// Replace with custom implementations that work in any browser/WebView.

var _confirmCallback = null;

function _showConfirmDialog(msg) {
    return new Promise(function(resolve) {
        var overlay = document.getElementById('confirm-overlay');
        var messageEl = document.getElementById('confirm-message');
        var yesBtn = document.getElementById('confirm-yes');
        var noBtn = document.getElementById('confirm-no');

        messageEl.textContent = msg;
        overlay.classList.add('open');

        function cleanup(result) {
            overlay.classList.remove('open');
            resolve(result);
        }

        yesBtn.onclick = function() { cleanup(true); };
        noBtn.onclick = function() { cleanup(false); };
    });
}

function _showPromptDialog(msg, defaultVal) {
    return new Promise(function(resolve) {
        var overlay = document.getElementById('prompt-overlay');
        var messageEl = document.getElementById('prompt-message');
        var inputEl = document.getElementById('prompt-input');
        var okBtn = document.getElementById('prompt-ok');
        var cancelBtn = document.getElementById('prompt-cancel');

        messageEl.textContent = msg;
        inputEl.value = defaultVal || '';
        overlay.classList.add('open');

        function cleanup(result) {
            overlay.classList.remove('open');
            resolve(result);
        }

        okBtn.onclick = function() { cleanup(inputEl.value); };
        cancelBtn.onclick = function() { cleanup(null); };
        inputEl.onkeydown = function(e) {
            if (e.key === 'Enter') okBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        };

        setTimeout(function() { inputEl.focus(); }, 100);
    });
}

// Override the native synchronous prompt/confirm with async versions
// Usage: await _showPromptDialog(...), await _showConfirmDialog(...)

// ========== COMPANY EDITOR ==========

function renderCompanyEditor(container) {
    var dir = companyEditorState.directory || app.getState().currentDir;
    if (!dir) {
        container.innerHTML = '<div class="empty-tab">No directory selected.</div>';
        return;
    }

    var compFile = Company.findCompanyFile(dir);
    var html = '<div class="company-editor">';
    html += '<div class="section-header">🏢 Company — ' + escapeHtml(dir.split('/').pop()) + '</div>';
    html += '<div style="padding:16px;text-align:center">';
    html += '<p style="color:var(--text-secondary);margin-bottom:16px">Company information is now edited in the dedicated <strong>Company Editor</strong> application.</p>';
    if (compFile && compFile.endsWith('.comp')) {
        html += '<button class="btn btn-primary" data-action="open-comp-external" data-comp-path="' + escapeHtml(dir + '/' + compFile) + '" style="font-size:15px;padding:10px 24px">🏢 Open in Company Editor</button>';
    } else {
        html += '<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Right-click a company .comp file in the gallery and open with Company Editor.</p>';
    }
    html += '</div>';
    html += '<div style="margin-top:16px;padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius)">';
    html += '<div class="section-header">📋 Deals</div>';
    html += '<div id="company-deals-list">Loading...</div>';
    html += '</div>';
    html += '</div>';
    container.innerHTML = html;

    // Wire up open in editor button
    var openBtn = container.querySelector('[data-action="open-comp-external"]');
    if (openBtn) {
        openBtn.addEventListener('click', function() {
            api.openSystem(openBtn.dataset.compPath);
        });
    }

    // Load and render deals list
    loadDealsForCompany(dir);
}

var _dealEditorState = null; // { deal: {}, isNew: bool }
var _editingContactIdx = -1;

function showContactForm(idx) {
    _editingContactIdx = idx;
    var editor = document.getElementById('contact-editor');
    editor.style.display = 'block';
    document.getElementById('contact-editor-title').textContent = idx >= 0 ? 'Edit Contact' : 'Add Contact';
    
    var fields = ['fn', 'n', 'tel', 'email', 'org', 'role', 'title', 'adr', 'note', 'bday', 'url', 'categories'];
    fields.forEach(function(f) {
        var el = document.getElementById('contact-' + f + '-input');
        if (el) el.value = '';
    });
    
    if (idx >= 0 && companyEditorState.company && companyEditorState.company.contacts) {
        var contact = companyEditorState.company.contacts[idx];
        if (contact) {
            fields.forEach(function(f) {
                var el = document.getElementById('contact-' + f + '-input');
                if (el && contact[f]) el.value = String(contact[f]);
            });
        }
    }
    
    document.getElementById('contact-form-status').textContent = '';
    editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideContactForm() {
    document.getElementById('contact-editor').style.display = 'none';
    _editingContactIdx = -1;
}

async function handleContactSave() {
    var fn = document.getElementById('contact-fn-input').value.trim();
    if (!fn) {
        document.getElementById('contact-form-status').textContent = '❌ Full name is required';
        return;
    }
    
    var contact = {
        fn: fn,
        n: document.getElementById('contact-n-input').value.trim(),
        tel: document.getElementById('contact-tel-input').value.trim(),
        email: document.getElementById('contact-email-input').value.trim(),
        org: document.getElementById('contact-org-input').value.trim(),
        role: document.getElementById('contact-role-input').value.trim(),
        title: document.getElementById('contact-title-input').value.trim(),
        adr: document.getElementById('contact-adr-input').value.trim(),
        note: document.getElementById('contact-note-input').value.trim(),
        bday: document.getElementById('contact-bday-input').value.trim(),
        url: document.getElementById('contact-url-input').value.trim(),
        categories: document.getElementById('contact-categories-input').value.trim(),
    };
    
    document.getElementById('contact-form-status').textContent = '⏳ Saving...';
    try {
        var result;
        if (_editingContactIdx >= 0) {
            result = await api.updateContact(companyEditorState.directory, _editingContactIdx, contact);
        } else {
            result = await api.addContact(companyEditorState.directory, contact);
        }
        companyEditorState.company = result;
        hideContactForm();
        renderCompanyEditor(document.getElementById('tab-content'));
        document.getElementById('contact-form-status').textContent = '';
        app.setState({ success: 'Contact saved.' });
    } catch (err) {
        document.getElementById('contact-form-status').textContent = '❌ ' + err.message;
    }
}

async function handleCompanySave() {
    var company = companyEditorState.company;
    company.name = document.getElementById('company-name-input').value.trim();
    company.company_type = document.getElementById('company-type-select').value;
    company.address = document.getElementById('company-address-input').value.trim();
    company.website = document.getElementById('company-website-input').value.trim();
    
    var emailInputs = document.querySelectorAll('.company-email-input');
    company.emails = Array.from(emailInputs).map(function(el) { return el.value.trim(); }).filter(Boolean);
    
    var phoneInputs = document.querySelectorAll('.company-phone-input');
    company.phones = Array.from(phoneInputs).map(function(el) { return el.value.trim(); }).filter(Boolean);
    
    document.getElementById('company-save-btn').textContent = '⏳ Saving...';
    document.getElementById('company-save-btn').disabled = true;
    try {
        var result = await api.saveCompany(companyEditorState.directory, company);
        companyEditorState.company = result;
        app.setState({ success: 'Company saved.' });
        loadDirectory(app.getState().currentDir);
    } catch (err) {
        app.setState({ error: 'Failed to save company: ' + err.message });
    } finally {
        document.getElementById('company-save-btn').textContent = '💾 Save Company';
        document.getElementById('company-save-btn').disabled = false;
    }
}

function handleCompanyAddEmail() {
    var list = document.getElementById('company-emails-list');
    var idx = list.querySelectorAll('.company-email-input').length;
    var row = document.createElement('div');
    row.className = 'contact-field-row';
    row.innerHTML = '<input type="text" class="company-email-input" data-idx="' + idx + '" placeholder="email@example.com" /><button class="btn btn-xs btn-danger" data-action="company-remove-email" data-idx="' + idx + '">✕</button>';
    list.appendChild(row);
    row.querySelector('input').focus();
}

function handleCompanyAddPhone() {
    var list = document.getElementById('company-phones-list');
    var idx = list.querySelectorAll('.company-phone-input').length;
    var row = document.createElement('div');
    row.className = 'contact-field-row';
    row.innerHTML = '<input type="text" class="company-phone-input" data-idx="' + idx + '" placeholder="+123456789" /><button class="btn btn-xs btn-danger" data-action="company-remove-phone" data-idx="' + idx + '">✕</button>';
    list.appendChild(row);
    row.querySelector('input').focus();
}

// ========== COMPANY TAB SWITCHING ==========

function wireCompanyTabs() {
    var tabs = document.querySelectorAll('[data-company-tab]');
    tabs.forEach(function(btn) {
        btn.addEventListener('click', function() {
            companyEditorState._tab = btn.dataset.companyTab;
            renderCompanyEditor(document.getElementById('tab-content'));
        });
    });
}

// ========== DEALS TAB ==========

async function loadDealsForCompany(dir) {
    var listEl = document.getElementById('company-deals-list');
    if (!listEl) return;
    try {
        var deals = await api.listDeals(dir);
        if (!deals || deals.length === 0) {
            listEl.innerHTML = '<div class="empty-tab" style="padding:8px;font-size:13px">No deals in this directory.</div>';
            return;
        }
        var dh = '';
        deals.forEach(function(d) {
            var statusColor = 'var(--text-muted)';
            var statusEmoji = '⏳';
            if (d.status === 'confirmed') { statusColor = 'var(--accent-green)'; statusEmoji = '✅'; }
            else if (d.status === 'shipped') { statusColor = 'var(--accent-orange)'; statusEmoji = '🚚'; }
            else if (d.status === 'completed') { statusColor = 'var(--accent-green)'; statusEmoji = '🎉'; }
            else if (d.status === 'cancelled') { statusColor = 'var(--accent-red)'; statusEmoji = '🚫'; }
            dh += '<div class="deal-card" data-deal-file="' + escapeHtml(d.filename) + '" style="padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;cursor:pointer">';
            dh += '<div style="display:flex;justify-content:space-between;align-items:center">';
            dh += '<div><strong>' + escapeHtml(d.title || d.filename) + '</strong>';
            if (d.date) dh += ' <span style="font-size:11px;color:var(--text-muted)">(' + escapeHtml(d.date) + ')</span>';
            dh += '</div>';
            dh += '<span style="color:' + statusColor + ';font-size:11px;font-weight:600">' + statusEmoji + ' ' + escapeHtml(d.status) + '</span>';
            dh += '</div>';
            dh += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">';
            if (d.order_count) dh += '📦 ' + d.order_count + ' item(s) ';
            if (d.warehouse_records) dh += '📥 ' + d.warehouse_records + ' warehouse record(s)';
            dh += '</div>';
            dh += '</div>';
        });
        listEl.innerHTML = dh;
        listEl.querySelectorAll('.deal-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var dealPath = dir + '/Deals/' + card.dataset.dealFile;
                api.openSystem(dealPath);
            });
        });
    } catch (err) {
        if (listEl) listEl.innerHTML = '<div class="error-state" style="font-size:12px">Error: ' + escapeHtml(err.message) + '</div>';
    }
}

async function renderDealsList(container) {
    var dir = companyEditorState.directory;
    var html = '<div class="company-editor">';
    html += '<div class="section-header" style="display:flex;justify-content:space-between;align-items:center">';
    html += '<span>📋 Deals</span>';
    html += '</div>';
    html += '<div id="deals-list">Loading...</div>';
    html += '</div>';
    container.innerHTML = html;

    try {
        var deals = await api.listDeals(dir);
        var listEl = document.getElementById('deals-list');
        if (!deals || deals.length === 0) {
            listEl.innerHTML = '<div class="empty-tab" style="padding:16px">No deals in this directory.</div>';
        } else {
            var dh = '';
            deals.forEach(function(d) {
                var statusColor = 'var(--text-muted)';
                var statusEmoji = '⏳';
                if (d.status === 'confirmed') { statusColor = 'var(--accent-green)'; statusEmoji = '✅'; }
                else if (d.status === 'shipped') { statusColor = 'var(--accent-orange)'; statusEmoji = '🚚'; }
                else if (d.status === 'completed') { statusColor = 'var(--accent-green)'; statusEmoji = '🎉'; }
                else if (d.status === 'cancelled') { statusColor = 'var(--accent-red)'; statusEmoji = '🚫'; }
                dh += '<div class="deal-card" data-deal-file="' + escapeHtml(d.filename) + '" style="padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;cursor:pointer">';
                dh += '<div style="display:flex;justify-content:space-between;align-items:center">';
                dh += '<div><strong>' + escapeHtml(d.title || d.filename) + '</strong>';
                if (d.date) dh += ' <span style="font-size:12px;color:var(--text-muted)">(' + escapeHtml(d.date) + ')</span>';
                dh += '</div>';
                dh += '<span style="color:' + statusColor + ';font-size:12px;font-weight:600">' + statusEmoji + ' ' + escapeHtml(d.status) + '</span>';
                dh += '</div>';
                dh += '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">';
                if (d.order_count) dh += '📦 ' + d.order_count + ' item(s) ';
                if (d.warehouse_records) dh += '📥 ' + d.warehouse_records + ' warehouse record(s)';
                dh += '</div>';
                dh += '</div>';
            });
            listEl.innerHTML = dh;
            // Click to open externally in deal-editor
            listEl.querySelectorAll('.deal-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    var dealDir = dir + '/Deals';
                    var dealPath = dealDir + '/' + card.dataset.dealFile;
                    api.openSystem(dealPath);
                });
            });
        }
    } catch (err) {
        document.getElementById('deals-list').innerHTML = '<div class="error-state">Error: ' + escapeHtml(err.message) + '</div>';
    }
}


// ========== DEAL EDITOR ==========

function renderDealEditor(container) {
    // Decide: are we adding order items (tab='deals') or warehouse (tab='warehouse')?
    var tab = companyEditorState._tab || 'deals';
    if (tab === 'deals') {
        renderDealOrderEditor(container);
    } else {
        renderDealWarehouseEditor(container);
    }
}

async function openCompanyDealFromGallery(dir, filename) {
    // Open the .deal file externally in the dedicated deal-editor
    var dealPath = dir + '/Deals/' + filename;
    api.openSystem(dealPath);
}

async function openDealEditor(filename) {
    var dir = companyEditorState.directory;
    var dealDir = dir + '/Deals';
    if (filename) {
        api.openSystem(dealDir + '/' + filename);
    } else {
        alert('To create a new deal, use the dedicated Deal Editor app.');
    }
}


function renderDealOrderEditor(container) {
    var deal = _dealEditorState ? _dealEditorState.deal : null;
    if (!deal) { container.innerHTML = '<div class="empty-tab">Deal not loaded.</div>'; return; }

    var dir = companyEditorState.directory;

    var html = '<div class="company-editor">';
    // Back button + title
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
    html += '<div><button class="btn btn-sm" data-action="back-to-deals-list">← Back to Deals</button>';
    html += ' <strong>' + escapeHtml(deal.title || 'New Deal') + '</strong></div>';
    if (!_dealEditorState.isNew) {
        html += '<button class="btn btn-xs btn-danger" data-action="delete-deal">🗑 Delete</button>';
    }
    html += '</div>';

    // Deal metadata
    html += '<div class="form-row">';
    html += '<div class="form-group" style="flex:2"><label>Title</label><input type="text" id="deal-title-input" value="' + escapeHtml(deal.title) + '" /></div>';
    if (deal.filename) {
        html += '<div class="form-group" style="flex:1"><label>Filename</label><input type="text" id="deal-filename-input" value="' + escapeHtml(deal.filename) + '" style="font-size:11px" /></div>';
    }
    html += '<div class="form-group" style="flex:1"><label>Date</label><input type="date" id="deal-date-input" value="' + escapeHtml(deal.date || '') + '" /></div>';
    html += '<div class="form-group" style="flex:1"><label>Status</label>';
    html += '<select id="deal-status-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input);color:var(--text-primary);font-size:13px">';
    ['pending','confirmed','shipped','completed','cancelled'].forEach(function(s) {
        html += '<option value="' + s + '"' + (deal.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    });
    html += '</select></div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group" style="flex:1"><label>Default Currency</label><input type="text" id="deal-currency-input" value="' + escapeHtml(deal.currency || 'USD') + '" maxlength="3" /></div>';
    html += '<div class="form-group" style="flex:1"><label>Additional Costs</label><input type="number" step="0.01" id="deal-extra-costs" value="' + (deal.additional_costs || 0) + '" /></div>';
    html += '<div class="form-group" style="flex:1"><label>Costs Currency</label><input type="text" id="deal-extra-currency" value="' + escapeHtml(deal.additional_costs_currency || '') + '" maxlength="3" /></div>';
    html += '</div>';

    html += '<div class="form-group"><label>Notes</label><textarea id="deal-notes-input" rows="2" style="width:100%;padding:6px;resize:vertical">' + escapeHtml(deal.notes || '') + '</textarea></div>';

    html += '<div style="margin:12px 0;border-top:1px solid var(--border);padding-top:12px">';

    // Order items section
    html += '<div class="section-header" style="display:flex;justify-content:space-between;align-items:center">';
    html += '<span>📦 Order Items</span>';
    html += '<div><button class="btn btn-sm" data-action="browse-products" style="margin-right:6px">📂 Browse Products</button><button class="btn btn-sm btn-primary" data-action="add-order-item">➕ Add Item</button></div>';
    html += '</div>';

    var order = deal.order || [];
    if (order.length === 0) {
        html += '<div class="empty-tab" style="padding:8px;font-size:13px">No items in this order yet.</div>';
    } else {
        html += '<div style="overflow-x:auto">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">';
        html += '<thead><tr style="background:var(--bg-hover);text-align:left">';
        html += '<th style="padding:6px;width:200px">Product</th><th style="padding:6px">Min</th><th style="padding:6px">Qty</th><th style="padding:6px">Unit Price</th><th style="padding:6px">Cur</th><th style="padding:6px">Total</th><th style="padding:6px">Notes</th><th style="padding:6px">Photo</th><th style="padding:6px"></th>';
        html += '</tr></thead><tbody>';
        order.forEach(function(item, idx) {
            var thumbHtml = '';
            if (item._photo) {
                thumbHtml = '<img src="' + item._photo + '" style="width:32px;height:32px;object-fit:cover;border-radius:4px;vertical-align:middle" />';
            } else {
                thumbHtml = '<span style="font-size:16px">📦</span>';
            }
            var titleText = item.product_title || item.product.split('/').pop().replace(/\.prod$/, '');
            var codeText = item._code || '';
            html += '<tr data-order-idx="' + idx + '">';
            html += '<td style="padding:4px"><div style="display:flex;align-items:center;gap:6px"><div class="deal-order-thumb">' + thumbHtml + '</div><div><div class="deal-order-title" style="font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px">' + escapeHtml(titleText) + '</div>' + (codeText ? '<div class="deal-order-code" style="font-size:10px;color:var(--text-muted)">' + escapeHtml(codeText) + '</div>' : '<div class="deal-order-code" style="font-size:10px;color:var(--text-muted)"></div>') + '</div></div></td>';
            html += '<td style="padding:4px"><input type="number" class="deal-order-minqty" value="' + (item.min_qty || 0) + '" style="width:40px;padding:3px 4px;font-size:12px" /></td>';
            html += '<td style="padding:4px"><input type="number" class="deal-order-qty" value="' + (item.quantity || 0) + '" style="width:50px;padding:3px 4px;font-size:12px" /></td>';
            html += '<td style="padding:4px"><input type="number" step="0.01" class="deal-order-price" value="' + (item.unit_price || 0) + '" style="width:70px;padding:3px 4px;font-size:12px" /></td>';
            html += '<td style="padding:4px"><input type="text" class="deal-order-currency" value="' + escapeHtml(item.currency || '') + '" maxlength="3" style="width:40px;padding:3px 4px;font-size:12px" /></td>';
            html += '<td style="padding:4px"><input type="number" step="0.01" class="deal-order-total" value="' + (item.total || 0) + '" style="width:75px;padding:3px 4px;font-size:12px" /></td>';
            html += '<td style="padding:4px"><input type="text" class="deal-order-notes" value="' + escapeHtml(item.notes || '') + '" style="width:70px;padding:3px 4px;font-size:12px" /></td>';
            html += '<td style="padding:4px;text-align:center" class="deal-order-photo">' + thumbHtml + '</td>';
            html += '<td style="padding:4px"><button class="btn btn-xs btn-danger" data-action="remove-order-item" data-idx="' + idx + '">✕</button></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '</div>';
    }
    html += '</div>';

    // Save button
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += '<button class="btn btn-primary" id="deal-save-btn">💾 Save Deal</button>';
    html += ' <span id="deal-save-status" style="font-size:12px;color:var(--text-muted);margin-left:8px"></span>';
    html += '</div>';

    html += '</div>'; // company-editor close
    container.innerHTML = html;
    
    // After rendering, resolve product paths and fetch thumbnails
    _resolveDealProductPaths(dir, deal);

    wireDealOrderEditor(dir);
}


function _resolveDealProductPaths(companyDir, deal) {
    // Resolve product paths relative to company directory (deals are in Deals/ subfolder)
    var order = deal.order || [];
    order.forEach(function(item, idx) {
        var resolvedPath = item.product;
        // If it's not an absolute path, resolve relative to companyDir
        if (resolvedPath && resolvedPath.indexOf('/') !== 0) {
            resolvedPath = companyDir + '/' + resolvedPath;
        }
        // Fetch product data for display
        api.openProduct(resolvedPath).then(function(prod) {
            var row = document.querySelector('tr[data-order-idx="' + idx + '"]');
            if (!row) return;
            var thumbCell = row.querySelector('.deal-order-thumb');
            var photoCell = row.querySelector('.deal-order-photo');
            if (prod.photos && prod.photos.length > 0) {
                var imgHtml = '<img src="' + prod.photos[0] + '" style="width:32px;height:32px;object-fit:cover;border-radius:4px;vertical-align:middle" />';
                if (thumbCell) thumbCell.innerHTML = imgHtml;
                if (photoCell) photoCell.innerHTML = imgHtml;
            }
            // Update code
            var codeEl = row.querySelector('.deal-order-code');
            if (codeEl && prod.code) codeEl.textContent = prod.code;
            // Update product title
            var titleEl = row.querySelector('.deal-order-title');
            if (titleEl && prod.title) titleEl.textContent = prod.title;
        }).catch(function() {});
    });
}


function wireDealOrderEditor(dir) {
    var deal = _dealEditorState.deal;

    // Back button
    var backBtn = document.querySelector('[data-action="back-to-deals-list"]');
    if (backBtn) backBtn.addEventListener('click', function() {
        companyEditorState._tab = 'deals';
        _dealEditorState = null;
        renderCompanyEditor(document.getElementById('tab-content'));
    });

    // Delete button
    var delBtn = document.querySelector('[data-action="delete-deal"]');
    if (delBtn) delBtn.addEventListener('click', async function() {
        if (!confirm('Delete this deal?')) return;
        try {
            await api.deleteDeal(dir, deal.filename);
            companyEditorState._tab = 'deals';
            _dealEditorState = null;
            renderCompanyEditor(document.getElementById('tab-content'));
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    });

    // Add order item
    var addBtn = document.querySelector('[data-action="add-order-item"]');
    if (addBtn) addBtn.addEventListener('click', function() {
        deal.order.push({
            product: '', product_title: '',
            quantity: 0, unit_price: 0, currency: '',
            total: 0, notes: ''
        });
        renderDealOrderEditor(document.getElementById('tab-content'));
    });

    // Browse products button
    var browseBtn = document.querySelector('[data-action="browse-products"]');
    if (browseBtn) browseBtn.addEventListener('click', function() {
        showProductPickerForDeal(dir, deal);
    });

    // Remove order items (delegated)
    var container = document.getElementById('tab-content');
    container.querySelectorAll('[data-action="remove-order-item"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(btn.dataset.idx);
            deal.order.splice(idx, 1);
            renderDealOrderEditor(document.getElementById('tab-content'));
        });
    });

    // Save button
    document.getElementById('deal-save-btn').addEventListener('click', async function() {
        gatherDealFormData(deal);
        var statusEl = document.getElementById('deal-save-status');
        statusEl.textContent = 'Saving...';
        try {
            // Always update filename from form (if filename input visible) or auto-generate
            var fnFromInput = document.getElementById('deal-filename-input');
            if (fnFromInput) {
                deal.filename = fnFromInput.value.trim();
            }
            if (!deal.filename) {
                deal.filename = generateDealFilename(deal);
            }
            var result = await api.saveDeal(dir, deal);
            _dealEditorState.isNew = false;
            statusEl.textContent = '✅ Saved at ' + new Date().toLocaleTimeString();
            // Update the deal state with saved version
            _dealEditorState.deal = result;
        } catch (err) {
            statusEl.textContent = '❌ Error: ' + err.message;
        }
    });
}


function gatherDealFormData(deal) {
    deal.title = document.getElementById('deal-title-input').value.trim();
    deal.date = document.getElementById('deal-date-input').value;
    deal.status = document.getElementById('deal-status-select').value;
    var fnInput = document.getElementById('deal-filename-input');
    if (fnInput) {
        deal.filename = fnInput.value.trim();
    }
    deal.currency = document.getElementById('deal-currency-input').value.trim().toUpperCase();
    deal.additional_costs = parseFloat(document.getElementById('deal-extra-costs').value) || 0;
    deal.additional_costs_currency = document.getElementById('deal-extra-currency').value.trim().toUpperCase();
    deal.notes = document.getElementById('deal-notes-input').value.trim();

    // Gather order items from table
    deal.order = [];
    var rows = document.querySelectorAll('#tab-content tbody tr');
    rows.forEach(function(row) {
        var item = {
            product: (row.querySelector('.deal-order-product') || {}).value || '',
            product_title: '',
            quantity: parseInt((row.querySelector('.deal-order-qty') || {}).value) || 0,
            min_qty: parseInt((row.querySelector('.deal-order-minqty') || {}).value) || 0,
            unit_price: parseFloat((row.querySelector('.deal-order-price') || {}).value) || 0,
            currency: (row.querySelector('.deal-order-currency') || {}).value || '',
            total: parseFloat((row.querySelector('.deal-order-total') || {}).value) || 0,
            notes: (row.querySelector('.deal-order-notes') || {}).value || ''
        };
        if (item.product) deal.order.push(item);
    });
}


// ========== PRODUCT PICKER FOR DEALS ==========

var _productPickerDeal = null;
var _productPickerDir = null;

function showProductPickerForDeal(dir, deal) {
    _productPickerDeal = deal;
    _productPickerDir = dir;

    // Build a modal overlay with product listing
    var s = app.getState();
    var files = s.files || [];

    var overlay = document.getElementById('product-picker-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'product-picker-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeProductPicker();
        });
    }

    var html = '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);width:600px;max-height:80vh;display:flex;flex-direction:column">';
    html += '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">';
    html += '<strong>📂 Select Products to Add to Deal</strong>';
    html += '<button class="btn btn-sm" id="picker-close-btn">✕</button>';
    html += '</div>';
    html += '<div style="padding:8px 16px"><input type="text" id="picker-filter" placeholder="Filter products..." style="width:100%;padding:6px 8px" /></div>';
    html += '<div id="picker-list" style="overflow-y:auto;flex:1;padding:8px 16px">';

    if (files.length === 0) {
        html += '<div class="empty-tab">No .prod files in the current directory.</div>';
    } else {
        files.forEach(function(file, idx) {
            var displayName = file.split('/').pop().replace(/\.prod$/, '');
            var checked = '';
            // Check if already in deal
            if (deal.order && deal.order.some(function(o) { return o.product === file; })) {
                checked = ' checked';
            }
            html += '<label style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer">';
            html += '<input type="checkbox" class="picker-item-cb" value="' + escapeHtml(file) + '" ' + checked + ' style="margin-right:10px" />';
            html += '<span>' + escapeHtml(displayName) + '</span>';
            html += '<span style="margin-left:auto;font-size:11px;color:var(--text-muted)">' + escapeHtml(file) + '</span>';
            html += '</label>';
        });
    }

    html += '</div>';
    html += '<div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">';
    html += '<button class="btn" id="picker-cancel-btn">Cancel</button>';
    html += '<button class="btn btn-primary" id="picker-add-to-deal-btn">➕ Add Selected to Deal</button>';
    html += '</div>';
    html += '</div>';

    overlay.innerHTML = html;
    overlay.style.display = 'flex';

    // Filter
    var filterInput = document.getElementById('picker-filter');
    if (filterInput) {
        filterInput.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            document.querySelectorAll('#picker-list label').forEach(function(label) {
                label.style.display = label.textContent.toLowerCase().indexOf(q) >= 0 ? 'flex' : 'none';
            });
        });
    }

    document.getElementById('picker-close-btn').addEventListener('click', closeProductPicker);
    document.getElementById('picker-cancel-btn').addEventListener('click', closeProductPicker);
    document.getElementById('picker-add-to-deal-btn').addEventListener('click', async function() {
        var cbs = document.querySelectorAll('.picker-item-cb:checked');
        if (cbs.length === 0) { closeProductPicker(); return; }

        // Get deal currency for defaults
        var dealCurrency = document.getElementById('deal-currency-input');
        var defaultCur = dealCurrency ? dealCurrency.value.trim().toUpperCase() : 'USD';

        for (var ci = 0; ci < cbs.length; ci++) {
            var filePath = cbs[ci].value;
            // Check if already exists — skip if so
            if (deal.order.some(function(o) { return o.product === filePath; })) continue;
            var displayName = filePath.split('/').pop().replace(/\.prod$/, '');
            
            // Try to load product data to get price, code, photo
            var unitPrice = 0;
            var code = '';
            var firstPhoto = null;
            try {
                var prodData = await api.openProduct(filePath);
                code = prodData.code || '';
                if (prodData.photos && prodData.photos.length > 0) {
                    firstPhoto = prodData.photos[0];
                }
                // Get latest price
                if (prodData.priceCount > 0) {
                    try {
                        var hist = await api.getPriceHistory(filePath);
                        if (hist && hist.length > 0) {
                            var latest = hist[hist.length - 1];
                            unitPrice = latest.price || 0;
                        }
                    } catch (e) { /* ignore price fetch errors */ }
                }
            } catch (e) { /* product might not be loadable */ }
            
            deal.order.push({
                product: filePath,
                product_title: displayName,
                quantity: 1,
                unit_price: unitPrice,
                currency: defaultCur,
                total: unitPrice,
                notes: '',
                _photo: firstPhoto,
                _code: code
            });
        }

        closeProductPicker();
        renderDealOrderEditor(document.getElementById('tab-content'));
    });
}


function closeProductPicker() {
    var overlay = document.getElementById('product-picker-overlay');
    if (overlay) overlay.style.display = 'none';
    _productPickerDeal = null;
    _productPickerDir = null;
}


function generateDealFilename(deal) {
    var d = deal.date || new Date().toISOString().slice(0, 10);
    var safe = (deal.title || 'untitled').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    return d + '-' + (safe || 'untitled') + '.deal';
}


// ========== WAREHOUSE TAB ==========

async function renderWarehouseTab(container) {
    var dir = companyEditorState.directory;
    var html = '<div class="company-editor">';
    html += '<div class="section-header" style="display:flex;justify-content:space-between;align-items:center">';
    html += '<span>📦 Warehouse</span>';
    html += '<button class="btn btn-sm btn-primary" data-action="new-warehouse-entry">➕ New Receipt</button>';
    html += '</div>';
    html += '<div id="warehouse-list">Loading...</div>';
    html += '</div>';
    container.innerHTML = html;

    try {
        var deals = await api.listDeals(dir);
        var listEl = document.getElementById('warehouse-list');
        // Collect all warehouse records from all deals
        var allRecords = [];
        if (deals) {
            deals.forEach(function(d) {
                if (d.warehouse_records > 0) {
                    allRecords.push({ deal: d });
                }
            });
        }
        if (allRecords.length === 0) {
            listEl.innerHTML = '<div class="empty-tab" style="padding:16px">No warehouse records yet. Create a deal with warehouse entries.</div>';
        } else {
            var wh = '';
            for (var i = 0; i < allRecords.length; i++) {
                var d = allRecords[i].deal;
                try {
                    var full = await api.getDeal(dir, d.filename);
                    if (full.warehouse && full.warehouse.length > 0) {
                        full.warehouse.forEach(function(wr) {
                            wh += '<div class="deal-card" style="padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px">';
                            wh += '<div style="display:flex;justify-content:space-between">';
                            wh += '<div><strong>' + escapeHtml(full.title || full.filename) + '</strong>';
                            if (wr.date) wh += ' <span style="font-size:12px;color:var(--text-muted)">receipt ' + escapeHtml(wr.date) + '</span>';
                            wh += '</div>';
                            wh += '<button class="btn btn-xs" data-action="open-deal-warehouse" data-deal-file="' + escapeHtml(d.filename) + '">✏️ Edit</button>';
                            wh += '</div>';
                            if (wr.items && wr.items.length > 0) {
                                wh += '<div style="font-size:12px;color:var(--text-muted);margin-top:6px">';
                                wr.items.forEach(function(wi) {
                                    wh += '📦 ' + escapeHtml(wi.product_title || wi.product) + ' × ' + wi.quantity + '<br>';
                                });
                                wh += '</div>';
                            }
                            wh += '</div>';
                        });
                    }
                } catch (err) {}
            }
            listEl.innerHTML = wh || '<div class="empty-tab">No warehouse records with items.</div>';
            // Wire edit buttons — open externally in deal-editor
            listEl.querySelectorAll('[data-action="open-deal-warehouse"]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var dealPath = dir + '/Deals/' + btn.dataset.dealFile;
                    api.openSystem(dealPath);
                });
            });
        }
    } catch (err) {
        document.getElementById('warehouse-list').innerHTML = '<div class="error-state">Error: ' + escapeHtml(err.message) + '</div>';
    }

    var newBtn = container.querySelector('[data-action="new-warehouse-entry"]');
    if (newBtn) newBtn.addEventListener('click', function() {
        alert('To create a new deal with warehouse entries, use the dedicated Deal Editor app.');
    });
}


function renderDealWarehouseEditor(container) {
    var deal = _dealEditorState ? _dealEditorState.deal : null;
    if (!deal) { container.innerHTML = '<div class="empty-tab">Deal not loaded.</div>'; return; }

    var dir = companyEditorState.directory;

    var html = '<div class="company-editor">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
    html += '<div><button class="btn btn-sm" data-action="back-to-warehouse-list">← Back to Warehouse</button>';
    html += ' <strong>📦 ' + escapeHtml(deal.title || deal.filename) + '</strong></div>';
    html += '</div>';

    // Warehouse records
    html += '<div class="section-header" style="display:flex;justify-content:space-between;align-items:center">';
    html += '<span>Receipt Records</span>';
    html += '<button class="btn btn-sm btn-primary" data-action="add-warehouse-record">➕ Add Receipt</button>';
    html += '</div>';

    var warehouse = deal.warehouse || [];
    if (warehouse.length === 0) {
        html += '<div class="empty-tab" style="padding:8px;font-size:13px">No warehouse receipts yet.</div>';
    } else {
        warehouse.forEach(function(wr, wrIdx) {
            html += '<div class="warehouse-record" data-wr-idx="' + wrIdx + '" style="margin-top:8px;padding:10px;background:var(--bg-hover);border:1px solid var(--border);border-radius:var(--radius)">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center">';
            html += '<label>Receipt Date: <input type="date" class="wr-date" value="' + escapeHtml(wr.date || '') + '" style="font-size:12px" /></label>';
            html += '<button class="btn btn-xs btn-danger" data-action="remove-warehouse-record" data-idx="' + wrIdx + '">✕ Remove</button>';
            html += '</div>';
            html += '<div style="margin-top:8px">';
            html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
            html += '<thead><tr style="background:var(--bg-surface);text-align:left">';
            html += '<th style="padding:4px">Product</th><th style="padding:4px">Qty</th><th style="padding:4px"></th>';
            html += '</tr></thead><tbody>';
            var items = wr.items || [];
            items.forEach(function(item, itemIdx) {
                html += '<tr>';
                html += '<td style="padding:2px"><input type="text" class="wr-product" value="' + escapeHtml(item.product || '') + '" placeholder="path/to/prod" style="width:180px;padding:2px 4px;font-size:12px" /></td>';
                html += '<td style="padding:2px"><input type="number" class="wr-qty" value="' + (item.quantity || 0) + '" style="width:60px;padding:2px 4px;font-size:12px" /></td>';
                html += '<td style="padding:2px"><button class="btn btn-xs btn-danger" data-action="remove-warehouse-item" data-wr="' + wrIdx + '" data-idx="' + itemIdx + '">✕</button></td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
            html += '<button class="btn btn-xs" data-action="add-warehouse-item" data-idx="' + wrIdx + '" style="margin-top:4px">➕ Add Item</button>';
            html += '</div></div>';
        });
    }

    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += '<button class="btn btn-primary" id="deal-wh-save-btn">💾 Save Deal</button>';
    html += ' <span id="deal-wh-status" style="font-size:12px;color:var(--text-muted);margin-left:8px"></span>';
    html += '</div>';
    html += '</div>';
    container.innerHTML = html;

    wireDealWarehouseEditor(dir);
}


function wireDealWarehouseEditor(dir) {
    var deal = _dealEditorState.deal;

    var backBtn = document.querySelector('[data-action="back-to-warehouse-list"]');
    if (backBtn) backBtn.addEventListener('click', function() {
        companyEditorState._tab = 'warehouse';
        _dealEditorState = null;
        renderCompanyEditor(document.getElementById('tab-content'));
    });

    var addRecBtn = document.querySelector('[data-action="add-warehouse-record"]');
    if (addRecBtn) addRecBtn.addEventListener('click', function() {
        deal.warehouse.push({ date: '', items: [] });
        renderDealWarehouseEditor(document.getElementById('tab-content'));
    });

    var container = document.getElementById('tab-content');
    container.querySelectorAll('[data-action="remove-warehouse-record"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(btn.dataset.idx);
            deal.warehouse.splice(idx, 1);
            renderDealWarehouseEditor(document.getElementById('tab-content'));
        });
    });

    container.querySelectorAll('[data-action="remove-warehouse-item"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var wrIdx = parseInt(btn.dataset.wr);
            var idx = parseInt(btn.dataset.idx);
            if (deal.warehouse[wrIdx]) {
                deal.warehouse[wrIdx].items.splice(idx, 1);
                renderDealWarehouseEditor(document.getElementById('tab-content'));
            }
        });
    });

    container.querySelectorAll('[data-action="add-warehouse-item"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var wrIdx = parseInt(btn.dataset.idx);
            if (deal.warehouse[wrIdx]) {
                deal.warehouse[wrIdx].items.push({ product: '', product_title: '', quantity: 0 });
                renderDealWarehouseEditor(document.getElementById('tab-content'));
            }
        });
    });

    document.getElementById('deal-wh-save-btn').addEventListener('click', async function() {
        gatherWarehouseFormData(deal);
        var statusEl = document.getElementById('deal-wh-status');
        statusEl.textContent = 'Saving...';
        try {
            if (_dealEditorState.isNew && !deal.filename) {
                deal.filename = generateDealFilename(deal);
            }
            var result = await api.saveDeal(dir, deal);
            _dealEditorState.isNew = false;
            _dealEditorState.deal = result;
            statusEl.textContent = '✅ Saved at ' + new Date().toLocaleTimeString();
        } catch (err) {
            statusEl.textContent = '❌ Error: ' + err.message;
        }
    });
}


function gatherWarehouseFormData(deal) {
    var container = document.getElementById('tab-content');
    deal.warehouse = [];
    container.querySelectorAll('.warehouse-record').forEach(function(rec) {
        var wr = { date: '', items: [] };
        wr.date = (rec.querySelector('.wr-date') || {}).value || '';
        var rows = rec.querySelectorAll('tbody tr');
        rows.forEach(function(row) {
            var product = (row.querySelector('.wr-product') || {}).value || '';
            var qty = parseInt((row.querySelector('.wr-qty') || {}).value) || 0;
            if (product) {
                wr.items.push({ product: product, product_title: '', quantity: qty });
            }
        });
        if (wr.items.length > 0) deal.warehouse.push(wr);
    });
}


async function handleOpenCompanyEditor(subdirPath) {
    // Open externally in company-editor
    var compFile = Company.findCompanyFile(subdirPath);
    if (compFile && compFile.endsWith('.comp')) {
        api.openSystem(subdirPath + '/' + compFile);
    } else {
        app.setState({ error: 'No .comp file found in this directory.' });
    }
}

function handleNavigateSubdir(fullPath) {
    // Handle ".." — navigate to parent
    if (fullPath.endsWith('/..')) {
        var parent = getParentDir(app.getState().currentDir);
        if (!parent) return;
        fullPath = parent;
    }

    app.setState({ defaultDir: fullPath });
    loadDirectory(fullPath);
}

// ========== STARTUP ==========
document.addEventListener('DOMContentLoaded', init);
