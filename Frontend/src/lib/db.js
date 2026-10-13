const API_URL = '/api';

export const LocalDB = (() => {
  const makeSnap = (id, data) => ({ exists: data !== undefined && data !== null, id, data: () => data });
  const makeQuerySnap = (arr) => ({ empty: arr.length === 0, docs: arr.map(x => makeSnap(x.id, x.data)) });

  const listeners = new Map();

  const registerListener = (col, fn) => {
    if (!listeners.has(col)) listeners.set(col, new Set());
    listeners.get(col).add(fn);
    return () => listeners.get(col)?.delete(fn);
  };

  const notifyListeners = async (col) => {
    const set = listeners.get(col);
    if (!set || set.size === 0) return;
    await Promise.all(Array.from(set).map(fn => fn()));
    // Wait for browser paint so table DOM updates before post-write callbacks (like toast) run
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    }
  };

  class Doc {
    constructor(col, id) { this.col = col; this.id = id; }
    
    async get() {
      const res = await fetch(`${API_URL}/${this.col}/${this.id}`);
      const json = await res.json();
      return makeSnap(json.id, json.exists ? json.data : null);
    }
    
    async set(v) {
      await fetch(`${API_URL}/${this.col}/${this.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v)
      });
      await notifyListeners(this.col);
    }
    
    async update(v) {
      await fetch(`${API_URL}/${this.col}/${this.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v)
      });
      await notifyListeners(this.col);
    }
    
    async delete() {
      if (this.col.startsWith('deleted_')) {
        throw new Error('Deleting data from backup collections is not permitted. You can only restore it.');
      }
      await fetch(`${API_URL}/${this.col}/${this.id}`, { method: 'DELETE' });
      await notifyListeners(this.col);
      await notifyListeners(`deleted_${this.col}`);
    }
    
    onSnapshot(cb, err) {
      let active = true;
      const fetchAndEmit = async () => {
        if (!active) return;
        try {
          const snap = await this.get();
          if (active) cb(snap);
        } catch(e) { if (err && active) err(e); }
      };
      const unregister = registerListener(this.col, fetchAndEmit);
      const poll = async () => {
        if (!active) return;
        await fetchAndEmit();
        if (active) setTimeout(poll, 3000);
      };
      poll();
      return () => { active = false; unregister(); };
    }
    
    collection(sub) { return new Col(`${this.col}_${this.id}_${sub}`); }
  }

  class Col {
    constructor(name) { this.name = name; }
    
    doc(id) { return new Doc(this.name, id); }
    
    async get() {
      const res = await fetch(`${API_URL}/${this.name}`);
      const arr = await res.json();
      return makeQuerySnap(arr);
    }
    
    async add(v) {
      const res = await fetch(`${API_URL}/${this.name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v)
      });
      const json = await res.json();
      await notifyListeners(this.name);
      return this.doc(json.id);
    }
    
    limit() { return this; }
    
    orderBy(field, dir='asc') {
      const sortFn = (arr) => arr.sort((a,b) => {
        let fa = a.data[field], fb = b.data[field];
        if (fa < fb) return dir==='desc' ? 1 : -1;
        if (fa > fb) return dir==='desc' ? -1 : 1;
        return 0;
      });
      
      const self = this;
      return {
        get: async () => {
          const snap = await self.get();
          return makeQuerySnap(sortFn(snap.docs.map(d => ({ id: d.id, data: d.data() }))));
        },
        limit: function() { return this; },
        onSnapshot: (cb, err) => {
          let active = true;
          const fetchAndEmit = async () => {
            if (!active) return;
            try {
              const snap = await self.get();
              if (active) cb(makeQuerySnap(sortFn(snap.docs.map(d => ({ id: d.id, data: d.data() })))));
            } catch(e) { if (err && active) err(e); }
          };
          const unregister = registerListener(self.name, fetchAndEmit);
          const poll = async () => {
            if (!active) return;
            await fetchAndEmit();
            if (active) setTimeout(poll, 3000);
          };
          poll();
          return () => { active = false; unregister(); };
        }
      };
    }
    
    onSnapshot(cb, err) {
      let active = true;
      const fetchAndEmit = async () => {
        if (!active) return;
        try {
          const snap = await this.get();
          if (active) cb(snap);
        } catch(e) { if (err && active) err(e); }
      };
      const unregister = registerListener(this.name, fetchAndEmit);
      const poll = async () => {
        if (!active) return;
        await fetchAndEmit();
        if (active) setTimeout(poll, 3000);
      };
      poll();
      return () => { active = false; unregister(); };
    }
  }

  const restore = async (collection, id) => {
    const baseCol = String(collection).replace(/^deleted_/, '');
    const res = await fetch(`${API_URL}/restore/${baseCol}/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to restore record.');

    await Promise.all([
      notifyListeners(baseCol),
      notifyListeners(`deleted_${baseCol}`),
      ...(baseCol === 'items' ? [notifyListeners('quotes'), notifyListeners('deleted_quotes')] : [])
    ]);
    return json;
  };

  const restoreBatch = async ({ collection = 'all', fromDateTime = '', toDateTime = '', limitCount = '', ids = null }) => {
    const res = await fetch(`${API_URL}/restore-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, fromDateTime, toDateTime, limitCount, ids })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to restore records.');

    const cols = ['items', 'quotes', 'users', 'config', 'history'];
    await Promise.all(
      cols.flatMap(c => [notifyListeners(c), notifyListeners(`deleted_${c}`)])
    );
    return json;
  };

  return { 
    collection: (name) => new Col(name), 
    doc: (path) => new Doc(path.split('/')[0], path.split('/')[1]),
    restore,
    restoreBatch
  };
})();

// Keep your existing cryptography functions here:
export const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
export const randomSalt = () => { const arr = new Uint8Array(16); crypto.getRandomValues(arr); return toHex(arr.buffer); };
export const hashPassword = async (password, salt) => toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + password)));