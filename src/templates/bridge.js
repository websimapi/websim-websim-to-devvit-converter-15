export const getDevvitBridgeServerCode = () => ``; 

// Client-Side API Wrapper (Fetch-based)
export const websimToDevvitPolyfill = `
(function() {
  console.log('[Devvit Client] Initializing HTTP API...');

  class DevvitAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }
    
    async getCurrentUser() {
        try {
            const res = await fetch(\`\${this.baseUrl}/api/me\`);
            return await res.json();
        } catch(e) { 
            console.warn("User fetch failed", e);
            return { id: 'guest', username: 'Guest', avatarUrl: '' }; 
        }
    }
    
    async getUser(username) {
         // Not fully implemented on server example, but we can fake it or use /api/me if it matches
         return { id: username, username, avatarUrl: '' };
    }
    
    async dbSet(key, value) {
        const res = await fetch(\`\${this.baseUrl}/api/db/set\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
        return res.json();
    }
    
    async dbGet(key) {
        const res = await fetch(\`\${this.baseUrl}/api/db/get/\${key}\`);
        const data = await res.json();
        return data.value;
    }
    
    async dbHSet(key, fields) {
        const res = await fetch(\`\${this.baseUrl}/api/db/hset\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, fields })
        });
        return res.json();
    }
    
    async dbHGetAll(key) {
        const res = await fetch(\`\${this.baseUrl}/api/db/hgetall/\${key}\`);
        const data = await res.json();
        return data.data;
    }
    
    async saveGameState(state) {
        const res = await fetch(\`\${this.baseUrl}/api/game/save\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state })
        });
        return res.json();
    }
    
    async loadGameState() {
        const res = await fetch(\`\${this.baseUrl}/api/game/load\`);
        const data = await res.json();
        return data.state;
    }
    
    async sendMessage(channel, message) {
        return await fetch(\`\${this.baseUrl}/api/realtime/send\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, message })
        });
    }

    async getMessages(channel, since) {
        const res = await fetch(\`\${this.baseUrl}/api/realtime/get/\${channel}?since=\${since}\`);
        const data = await res.json();
        return data.messages || [];
    }
  }

  // Expose as global singleton
  window.DevvitAPI = new DevvitAPI();

  // --- WEBSIM COMPATIBILITY ADAPTER ---
  const generateId = () => Math.random().toString(36).substr(2, 9);

  class WebsimCollection {
      constructor(name) { this.name = name; this.subs = []; }
      async create(data) {
          const id = data.id || generateId();
          const record = { ...data, id, created_at: new Date().toISOString() };
          await window.DevvitAPI.dbHSet('collection:' + this.name, { [id]: JSON.stringify(record) });
          return record;
      }
      async getList() {
          const res = await window.DevvitAPI.dbHGetAll('collection:' + this.name);
          const list = Object.values(res).map(s => { try { return JSON.parse(s); } catch(e){ return null; }}).filter(Boolean);
          return list.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
      }
      subscribe(cb) {
          this.subs.push(cb);
          this.getList().then(cb).catch(console.error);
          // Poll
          const int = setInterval(async () => {
             if(this.subs.length === 0) { clearInterval(int); return; }
             try { const l = await this.getList(); this.subs.forEach(f => f(l)); } catch(e){}
          }, 2000);
          return () => { this.subs = this.subs.filter(s => s !== cb); };
      }
  }

  class WebsimSocket {
      constructor() {
          this.peers = {};
          this.roomState = {};
          this.presence = {};
          this.clientId = 'guest';
          this.listeners = {};
          this.collections = {};
          this.lastMsg = Date.now();
      }
      
      collection(name) {
          if(!this.collections[name]) this.collections[name] = new WebsimCollection(name);
          return this.collections[name];
      }
      
      async initialize() {
          try {
              const u = await window.DevvitAPI.getCurrentUser();
              this.clientId = u.id || 'guest';
              this.peers[this.clientId] = u;
              console.log('[Adapter] Initialized as', u.username);
              
              // Start Polling Loop for messages
              setInterval(() => this.pollMessages(), 1500);
          } catch(e) { console.error('Init failed', e); }
      }
      
      async pollMessages() {
          try {
             const msgs = await window.DevvitAPI.getMessages('global', this.lastMsg);
             if(msgs && msgs.length > 0) {
                 msgs.forEach(m => {
                     this.lastMsg = Math.max(this.lastMsg, m.timestamp);
                     if (m.senderId === this.clientId) return; // ignore self
                     if (this.onmessage) this.onmessage({ data: { ...m, clientId: m.senderId } });
                 });
             }
          } catch(e) {}
      }
      
      send(msg) {
          window.DevvitAPI.sendMessage('global', { ...msg, senderId: this.clientId });
      }
      
      async updateRoomState(data) {
          this.roomState = { ...this.roomState, ...data };
          await window.DevvitAPI.dbSet('roomstate:global', this.roomState);
          this._emit('roomState', this.roomState);
      }
      
      subscribePresence(cb) { /* Stub */ }
      subscribeRoomState(cb) { 
          // Initial fetch
          window.DevvitAPI.dbGet('roomstate:global').then(s => {
              if(s) { this.roomState = s; cb(s); }
          });
          return this._on('roomState', cb); 
      }
      
      _on(e, cb) {
          if(!this.listeners[e]) this.listeners[e] = [];
          this.listeners[e].push(cb);
          return () => { this.listeners[e] = this.listeners[e].filter(x => x !== cb); };
      }
      _emit(e, d) { (this.listeners[e]||[]).forEach(c => c(d)); }
  }

  window.WebsimSocket = WebsimSocket;
  window.websim = {
      getCurrentUser: window.DevvitAPI.getCurrentUser,
      getProject: async () => ({ id: 'devvit-game', title: 'Game' }),
      upload: async (b) => URL.createObjectURL(b)
  };
  window.getUserAvatar = async (username) => {
      // Stub
      return '';
  };

  console.log('[Devvit Client] Ready!');
})();
`;

