/**
 * NEXUS MESH - Secure Distributed State
 */
import Utils from './utils.js';
import Settings from './settings.js';
import Security from './security.js';

const State = {
    roomID: null,
    isHost: false,
    data: { v: 0, player: { videoID: null, state: -1, currentTime: 0 }, queue: [], polls: [], wall: [], dms: [], knowledge: { routes: [] } },
    listeners: [],

    async init(roomID, isHost = false) {
        this.roomID = roomID; this.isHost = isHost;
        if (!Settings.current.zeroFootprint) {
            const saved = await Utils.db.get(`state_${roomID}`);
            if (saved) this.data = saved;
        }
        this.notify();
    },

    subscribe(cb) { this.listeners.push(cb); },
    notify() { this.listeners.forEach(cb => cb(this.data)); },
    async save() {
        if (this.roomID && !Settings.current.zeroFootprint) {
            await Utils.db.set(`state_${this.roomID}`, this.data);
        }
    },

    update(path, value, broadcast = true) {
        const applyUpdate = () => {
            const parts = path.split('.');
            let cur = this.data;
            for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
            cur[parts[parts.length - 1]] = value;
            this.data.v++;
            this.save(); this.notify();
            if (broadcast && window.P2P) window.P2P.broadcast({ type: 'delta', path, value, v: this.data.v });
        };

        if (Settings.current.obfuscateSignals) {
            setTimeout(applyUpdate, Math.random() * 500);
        } else {
            applyUpdate();
        }
    },

    applyDelta(delta) {
        if (delta.v <= this.data.v && delta.path !== 'player.currentTime') return;
        const parts = delta.path.split('.');
        let cur = this.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = delta.value;
        this.data.v = Math.max(this.data.v, delta.v);
        this.save(); this.notify();
    },

    async addMessage(text, sid, ava, life) {
        const encText = await Security.encrypt(text);
        const msg = { id: Utils.generateID(8), text: encText, senderID: sid, senderAvatar: ava, expiresAt: Date.now()+(life*1000), createdAt: Date.now() };
        this.update('wall', [msg, ...this.data.wall].slice(0, 50));
    },

    async sendDM(targetId, text) {
        const dm = { id: Utils.generateID(8), from: window.P2P.peerID, to: targetId, text: await Security.encrypt(text), t: Date.now() };
        this.update('dms', [...this.data.dms, dm]);
    },

    cleanupOldHistory() {
        this.update("wall", this.data.wall.slice(0, 10));
        this.update("dms", this.data.dms.slice(-20));
    },

    cleanupExpired() {
        const now = Date.now();
        let changed = false;
        const w = this.data.wall.filter(m => m.expiresAt > now);
        if (w.length !== this.data.wall.length) { this.data.wall = w; changed = true; }
        if (changed) { this.save(); this.notify(); }
    },

    exportState() { return JSON.stringify(this.data); },
    applyFullSync(newData) { if (newData.v > this.data.v) { this.data = newData; this.save(); this.notify(); } }
};

window.State = State;
export default State;
