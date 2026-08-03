(function (root) {
  function getStableDateKey(date = new Date()) {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  function getUserScopedStorageKey(prefix, userEmail) {
    const normalizedEmail = String(userEmail || '').trim().toLowerCase();
    const suffix = normalizedEmail.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'anonymous';
    return `${prefix}_${suffix}`;
  }

  function normalizeStateDays(days = {}) {
    const normalized = {};
    Object.entries(days || {}).forEach(([key, value]) => {
      const normalizedKey = getStableDateKey(key ? new Date(key) : new Date());
      const existing = normalized[normalizedKey] || { done: [], percent: 0 };
      const incoming = value && typeof value === 'object' ? value : {};
      const done = Array.isArray(existing.done) ? existing.done.slice() : [];
      (incoming.done || []).forEach((id) => {
        if (!done.includes(id)) done.push(id);
      });
      normalized[normalizedKey] = {
        ...existing,
        ...incoming,
        done,
        percent: typeof incoming.percent === 'number' ? incoming.percent : (typeof existing.percent === 'number' ? existing.percent : 0)
      };
    });
    return normalized;
  }

  function normalizeTemplatesForUser(templates, userEmail) {
    const items = Array.isArray(templates) ? templates : [];
    return items.map((item) => ({
      ...item,
      ownerEmail: item?.ownerEmail || userEmail || ''
    }));
  }

  function filterTemplatesForUser(templates, userEmail) {
    const items = normalizeTemplatesForUser(templates, userEmail);
    if (!userEmail) return items;
    return items.filter((item) => !item.ownerEmail || item.ownerEmail === userEmail);
  }

  const api = {
    getStableDateKey,
    getUserScopedStorageKey,
    normalizeStateDays,
    normalizeTemplatesForUser,
    filterTemplatesForUser
  };

  root.CR_GROWS_UTILS = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
