const API_URL = '/api';

export const LocalDB = (() => {
  const makeSnap = (id, data) => ({ exists: data !== undefined && data !== null, id, data: () => data });
  const makeQuerySnap = (arr) => ({ empty: arr.length === 0, docs: arr.map(x => makeSnap(x.id, x.data)) });

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
    }
    
    async update(v) {
      await fetch(`${API_URL}/${this.col}/${this.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v)
      });
    }
    
    async delete() {
      await fetch(`${API_URL}/${this.col}/${this.id}`, { method: 'DELETE' });
    }
    
    onSnapshot(cb, err) {
      let active = true;
      const poll = async () => {
        if (!active) return;
        try {
          const snap = await this.get();
          cb(snap);
        } catch(e) { if(err) err(e); }
        if (active) setTimeout(poll, 3000); // Poll every 3 seconds for real-time feel
      };
      poll();
      return () => { active = false; };
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
          const poll = async () => {
            if (!active) return;
            try {
              const snap = await self.get();
              cb(makeQuerySnap(sortFn(snap.docs.map(d => ({ id: d.id, data: d.data() })))));
            } catch(e) { if(err) err(e); }
            if (active) setTimeout(poll, 3000);
          };
          poll();
          return () => { active = false; };
        }
      };
    }
    
    onSnapshot(cb, err) {
      let active = true;
      const poll = async () => {
        if (!active) return;
        try { cb(await this.get()); } catch(e) { if(err) err(e); }
        if (active) setTimeout(poll, 3000);
      };
      poll();
      return () => { active = false; };
    }
  }

  return { 
    collection: (name) => new Col(name), 
    doc: (path) => new Doc(path.split('/')[0], path.split('/')[1]) 
  };
})();

// Keep your existing cryptography functions here:
export const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
export const randomSalt = () => { const arr = new Uint8Array(16); crypto.getRandomValues(arr); return toHex(arr.buffer); };
export const hashPassword = async (password, salt) => toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + password)));