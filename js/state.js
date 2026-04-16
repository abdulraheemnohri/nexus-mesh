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
        if (savedState) {
            this.data = savedState;
        }

        this.notify();

        setInterval(() => {
            if (this.isHost && window.P2P && window.P2P.broadcast) {
                window.P2P.broadcast({
                    type: 'full_sync',
                    data: this.data
                });
            }
        }, 30000);
    },

    subscribe(callback) {
        this.listeners.push(callback);
    },

    notify() {
        this.listeners.forEach(cb => cb(this.data));
    },

    async save() {
        if (this.roomID) {
            await Utils.db.set(`state_${this.roomID}`, this.data);
        }
    },

    update(path, value, broadcast = true) {
        const parts = path.split('.');
        let current = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        this.data.lastUpdated = Date.now();

        this.save();
        this.notify();

        if (broadcast && window.P2P && typeof window.P2P.broadcast === 'function') {
            window.P2P.broadcast({
                type: 'delta',
                path,
                value,
                timestamp: this.data.lastUpdated
            });
        }
    },

    applyDelta(delta) {
        const parts = delta.path.split('.');
        let current = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
            current = current[parts[i]];
        }
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
        const item = {
            id: Utils.generateID(8),
            videoID,
            title,
            votes: 0,
            addedBy,
            addedAt: Date.now()
        };
        const newQueue = [...this.data.queue, item];
        this.update('queue', newQueue);
    },

    voteQueue(id, increment) {
        const newQueue = this.data.queue.map(item => {
            if (item.id === id) {
                return { ...item, votes: item.votes + increment };
            }
            return item;
        }).sort((a, b) => b.votes - a.votes || a.addedAt - b.addedAt);
        this.update('queue', newQueue);
    },

    removeFromQueue(id) {
        const newQueue = this.data.queue.filter(item => item.id !== id);
        this.update('queue', newQueue);
    },

    addPoll(question, options, anonymous, durationMinutes, createdBy) {
        const poll = {
            id: Utils.generateID(8),
            question,
            options: options.map(opt => ({ text: opt, votes: 0, voters: [] })),
            anonymous,
            expiresAt: Date.now() + (durationMinutes * 60000),
            createdBy,
            votedPeers: []
        };
        const newPolls = [poll, ...this.data.polls];
        this.update('polls', newPolls);
    },

    votePoll(pollId, optionIndex, peerId) {
        const newPolls = this.data.polls.map(poll => {
            if (poll.id === pollId) {
                if (poll.votedPeers.includes(peerId)) return poll;
                const newOptions = [...poll.options];
                newOptions[optionIndex].votes += 1;
                newOptions[optionIndex].voters.push(peerId);
                return { ...poll, options: newOptions, votedPeers: [...poll.votedPeers, peerId] };
            }
            return poll;
        });
        this.update('polls', newPolls);
    },

    addMessage(text, senderID, senderAvatar, lifetimeSeconds) {
        const msg = {
            id: Utils.generateID(8),
            text,
            senderID,
            senderAvatar,
            expiresAt: Date.now() + (lifetimeSeconds * 1000),
            pinned: false
        };
        const newWall = [msg, ...this.data.wall];
        this.update('wall', newWall);
    },

    cleanupExpired() {
        const now = Date.now();
        let changed = false;
        const newWall = this.data.wall.filter(msg => msg.pinned || msg.expiresAt > now);
        if (newWall.length !== this.data.wall.length) {
            this.data.wall = newWall;
            changed = true;
        }
        if (changed) {
            this.save();
            this.notify();
        }
    },

    exportState() {
        return JSON.stringify(this.data);
    },

    async importState(json) {
        try {
            const parsed = JSON.parse(json);
            this.data = parsed;
            this.data.lastUpdated = Date.now();
            await this.save();
            this.notify();
            if (window.P2P && window.P2P.broadcast) {
                window.P2P.broadcast({ type: 'full_sync', data: this.data });
            }
        } catch (e) {
            console.error('Failed to import state:', e);
            Utils.toast('Import failed: Invalid JSON', 'error');
        }
    }
};

export default State;
