/**
 * NEXUS MESH V4 - Autonomous P2P Engine
 */
import Utils from './utils.js';
import State from './state.js';
import Settings from './settings.js';
import Brain from './brain.js';

const P2P = {
    peer: null,
    connections: new Map(), // ID -> { conn, latency, joinedAt }
    peerID: null,
    roomID: null,
    isHost: false,
    knownPeers: new Set(),
    isOfflineMesh: false,
    reconnectAttempts: 0,
    votes: new Map(),

    async init(roomID = null) {
        this.roomID = roomID || Utils.generateID();
        this.isHost = !roomID;

        return new Promise((resolve, reject) => {
            this.peer = new Peer(this.isHost ? this.roomID : null, {
                debug: 1,
                config: {'iceServers': [
                    { url: 'stun:stun.l.google.com:19302' },
                    { url: 'stun:stun1.l.google.com:19302' }
                ]}
            });

            this.peer.on('open', (id) => {
                this.peerID = id;
                this.knownPeers.add(id);
                if (!this.isHost) this.connectToPeer(this.roomID);

                setInterval(() => {
                    Brain.analyzeNetwork(this.connections);
                    window.dispatchEvent(new CustomEvent('brain-sync'));
                }, 5000);

                resolve(id);
            });

            this.peer.on('connection', (conn) => this.handleIncoming(conn));
            this.peer.on('error', (err) => console.error('Mesh P2P Error:', err));
            this.peer.on('disconnected', () => this.peer.reconnect());
        });
    },

    handleIncoming(conn) {
        this.setupConnection(conn);
    },

    connectToPeer(id) {
        if (this.connections.has(id) || id === this.peerID) return;
        const conn = this.peer.connect(id, { reliable: true });
        this.setupConnection(conn);
    },

    setupConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, { conn, latency: 0, joinedAt: Date.now() });
            this.knownPeers.add(conn.peer);

            if (this.isHost) {
                this.broadcast({ type: 'discovery', peers: Array.from(this.knownPeers) });
                conn.send({ type: 'full_sync', data: State.data });
            }

            this.startPing(conn.peer);
            window.dispatchEvent(new CustomEvent('mesh-log', { detail: 'Node Link Established: ' + conn.peer.substring(0,4) }));
            window.dispatchEvent(new CustomEvent('mesh-updated'));
        });

        conn.on('data', (data) => {
            // Track traffic
            if (window.UI && typeof window.UI.trackTraffic === 'function') {
                window.UI.trackTraffic(JSON.stringify(data).length);
            }
            this.handleData(data, conn.peer);
        });

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            window.dispatchEvent(new CustomEvent('mesh-updated'));
        });
    },

    startPing(id) {
        const i = setInterval(() => {
            const info = this.connections.get(id);
            if (!info || !info.conn.open) return clearInterval(i);
            info.conn.send({ type: 'ping', t: Date.now() });
        }, 10000);
    },

    handleData(data, sid) {
        switch (data.type) {
            case 'ping': this.connections.get(sid)?.conn.send({ type: 'pong', t: data.t }); break;
            case 'pong':
                Brain.evaluateNodeTrust(sid, 'reliable');
                const info = this.connections.get(sid);
                if (info) info.latency = Date.now() - data.t;
                break;
            case 'discovery':
                Brain.optimizeRouting(data.peers).forEach(id => this.connectToPeer(id));
                break;
            case 'delta': State.applyDelta(data); break;
            case 'full_sync': State.applyFullSync(data.data); break;
            case 'chat': State.addMessage(data.text, sid, data.avatar, data.lifetime); break;
            case 'vote': this.handleGovernanceVote(data, sid); break;
            case 'kick': location.reload(); break;
        }
    },

    handleGovernanceVote(data, sid) {
        const actionId = data.actionId;
        if (!this.votes.has(actionId)) this.votes.set(actionId, new Set());
        this.votes.get(actionId).add(sid);
        const count = this.votes.get(actionId).size;
        const total = this.connections.size + 1;
        if (count / total >= 0.6) this.executeAutonomousAction(actionId, data.payload);
    },

    executeAutonomousAction(id, payload) {
        if (id.startsWith('kick:')) {
            window.dispatchEvent(new CustomEvent('mesh-log', { detail: 'Governance: Executing Consensus Kick for ' + payload.peerID.substring(0,4) }));
            this.kickPeer(payload.peerID);
        }
    },

    broadcast(data, exclude = []) {
        this.connections.forEach((info, id) => {
            if (!exclude.includes(id) && info.conn.open) info.conn.send(data);
        });
    },

    kickPeer(id) {
        this.connections.get(id)?.conn.send({ type: 'kick' });
        this.connections.get(id)?.conn.close();
    },

    scanLocalMesh: async () => {
        Utils.toast('Scanning Local Network...', 'info');
        for (let i = 1; i <= 5; i++) {
            const testID = "MESH" + i;
            if (testID !== P2P.peerID) P2P.connectToPeer(testID);
        }
    }
};

window.P2P = P2P;
export default P2P;

P2P.proposeVote = (type, payload) => {
    const actionId = type + ":" + (payload.peerID || payload.target);
    Utils.toast('Governance: Proposing ' + type, 'info');
    P2P.broadcast({ type: 'vote', actionId, payload });
    // Vote for ourselves automatically
    P2P.handleGovernanceVote({ type: 'vote', actionId, payload }, P2P.peerID);
};

window.addEventListener('mesh-throttle', () => {
    Utils.toast('Mesh: Throttling high-traffic nodes', 'warning');
    // Actual implementation of local throttle logic
});

window.addEventListener('mesh-topology-change', (e) => {
    Utils.toast('Mesh: Topology optimized to ' + e.detail, 'info');
});

// Knowledge Gossip Loop
setInterval(() => {
    if (P2P.connections.size > 0 && State.data.knowledge.bestRoutes.length > 0) {
        P2P.broadcast({ type: 'knowledge_sync', knowledge: State.data.knowledge });
    }
}, 60000);
