/**
 * NEXUS MESH - P2P Engine (PeerJS)
 */
import Utils from './utils.js';
import State from './state.js';

const P2P = {
    peer: null,
    connections: new Map(),
    peerID: null,
    roomID: null,
    isHost: false,

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
                if (!this.isHost) this.connectToHost(this.roomID);
                resolve(id);
            });

            this.peer.on('connection', (conn) => this.handleConnection(conn));
            this.peer.on('error', (err) => {
                console.error(err);
                Utils.toast(`P2P Error: ${err.type}`, 'error');
            });
            this.peer.on('disconnected', () => this.peer.reconnect());
        });
    },

    connectToHost(hostID) {
        const conn = this.peer.connect(hostID, { reliable: true });
        this.handleConnection(conn);
    },

    handleConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            Utils.toast(`Peer joined`, 'success');
            if (this.isHost) {
                conn.send({ type: 'full_sync', data: State.data });
            }
        });

        conn.on('data', (data) => this.handleData(data, conn.peer));
        conn.on('close', () => {
            this.connections.delete(conn.peer);
            Utils.toast(`Peer left`, 'warning');
        });
    },

    handleData(data, senderID) {
        switch (data.type) {
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
        }
    },

    broadcast(data, exclude = []) {
        this.connections.forEach((conn, id) => {
            if (!exclude.includes(id) && conn.open) {
                conn.send(data);
            }
        });
    }
};

window.P2P = P2P;
export default P2P;
