// Shared app state sync helper for CR Grows pages
const APP_STATE_API_PATH = '/api/state';
const APP_STATE_LOCAL_KEY = 'cr_grows_app_state';

function parseJwt(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function getAuthToken() {
    return localStorage.getItem('token');
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
    return base;
}

async function loadStateFromServer() {
    const token = getAuthToken();
    if (!token) return null;
    const res = await apiFetch('GET', APP_STATE_API_PATH);
    if (!res.ok) return null;
    return ensureAppState(res.data?.state || null);
}

function loadStateFromLocal() {
    try {
        return ensureAppState(JSON.parse(localStorage.getItem(APP_STATE_LOCAL_KEY)) || null);
    } catch {
        return ensureAppState(null);
    }
}

function saveStateToLocal(state) {
    try {
        localStorage.setItem(APP_STATE_LOCAL_KEY, JSON.stringify(ensureAppState(state)));
    } catch (err) {
        console.warn('saveStateToLocal error:', err);
    }
}

async function pushStateToServer(state) {
    const token = getAuthToken();
    if (!token) return false;
    const res = await apiFetch('POST', APP_STATE_API_PATH, { state: ensureAppState(state) });
    if (res.ok) {
        saveStateToLocal(state);
        return true;
    }
    return false;
}

async function syncAppState(defaultState = null) {
    let state = await loadStateFromServer();
    if (state) {
        saveStateToLocal(state);
        return state;
    }
    state = loadStateFromLocal();
    if (state) {
        await pushStateToServer(state);
        return state;
    }
    state = ensureAppState(defaultState);
    saveStateToLocal(state);
    await pushStateToServer(state);
    return state;
}
