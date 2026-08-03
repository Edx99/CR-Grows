// Shared app state sync helper for CR Grows pages
const APP_STATE_API_PATH = '/api/state';

function parseJwt(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function getAuthToken() {
    return localStorage.getItem('token');
}

function getUserScopedStorageKey(prefix) {
    const token = getAuthToken();
    const payload = parseJwt(token);
    const email = payload?.email || '';
    const suffix = String(email).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'anonymous';
    return `${prefix}_${suffix}`;
}

function getAppStateLocalKey() {
    return getUserScopedStorageKey('cr_grows_app_state');
}

function normalizeTemplates(templates, ownerEmail) {
    if (!Array.isArray(templates)) return [];
    return templates.map(item => ({ ...item, ownerEmail: item?.ownerEmail || ownerEmail || '' }));
}

function filterTemplatesForOwner(templates, ownerEmail) {
    const normalized = normalizeTemplates(templates, ownerEmail);
    if (!ownerEmail) return normalized;
    return normalized.filter(item => !item.ownerEmail || item.ownerEmail === ownerEmail);
}

async function apiFetch(method, path, body) {
    try {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        const token = getAuthToken();
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(path, opts);
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        console.warn('apiFetch error:', err);
        return { ok: false, status: 0, data: null, error: err.message };
    }
}

function ensureAppState(state) {
    const base = state && typeof state === 'object' ? { ...state } : {};
    base.days = base.days && typeof base.days === 'object' ? base.days : {};
    base.weekly = Array.isArray(base.weekly) ? base.weekly : [];
    base.streak = typeof base.streak === 'number' ? base.streak : 0;
    base.helpSettings = base.helpSettings && typeof base.helpSettings === 'object' ? { ...base.helpSettings } : {};
    base.financeEntries = Array.isArray(base.financeEntries) ? base.financeEntries : [];
    base.templates = Array.isArray(base.templates) ? base.templates : [];
    return base;
}

function mergeUniqueById(primary = [], secondary = []) {
    const merged = [];
    const seen = new Set();
    (secondary || []).forEach(item => {
        if (item && item.id) {
            merged.push(item);
            seen.add(item.id);
        }
    });
    (primary || []).forEach(item => {
        if (!item) return;
        if (item.id) {
            if (!seen.has(item.id)) {
                merged.push(item);
                seen.add(item.id);
            }
        } else {
            merged.push(item);
        }
    });
    return merged;
}

function mergeHelpSettings(server = {}, local = {}) {
    const merged = { ...local, ...server };
    Object.keys(merged).forEach(key => {
        if (server[key] && local[key] && typeof server[key] === 'object' && typeof local[key] === 'object') {
            merged[key] = { ...local[key], ...server[key] };
        }
    });
    return merged;
}

async function loadStateFromServer() {
    const token = getAuthToken();
    if (!token) {
        console.warn('loadStateFromServer: no auth token available, skipping server sync');
        return null;
    }
    const res = await apiFetch('GET', APP_STATE_API_PATH);
    if (!res.ok) {
        console.warn('loadStateFromServer: server responded with status', res.status, res.error || res.data);
        return null;
    }
    const remote = res.data?.state;
    if (remote === null || remote === undefined) {
        console.log('loadStateFromServer: server returned no state');
        return null;
    }
    console.log('loadStateFromServer: loaded state from server templates:', Array.isArray(remote.templates) ? remote.templates.length : 'none', 'financeEntries:', Array.isArray(remote.financeEntries) ? remote.financeEntries.length : 'none');
    return ensureAppState(remote);
}

function loadStateFromLocal() {
    try {
        const raw = localStorage.getItem(getAppStateLocalKey());
        const parsed = raw ? JSON.parse(raw) : null;
        const state = ensureAppState(parsed || null);
        const ownerEmail = parseJwt(getAuthToken())?.email || '';
        return {
            ...state,
            templates: filterTemplatesForOwner(state.templates, ownerEmail)
        };
    } catch {
        return ensureAppState(null);
    }
}

function saveStateToLocal(state) {
    try {
        const ownerEmail = parseJwt(getAuthToken())?.email || '';
        const payload = ensureAppState(state);
        payload.templates = normalizeTemplates(payload.templates, ownerEmail);
        localStorage.setItem(getAppStateLocalKey(), JSON.stringify(payload));
    } catch (err) {
        console.warn('saveStateToLocal error:', err);
    }
}

function mergeArraysForUpload(localArray, serverArray) {
    if (!Array.isArray(localArray) || localArray.length === 0) {
        return Array.isArray(serverArray) ? serverArray : [];
    }
    if (!Array.isArray(serverArray) || serverArray.length === 0) {
        return localArray;
    }
    return mergeUniqueById(localArray, serverArray);
}

function mergeStateForUpload(state, serverState = {}) {
    const ownerEmail = parseJwt(getAuthToken())?.email || '';
    const merged = {
        days: (state.days === undefined || Object.keys(state.days || {}).length === 0) ? serverState.days : state.days,
        weekly: (Array.isArray(state.weekly) && state.weekly.length > 0) ? state.weekly : serverState.weekly,
        streak: (typeof state.streak === 'number' && state.streak > 0) ? state.streak : serverState.streak,
        helpSettings: mergeHelpSettings(state.helpSettings || {}, serverState.helpSettings || {}),
        templates: normalizeTemplates(mergeArraysForUpload(state.templates, serverState.templates), ownerEmail),
        financeEntries: mergeArraysForUpload(state.financeEntries, serverState.financeEntries),
    };
    return ensureAppState(merged);
}

async function pushStateToServer(state) {
    const token = getAuthToken();
    if (!token) {
        console.warn('pushStateToServer: no auth token available, cannot sync state');
        return false;
    }
    const serverState = await loadStateFromServer();
    const mergedState = mergeStateForUpload(state || {}, serverState || {});
    console.log('pushStateToServer uploading state templates:', Array.isArray(mergedState.templates) ? mergedState.templates.length : 'none', 'financeEntries:', Array.isArray(mergedState.financeEntries) ? mergedState.financeEntries.length : 'none');
    const res = await apiFetch('POST', APP_STATE_API_PATH, { state: mergedState });
    if (res.ok) {
        saveStateToLocal(mergedState);
        return true;
    }
    console.warn('pushStateToServer failed with status', res.status, res.error || res.data);
    return false;
}

async function syncAppState(defaultState = null) {
    const serverState = await loadStateFromServer();
    const localState = loadStateFromLocal();
    console.log('syncAppState serverState templates:', Array.isArray(serverState?.templates) ? serverState.templates.length : 'none', 'financeEntries:', Array.isArray(serverState?.financeEntries) ? serverState.financeEntries.length : 'none');
    console.log('syncAppState localState templates:', Array.isArray(localState?.templates) ? localState.templates.length : 'none', 'financeEntries:', Array.isArray(localState?.financeEntries) ? localState.financeEntries.length : 'none');

    if (serverState) {
        const mergedState = ensureAppState(serverState);
        if (localState) {
            mergedState.templates = mergeUniqueById(serverState.templates, localState.templates);
            mergedState.financeEntries = mergeUniqueById(serverState.financeEntries, localState.financeEntries);
            mergedState.helpSettings = mergeHelpSettings(serverState.helpSettings, localState.helpSettings);
            console.log('syncAppState merged templates:', mergedState.templates.length, 'financeEntries:', mergedState.financeEntries.length);
            saveStateToLocal(mergedState);
            if (mergedState.templates.length !== serverState.templates.length || mergedState.financeEntries.length !== serverState.financeEntries.length) {
                await pushStateToServer(mergedState);
            }
            return mergedState;
        }
        saveStateToLocal(mergedState);
        return mergedState;
    }

    if (localState) {
        await pushStateToServer(localState);
        return localState;
    }

    const state = ensureAppState(defaultState);
    saveStateToLocal(state);
    await pushStateToServer(state);
    return state;
}
