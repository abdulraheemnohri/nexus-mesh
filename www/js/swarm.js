/**
 * NEXUS MESH - Optimized Swarm Engine
 */
import Utils from './utils.js';
import P2P from './core.js';
import Brain from './brain.js';

class SwarmEngine {
    constructor() {
        this.torrents = new Map();
        this.basePieceSize = 32 * 1024; // 32KB
    }

    async createTorrent(file) {
        // V5: Adaptive Piece Sizing
        const pieceSize = Brain.metrics.avgLatency > 300 ? 16 * 1024 : 64 * 1024;
        const buffer = await file.arrayBuffer();
        const totalPieces = Math.ceil(buffer.byteLength / pieceSize);
        const pieces = [];

        for (let i = 0; i < totalPieces; i++) {
            const chunk = buffer.slice(i * pieceSize, (i + 1) * pieceSize);
            pieces.push({ index: i, data: chunk, hash: await this.hashPiece(chunk), verified: true });
        }

        const infoHash = Utils.generateID(12);
        this.torrents.set(infoHash, { infoHash, name: file.name, size: file.size, totalPieces, pieces, availability: new Array(totalPieces).fill(true) });
        this.announce(infoHash);
        return infoHash;
    }

    async hashPiece(data) {
        const hashBuffer = await crypto.subtle.digest('SHA-1', new Uint8Array(data));
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    announce(infoHash) {
        const t = this.torrents.get(infoHash);
        P2P.broadcast({ type: 'swarm_announce', infoHash, name: t.name, size: t.size, totalPieces: t.totalPieces, availability: t.availability });
    }

    handleAnnounce(data, sid) {
        if (this.torrents.has(data.infoHash)) {
            this.torrents.get(data.infoHash).sources.set(sid, data.availability);
            return;
        }
        this.torrents.set(data.infoHash, { infoHash: data.infoHash, name: data.name, size: data.size, totalPieces: data.totalPieces, pieces: new Array(data.totalPieces).fill(null), availability: new Array(data.totalPieces).fill(false), sources: new Map([[sid, data.availability]]) });
        window.dispatchEvent(new CustomEvent('swarm-new-torrent', { detail: data.infoHash }));
        this.requestNextPiece(data.infoHash);
    }

    requestNextPiece(infoHash) {
        const t = this.torrents.get(infoHash);
        const next = t.availability.indexOf(false);
        if (next === -1) return;

        const sources = Array.from(t.sources.entries()).filter(([id, avail]) => avail[next]).map(([id]) => id);
        if (sources.length > 0) {
            const src = sources[Math.floor(Math.random() * sources.length)];
            P2P.connections.get(src)?.conn.send({ type: 'swarm_request', infoHash, index: next });
        }
    }

    handleRequest(data, sid) {
        const t = this.torrents.get(data.infoHash);
        if (!t || !t.pieces[data.index]) return;
        P2P.connections.get(sid)?.conn.send({ type: 'swarm_piece', infoHash: data.infoHash, index: data.index, data: t.pieces[data.index].data });
    }

    handlePiece(data, sid) {
        const t = this.torrents.get(data.infoHash);
        if (!t || t.availability[data.index]) return;
        t.pieces[data.index] = { data: data.data, verified: true };
        t.availability[data.index] = true;
        window.dispatchEvent(new CustomEvent('swarm-progress', { detail: { infoHash: data.infoHash, percent: (t.availability.filter(a => a).length / t.totalPieces) * 100 } }));
        if (t.availability.every(a => a)) {
            Utils.toast('Swarm Ready: ' + t.name, 'success');
            this.announce(data.infoHash);
        } else {
            this.requestNextPiece(data.infoHash);
        }
    }

    // V5: Predictive Seeding
    autoReplicate() {
        this.torrents.forEach((t, hash) => {
            if (t.availability.every(a => a) && P2P.connections.size > 0) {
                // Future: Pick rarest pieces in mesh and push them to high-stability nodes
            }
        });
    }
}

export default new SwarmEngine();
