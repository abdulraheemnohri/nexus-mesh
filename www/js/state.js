/**
 * NEXUS MESH V5 - Evolving Distributed State
 */
import Utils from './utils.js';
import Settings from './settings.js';
import Brain from './brain.js';

const State = {
    roomID: null,
    isHost: false,

    data: {
        v: 0,
        player: { videoID: null, state: -1, currentTime: 0, hostOnly: false },
        queue: [],
        polls: [],
        wall: [],
        dms: [],
        knowledge: {
            bestRoutes: [],
            blacklistedPeers: []
        }
    },

    listeners: [],

    async init(roomID, isHost = false) {
        this.roomID = roomID;
        this.isHost = isHost;
        const saved = await Utils.db.get(`state_${roomID}`);
        if (saved) this.data = saved;
        this.notify();
    },

    subscribe(cb) { this.listeners.push(cb); },
    notify() { this.listeners.forEach(cb => cb(this.data)); },
    async save() { if (this.roomID) await Utils.db.set(`state_${this.roomID}`, this.data); },

    update(path, value, broadcast = true) {
        const parts = path.split('.');
        let cur = this.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = value;
        this.data.v++;
        this.save(); this.notify();
        if (broadcast && window.P2P) window.P2P.broadcast({ type: 'delta', path, value, v: this.data.v });
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

    applyFullSync(newData) {
        if (newData.v > this.data.v) {
            this.data = newData;
            this.save(); this.notify();
        }
    },

    // V5 Feature: Knowledge Sharing
    shareKnowledge(type, payload) {
        const newK = { ...this.data.knowledge };
        if (type === 'route') newK.bestRoutes.push(payload);
        this.update('knowledge', newK);
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
        window.msgCount = (window.msgCount || 0) + 1;
        setTimeout(() => window.msgCount--, 10000);
        const encText = this.obfuscate(text);
        const msg = { id: Utils.generateID(8), text: encText, senderID: sid, senderAvatar: ava, expiresAt: Date.now()+(life*1000), createdAt: Date.now() };
        this.update('wall', [msg, ...this.data.wall].slice(0, 50));
    },

    obfuscate(text) {
        if (!Settings.current.e2e) return text;
        return btoa(text).split('').reverse().join('');
    },

    deobfuscate(text) {
        if (!Settings.current.e2e) return text;
        try { return atob(text.split('').reverse().join('')); } catch(e) { return text; }
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

    exportState() { return JSON.stringify(this.data); },

    async importState(json) {
        try {
            this.data = JSON.parse(json);
            this.data.v = Date.now();
            await this.save(); this.notify();
            if (window.P2P) window.P2P.broadcast({ type: 'full_sync', data: this.data });
        } catch (e) { Utils.toast('Import failed', 'error'); }
    }
};

window.State = State;
State.downloadPoll = (id) => {
    const p = State.data.polls.find(i => i.id === id);
    if (!p) return;
    let csv = "Option,Votes\n";
    p.options.forEach(o => csv += `"${o.text}",${o.votes}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `poll-${id}.csv`;
    a.click();
};

export default State;

State.sendDM = (targetId, text) => {
    const dm = {
        id: Utils.generateID(8),
        from: P2P.peerID,
        to: targetId,
        text: State.obfuscate(text),
        t: Date.now()
    };
    State.update('dms', [...State.data.dms, dm]);
};
