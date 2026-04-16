/**
 * NEXUS MESH - P2P Engine (PeerJS)
 */
import Utils from './utils.js';
import State from './state.js';
import Settings from './settings.js';

const P2P = {
    peer: null,
    connections: new Map(), // ID -> { conn, latency, joinedAt }
    peerID: null,
    roomID: null,
    isHost: false,
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
                this.reconnectAttempts = 0;
                if (!this.isHost) this.connectToHost(this.roomID);
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                if (this.isHost) {
                    if (this.connections.size >= Settings.current.maxPeers) {
                        conn.close();
                        return;
                    }
                    if (Settings.current.requireApproval) {
                    if (!confirm(`Peer ${conn.peer} wants to join. Approve?`)) {
                        conn.close();
                        return;
                    }
                }
                this.handleConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error(err);
                Utils.toast(`P2P Error: ${err.type}`, 'error');
                if (err.type === 'peer-unavailable' && !this.isHost) {
                    Utils.toast('Host not found', 'error');
                }
            });

            this.peer.on('disconnected', () => {
                this.attemptReconnect();
            });
        });
    },

    attemptReconnect() {
        if (this.reconnectAttempts < 5) {
            this.reconnectAttempts++;
            const delay = Math.pow(2, this.reconnectAttempts) * 1000;
            Utils.toast(`Connection lost. Reconnecting in ${delay/1000}s...`, 'warning');
            setTimeout(() => this.peer.reconnect(), delay);
        }
    },

    connectToHost(hostID) {
        const conn = this.peer.connect(hostID, { reliable: true });
        this.handleConnection(conn);
    },

    handleConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, {
                conn,
                latency: 0,
                joinedAt: Date.now()
            });
            Utils.toast(`Peer joined`, 'success');
            if (this.isHost) {
                conn.send({ type: 'full_sync', data: State.data });
            }
            this.startPing(conn.peer);
        });

        conn.on('data', (data) => this.handleData(data, conn.peer));

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            Utils.toast(`Peer left`, 'warning');
        });
    },

    startPing(peerID) {
        const interval = setInterval(() => {
            const peerInfo = this.connections.get(peerID);
            if (!peerInfo || !peerInfo.conn.open) {
                clearInterval(interval);
                return;
            }
            peerInfo.conn.send({ type: 'ping', sentAt: Date.now() });
        }, 5000);
    },

    handleData(data, senderID) {
        switch (data.type) {
            case 'ping':
                const peerInfoPing = this.connections.get(senderID);
                if (peerInfoPing) peerInfoPing.conn.send({ type: 'pong', sentAt: data.sentAt });
                break;
            case 'pong':
                const peerInfoPong = this.connections.get(senderID);
                if (peerInfoPong) {
                    peerInfoPong.latency = Date.now() - data.sentAt;
                }
                break;
            case 'kick':
                if (!this.isHost) {
                    Utils.toast('You have been kicked by the host', 'error');
                    location.reload();
                }
                break;
            case 'delta':
                State.applyDelta(data);
                if (this.isHost) this.broadcast(data, [senderID]);
                break;
            case 'full_sync':
                State.applyFullSync(data.data);
                break;
            case 'player_sync':
                window.dispatchEvent(new CustomEvent('p2p-player-sync', { detail: data }));
                if (this.isHost) this.broadcast(data, [senderID]);
                break;
            case 'chat':
                State.addMessage(data.text, senderID, data.avatar, data.lifetime);
                if (this.isHost) this.broadcast(data, [senderID]);
                break;
            case 'vote_poll':
                State.votePoll(data.pollId, data.optionIndex, senderID);
                if (this.isHost) this.broadcast(data, [senderID]);
                break;
        }
    },

    kickPeer(peerID) {
        if (!this.isHost) return;
        const peerInfo = this.connections.get(peerID);
        if (peerInfo) {
            peerInfo.conn.send({ type: 'kick' });
            setTimeout(() => peerInfo.conn.close(), 500);
        }
    },

    broadcast(data, exclude = []) {
        this.connections.forEach((info, id) => {
            if (!exclude.includes(id) && info.conn.open) {
                info.conn.send(data);
            }
        });
    }
};

window.P2P = P2P;
export default P2P;
