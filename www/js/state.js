/**
 * NEXUS MESH - State Management
 */
import Utils from './utils.js';

const State = {
    roomID: null,
    isHost: false,

    data: {
        lastUpdated: Date.now(),
        player: {
            videoID: null,
            state: -1,
            currentTime: 0,
            hostOnly: false
        },
        queue: [],
        polls: [],
        wall: []
    },

    listeners: [],

    async init(roomID, isHost = false) {
        this.roomID = roomID;
        this.isHost = isHost;
        const savedState = await Utils.db.get(`state_${roomID}`);
        if (savedState) this.data = savedState;
        this.notify();
        setInterval(() => {
            if (this.isHost && window.P2P && window.P2P.broadcast) {
                window.P2P.broadcast({ type: 'full_sync', data: this.data });
            }
        }, 30000);
    },

    subscribe(callback) { this.listeners.push(callback); },
    notify() { this.listeners.forEach(cb => cb(this.data)); },
    async save() { if (this.roomID) await Utils.db.set(`state_${this.roomID}`, this.data); },

    update(path, value, broadcast = true) {
        const parts = path.split('.');
        let current = this.data;
        for (let i = 0; i < parts.length - 1; i++) current = current[parts[i]];
        current[parts[parts.length - 1]] = value;
        this.data.lastUpdated = Date.now();
        this.save();
        this.notify();
        if (broadcast && window.P2P) window.P2P.broadcast({ type: 'delta', path, value, timestamp: this.data.lastUpdated });
    },

    applyDelta(delta) {
        const parts = delta.path.split('.');
        let current = this.data;
        for (let i = 0; i < parts.length - 1; i++) current = current[parts[i]];
        current[parts[parts.length - 1]] = delta.value;
        this.data.lastUpdated = Math.max(this.data.lastUpdated, delta.timestamp);
        this.save();
        this.notify();
    },

    applyFullSync(newData) {
        if (newData.lastUpdated > this.data.lastUpdated) {
            this.data = newData;
            this.save();
            this.notify();
        }
    },

    addToQueue(videoID, title, addedBy) {
        const item = { id: Utils.generateID(8), videoID, title, votes: 0, votedBy: [], addedBy, addedAt: Date.now() };
        this.update('queue', [...this.data.queue, item]);
    },

    voteQueue(id, peerId, increment) {
        const newQueue = this.data.queue.map(item => {
            if (item.id === id && !item.votedBy.includes(peerId)) {
                return { ...item, votes: item.votes + increment, votedBy: [...item.votedBy, peerId] };
            }
            return item;
        }).sort((a, b) => b.votes - a.votes || a.addedAt - b.addedAt);
        this.update('queue', newQueue);
    },

    removeFromQueue(id) {
        this.update('queue', this.data.queue.filter(item => item.id !== id));
    },

    addPoll(question, options, anonymous, durationMinutes, createdBy) {
        const poll = { id: Utils.generateID(8), question, options: options.map(opt => ({ text: opt, votes: 0 })), anonymous, expiresAt: Date.now() + (durationMinutes * 60000), createdBy, votedPeers: [] };
        this.update('polls', [poll, ...this.data.polls]);
    },

    votePoll(pollId, optionIndex, peerId) {
        const newPolls = this.data.polls.map(poll => {
            if (poll.id === pollId && !poll.votedPeers.includes(peerId)) {
                const newOptions = [...poll.options];
                newOptions[optionIndex].votes += 1;
                return { ...poll, options: newOptions, votedPeers: [...poll.votedPeers, peerId] };
            }
            return poll;
        });
        this.update('polls', newPolls);
    },

    togglePin(id) {
        this.update("wall", this.data.wall.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m));
    }

    addMessage(text, senderID, senderAvatar, lifetimeSeconds) {
        const msg = { id: Utils.generateID(8), text, senderID, senderAvatar, expiresAt: Date.now() + (lifetimeSeconds * 1000), createdAt: Date.now() };
        this.update('wall', [msg, ...this.data.wall].slice(0, 50));
    },

    cleanupExpired() {
        const now = Date.now();
        let changed = false;
        const newWall = this.data.wall.filter(msg => msg.expiresAt > now);
        if (newWall.length !== this.data.wall.length) { this.data.wall = newWall; changed = true; }
        const newPolls = this.data.polls.filter(poll => poll.expiresAt > (now - 300000));
        if (newPolls.length !== this.data.polls.length) { this.data.polls = newPolls; changed = true; }
        if (changed) { this.save(); this.notify(); }
    },

    clearWall() {
        this.update("wall", []);
    }

    clearQueue() {
        this.update("queue", []);
    }

    exportPolls(pollId) {
        const poll = this.data.polls.find(p => p.id === pollId);
        if (!poll) return "";
        let csv = "Option,Votes\n";
        poll.options.forEach(o => csv += `"${o.text}",${o.votes}\n`);
        return csv;
    },

    exportState() { return JSON.stringify(this.data); },

    async importState(json) {
        try {
            this.data = JSON.parse(json);
            this.data.lastUpdated = Date.now();
            await this.save();
            this.notify();
            if (window.P2P) window.P2P.broadcast({ type: 'full_sync', data: this.data });
        } catch (e) { Utils.toast('Import failed', 'error'); }
    }
};

window.State = State;
State.downloadPoll = (pollId) => {
    const csv = State.exportPolls(pollId);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `poll-${pollId}.csv`;
    a.click();
};

export default State;
