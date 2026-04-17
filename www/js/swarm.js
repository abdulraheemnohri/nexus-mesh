/**
 * NEXUS MESH - BitTorrent-inspired Swarm Engine
 */
import Utils from './utils.js';
import P2P from './core.js';

class SwarmEngine {
    constructor() {
        this.torrents = new Map(); // InfoHash -> TorrentData
        this.pieceSize = 32 * 1024; // 32KB pieces
    }

    async createTorrent(file) {
        const buffer = await file.arrayBuffer();
        const totalPieces = Math.ceil(buffer.byteLength / this.pieceSize);
        const pieces = [];

        for (let i = 0; i < totalPieces; i++) {
            const chunk = buffer.slice(i * this.pieceSize, (i + 1) * this.pieceSize);
            pieces.push({
                index: i,
                data: chunk,
                hash: await this.hashPiece(chunk),
                verified: true
            });
        }

        const infoHash = Utils.generateID(12);
        const torrent = {
            infoHash,
            name: file.name,
            size: file.size,
            totalPieces,
            pieces,
            availability: new Array(totalPieces).fill(true)
        };

        this.torrents.set(infoHash, torrent);
        this.announce(infoHash);
        return infoHash;
    }

    async hashPiece(data) {
        const msgUint8 = new Uint8Array(data);
        const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    announce(infoHash) {
        const torrent = this.torrents.get(infoHash);
        P2P.broadcast({
            type: 'swarm_announce',
            infoHash,
            name: torrent.name,
            size: torrent.size,
            totalPieces: torrent.totalPieces,
            availability: torrent.availability
        });
    }

    handleAnnounce(data, sid) {
        if (this.torrents.has(data.infoHash)) return;

        this.torrents.set(data.infoHash, {
            infoHash: data.infoHash,
            name: data.name,
            size: data.size,
            totalPieces: data.totalPieces,
            pieces: new Array(data.totalPieces).fill(null),
            availability: new Array(data.totalPieces).fill(false),
            sources: new Map([[sid, data.availability]])
        });

        window.dispatchEvent(new CustomEvent('swarm-new-torrent', { detail: data.infoHash }));
        this.requestNextPiece(data.infoHash);
    }

    requestNextPiece(infoHash) {
        const torrent = this.torrents.get(infoHash);
        const nextIndex = torrent.availability.indexOf(false);
        if (nextIndex === -1) return;

        // Find sources that have this piece
        const sources = Array.from(torrent.sources.entries())
            .filter(([id, avail]) => avail[nextIndex])
            .map(([id]) => id);

        if (sources.length > 0) {
            const randomSource = sources[Math.floor(Math.random() * sources.length)];
            P2P.connections.get(randomSource)?.conn.send({
                type: 'swarm_request',
                infoHash,
                index: nextIndex
            });
        }
    }

    handleRequest(data, sid) {
        const torrent = this.torrents.get(data.infoHash);
        if (!torrent || !torrent.pieces[data.index]) return;

        P2P.connections.get(sid)?.conn.send({
            type: 'swarm_piece',
            infoHash: data.infoHash,
            index: data.index,
            data: torrent.pieces[data.index].data
        });
    }

    async handlePiece(data, sid) {
        const torrent = this.torrents.get(data.infoHash);
        if (!torrent || torrent.availability[data.index]) return;

        torrent.pieces[data.index] = { data: data.data, verified: true };
        torrent.availability[data.index] = true;

        window.dispatchEvent(new CustomEvent('swarm-progress', {
            detail: { infoHash: data.infoHash, percent: (torrent.availability.filter(a => a).length / torrent.totalPieces) * 100 }
        }));

        if (torrent.availability.every(a => a)) {
            Utils.toast(`Swarm Transfer Complete: ${torrent.name}`, 'success');
            this.announce(data.infoHash); // Now we are a seeder
        } else {
            this.requestNextPiece(data.infoHash);
        }
    }
}

export default new SwarmEngine();
