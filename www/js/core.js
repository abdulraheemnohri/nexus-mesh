/**
 * NEXUS MESH V5 - Autonomous P2P Engine
 */
import Utils from './utils.js';
import State from './state.js';
import Settings from './settings.js';
import Brain from './brain.js';
import Swarm from './swarm.js';
import Security from './security.js';

const P2P = {
    peer: null,
    connections: new Map(),
    peerID: null,
    roomID: null,
    isHost: false,
    knownPeers: new Set(),
    reconnectAttempts: 0,
    votes: new Map(),
    messageCache: new Set(),

    async init(roomID = null) {
        this.roomID = roomID || Utils.generateID();
        this.isHost = !roomID;
        await Security.init();

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
            if (!Settings.current.stealth) this.knownPeers.add(conn.peer);

            if (this.isHost) {
                this.gossip({ type: 'discovery', peers: Array.from(this.knownPeers), stealth: Settings.current.stealth });
                conn.send({ type: 'full_sync', data: State.data });
            }

            this.startPing(conn.peer);
            conn.send({ type: 'node_identity', key: Security.publicKeyJWK });

            if (Settings.current.camouflage) {
                setInterval(() => {
                    if (conn.open) conn.send({ type: 'noop', pad: Utils.generateID(128) });
                }, 15000);
            }

            window.dispatchEvent(new CustomEvent('mesh-log', { detail: 'Secure Link: ' + conn.peer.substring(0,4) }));
            window.dispatchEvent(new CustomEvent('mesh-updated'));
        });

        conn.on('data', (data) => {
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
        if (data.msgId) {
            if (this.messageCache.has(data.msgId)) return;
            this.messageCache.add(data.msgId);
            setTimeout(() => this.messageCache.delete(data.msgId), 30000);
            if (data.ttl > 0) this.gossip({ ...data, ttl: data.ttl - 1 }, [sid]);
        }

        switch (data.type) {
            case 'ping': this.connections.get(sid)?.conn.send({ type: 'pong', t: data.t }); break;
            case 'pong':
                const info = this.connections.get(sid);
                if (info) {
                    info.latency = Date.now() - data.t;
                    Brain.evaluateNodeTrust(sid, 'reliable');
                }
                break;
            case 'discovery':
                if (data.stealth && !this.isHost) break;
                Brain.optimizeRouting(data.peers).forEach(id => this.connectToPeer(id));
                break;
            case 'node_identity':
                const peerInfo = this.connections.get(sid);
                if (peerInfo) {
                    peerInfo.publicKey = data.key;
                    window.dispatchEvent(new CustomEvent('mesh-log', { detail: 'Handshake: ' + sid.substring(0,4) }));
                }
                break;
            case 'delta': State.applyDelta(data); break;
            case 'full_sync': State.applyFullSync(data.data); break;
            case 'knowledge_sync':
                State.data.knowledge = data.knowledge;
                break;
            case 'chat': State.addMessage(data.text, sid, data.avatar, data.lifetime); break;
            case 'vote': this.handleGovernanceVote(data, sid); break;
            case 'swarm_announce': Swarm.handleAnnounce(data, sid); break;
            case 'swarm_request': Swarm.handleRequest(data, sid); break;
            case 'swarm_piece': Swarm.handlePiece(data, sid); break;
            case 'kick': location.reload(); break;
        }
    },

    handleGovernanceVote(data, sid) {
        const aid = data.actionId;
        if (!this.votes.has(aid)) this.votes.set(aid, new Set());
        this.votes.get(aid).add(sid);

        // Smart Autonomous Auto-Vote
        if (sid !== this.peerID && !this.votes.get(aid).has(this.peerID)) {
            if ((Brain.trust.get(sid) || 0) > 80) {
                this.votes.get(aid).add(this.peerID);
                this.broadcast({ ...data, sid: this.peerID });
            }
        }

        if (this.votes.get(aid).size / (this.connections.size + 1) >= 0.6) {
            this.executeAutonomousAction(aid, data.payload);
        }
    },

    executeAutonomousAction(id, payload) {
        if (id.startsWith('kick:')) this.kickPeer(payload.peerID);
    },

    gossip(data, exclude = []) {
        if (!data.msgId) data.msgId = Utils.generateID(10);
        if (data.ttl === undefined) data.ttl = 5;
        this.connections.forEach((info, id) => {
            if (!exclude.includes(id) && info.conn.open) info.conn.send(data);
        });
    },

    broadcast(data, exclude = []) { this.gossip(data, exclude); },

    kickPeer(id) {
        this.connections.get(id)?.conn.send({ type: 'kick' });
        this.connections.get(id)?.conn.close();
    },

    scanLocalMesh: async () => {
        Utils.toast('Scanning Swarm...', 'info');
        for (let i = 1; i <= 5; i++) {
            const testID = "SWARM" + i;
            if (testID !== P2P.peerID) P2P.connectToPeer(testID);
        }
    }
};

window.P2P = P2P;
export default P2P;

setInterval(() => {
    if (P2P.connections.size > 0 && State.data.knowledge.routes.length > 0) {
        P2P.broadcast({ type: 'knowledge_sync', knowledge: State.data.knowledge });
    }
}, 60000);
