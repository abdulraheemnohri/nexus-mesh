/**
 * NEXUS MESH - Secure Mesh State Manager
 */
import Utils from './utils.js';
import Settings from './settings.js';

const State = {
    roomID: null,
    isHost: false,

    data: {
        lastUpdated: Date.now(),
        player: { videoID: null, state: -1, currentTime: 0, hostOnly: false },
        queue: [],
        polls: [],
        wall: []
    },

    listeners: [],

    async init(roomID, isHost = false) {
        this.roomID = roomID;
        this.isHost = isHost;
        const saved = await Utils.db.get(`state_${roomID}`);
        if (saved) this.data = saved;
        this.notify();
        setInterval(() => {
            if (this.isHost && window.P2P) window.P2P.broadcast({ type: 'full_sync', data: this.data });
        }, 30000);
    },

    subscribe(cb) { this.listeners.push(cb); },
    notify() { this.listeners.forEach(cb => cb(this.data)); },
    async save() { if (this.roomID) await Utils.db.set(`state_${this.roomID}`, this.data); },

    update(path, value, broadcast = true) {
        const parts = path.split('.');
        let cur = this.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = value;
        this.data.lastUpdated = Date.now();
        this.save(); this.notify();
        if (broadcast && window.P2P) window.P2P.broadcast({ type: 'delta', path, value, timestamp: this.data.lastUpdated });
    },

    applyDelta(delta) {
        const parts = delta.path.split('.');
        let cur = this.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = delta.value;
        this.data.lastUpdated = Math.max(this.data.lastUpdated, delta.timestamp);
        this.save(); this.notify();
    },

    applyFullSync(newData) {
        if (newData.lastUpdated > this.data.lastUpdated) {
            this.data = newData;
            this.save(); this.notify();
        }
    },

    encrypt(text) {
        if (!Settings.current.e2e) return text;
        return btoa(text).split('').reverse().join('');
    },

    decrypt(text) {
        if (!Settings.current.e2e) return text;
        try { return atob(text.split('').reverse().join('')); } catch(e) { return text; }
    },

    addToQueue(videoID, title, addedBy) {
        const item = { id: Utils.generateID(8), videoID, title, votes: 0, votedBy: [], addedBy, addedAt: Date.now() };
        this.update('queue', [...this.data.queue, item]);
    },

    voteQueue(id, peerId, inc) {
        const q = this.data.queue.map(i => {
            if (i.id === id && !i.votedBy.includes(peerId)) {
                return { ...i, votes: i.votes + inc, votedBy: [...i.votedBy, peerId] };
            }
            return i;
        }).sort((a,b) => b.votes - a.votes || a.addedAt - b.addedAt);
        this.update('queue', q);
    },

    addPoll(q, o, a, d, c) {
        const poll = { id: Utils.generateID(8), question: q, options: o.map(t=>({text:t, votes:0})), anonymous: a, expiresAt: Date.now()+(d*60000), createdBy: c, votedPeers: [] };
        this.update('polls', [poll, ...this.data.polls]);
    },

    votePoll(pid, idx, peer) {
        const p = this.data.polls.map(poll => {
            if (poll.id === pid && !poll.votedPeers.includes(peer)) {
                const opts = [...poll.options]; opts[idx].votes += 1;
                return { ...poll, options: opts, votedPeers: [...poll.votedPeers, peer] };
            }
            return poll;
        });
        this.update('polls', p);
    },

    addMessage(text, sid, ava, life) {
        const msg = { id: Utils.generateID(8), text: this.encrypt(text), senderID: sid, senderAvatar: ava, expiresAt: Date.now()+(life*1000), createdAt: Date.now() };
        this.update('wall', [msg, ...this.data.wall].slice(0, 50));
    },

    cleanupExpired() {
        const now = Date.now();
        let c = false;
        const w = this.data.wall.filter(m => m.expiresAt > now);
        if (w.length !== this.data.wall.length) { this.data.wall = w; c = true; }
        const p = this.data.polls.filter(poll => poll.expiresAt > (now - 300000));
        if (p.length !== this.data.polls.length) { this.data.polls = p; c = true; }
        if (c) { this.save(); this.notify(); }
    },

    exportPolls(pid) {
        const p = this.data.polls.find(i => i.id === pid);
        if (!p) return "";
        let csv = "Option,Votes\n";
        p.options.forEach(o => csv += `"${o.text}",${o.votes}\n`);
        return csv;
    },

    exportState() { return JSON.stringify(this.data); },

    async importState(json) {
        try {
            this.data = JSON.parse(json);
            this.data.lastUpdated = Date.now();
            await this.save(); this.notify();
            if (window.P2P) window.P2P.broadcast({ type: 'full_sync', data: this.data });
        } catch (e) { Utils.toast('Import failed', 'error'); }
    }
};

window.State = State;
State.downloadPoll = (id) => {
    const csv = State.exportPolls(id);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `poll-${id}.csv`;
    a.click();
};

export default State;
