/**
 * NEXUS MESH - True Full-Mesh P2P Engine
 */
import Utils from './utils.js';
import State from './state.js';
import Settings from './settings.js';

const P2P = {
    peer: null,
    connections: new Map(), // ID -> { conn, latency, type: 'host'|'peer' }
    peerID: null,
    roomID: null,
    isHost: false,
    knownPeers: new Set(),
    reconnectAttempts: 0,

    async init(roomID = null) {
        this.roomID = roomID || Utils.generateID();
        this.isHost = !roomID;

        return new Promise((resolve, reject) => {
            const idToUse = this.isHost ? this.roomID : null;
            this.peer = new Peer(idToUse, {
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
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('Peer Error:', err.type);
                if (err.type === 'peer-unavailable' && !this.isHost) {
                    Utils.toast('Host unavailable', 'error');
                }
            });

            this.peer.on('disconnected', () => this.peer.reconnect());
        });
    },

    handleIncomingConnection(conn) {
        // Security: Max Peers check
        if (this.connections.size >= Settings.current.maxPeers) {
            conn.close();
            return;
        }

        // Connection Approval (Host only for initial entry)
        if (this.isHost && Settings.current.requireApproval && conn.peer === this.roomID) {
            // Simplified: in full mesh, we only approve the initial entry to the mesh
        }

        this.setupConnection(conn);
    },

    connectToPeer(targetID) {
        if (this.connections.has(targetID) || targetID === this.peerID) return;
        console.log('Mesh: Connecting to', targetID);
        const conn = this.peer.connect(targetID, { reliable: true });
        this.setupConnection(conn);
    },

    setupConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, { conn, latency: 0 });
            this.knownPeers.add(conn.peer);

            // 1. If I'm the host, broadcast this new peer to the existing mesh
            if (this.isHost) {
                this.broadcast({
                    type: 'peer_discovery',
                    peers: Array.from(this.knownPeers)
                });
                conn.send({ type: 'full_sync', data: State.data });
            }

            this.startPing(conn.peer);
            Utils.toast(`Linked: ${conn.peer.substring(0,4)}`, 'success');
            window.dispatchEvent(new CustomEvent('mesh-updated'));
        });

        conn.on('data', (data) => this.handleData(data, conn.peer));

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            window.dispatchEvent(new CustomEvent('mesh-updated'));
        });
    },

    startPing(peerID) {
        const interval = setInterval(() => {
            const info = this.connections.get(peerID);
            if (!info || !info.conn.open) return clearInterval(interval);
            info.conn.send({ type: 'ping', t: Date.now() });
        }, 10000);
    },

    handleData(data, senderID) {
        switch (data.type) {
            case 'ping':
                this.connections.get(senderID)?.conn.send({ type: 'pong', t: data.t });
                break;
            case 'pong':
                const info = this.connections.get(senderID);
                if (info) info.latency = Date.now() - data.t;
                break;
            case 'peer_discovery':
                // Mesh Discovery: Connect to any unknown peers in the list
                data.peers.forEach(id => {
                    if (id !== this.peerID && !this.connections.has(id)) {
                        this.connectToPeer(id);
                    }
                });
                break;
            case 'delta':
                State.applyDelta(data);
                break;
            case 'full_sync':
                State.applyFullSync(data.data);
                break;
            case 'chat':
                State.addMessage(data.text, senderID, data.avatar, data.lifetime);
                break;
            case 'vote_poll':
                State.votePoll(data.pollId, data.optionIndex, senderID);
                break;
            case 'player_sync':
                window.dispatchEvent(new CustomEvent('p2p-player-sync', { detail: data }));
                break;
            case 'kick':
                Utils.toast('Kicked from Mesh', 'error');
                setTimeout(() => location.reload(), 1000);
                break;
        }
    },

    broadcast(data, exclude = []) {
        // In a TRUE Full-Mesh, we broadcast to ALL direct neighbors
        this.connections.forEach((info, id) => {
            if (!exclude.includes(id) && info.conn.open) {
                info.conn.send(data);
            }
        });
    },

    kickPeer(peerID) {
        if (!this.isHost) return;
        this.connections.get(peerID)?.conn.send({ type: 'kick' });
        this.connections.get(peerID)?.conn.close();
    }
};

window.P2P = P2P;
export default P2P;
