/**
 * NEXUS MESH - P2P File Exchange
 */
import P2P from './core.js';
import Utils from './utils.js';

class FileExchange {
    constructor() {
        this.receivedChunks = new Map(); // FileID -> Array
    }

    init() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.onclick = () => fileInput.click();
        fileInput.onchange = (e) => this.handleFiles(e.target.files);

        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; };
        dropZone.ondragleave = () => dropZone.style.borderColor = 'var(--border)';
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border)';
            this.handleFiles(e.dataTransfer.files);
        };

        window.addEventListener('p2p-file-chunk', (e) => this.handleIncomingChunk(e.detail));
    }

    async handleFiles(files) {
        for (const file of files) {
            const id = Utils.generateID(10);
            this.renderTransfer(id, file.name, 'sending');

            const buffer = await file.arrayBuffer();
            const chunkSize = 16 * 1024; // 16KB
            const totalChunks = Math.ceil(buffer.byteLength / chunkSize);

            for (let i = 0; i < totalChunks; i++) {
                const chunk = buffer.slice(i * chunkSize, (i + 1) * chunkSize);
                P2P.broadcast({
                    type: 'file_chunk',
                    id,
                    name: file.name,
                    size: file.size,
                    chunk: chunk,
                    index: i,
                    total: totalChunks
                });
                this.updateProgress(id, ((i + 1) / totalChunks) * 100);
            }
            Utils.toast(`File Broadcasted: ${file.name}`, 'success');
        }
    }

    handleIncomingChunk(data) {
        if (!this.receivedChunks.has(data.id)) {
            this.receivedChunks.set(data.id, new Array(data.total));
            this.renderTransfer(data.id, data.name, 'receiving');
        }

        const chunks = this.receivedChunks.get(data.id);
        chunks[data.index] = data.chunk;

        const receivedCount = chunks.filter(c => c).length;
        this.updateProgress(data.id, (receivedCount / data.total) * 100);

        if (receivedCount === data.total) {
            this.assembleAndDownload(data.id, data.name);
        }
    }

    assembleAndDownload(id, name) {
        const chunks = this.receivedChunks.get(id);
        const blob = new Blob(chunks);
        const url = URL.createObjectURL(blob);

        const card = document.getElementById(`file-${id}`);
        if (card) {
            card.innerHTML = `
                <div style="flex: 1;">
                    <p style="font-size: 0.9rem;">${name}</p>
                    <p style="font-size: 0.7rem; color: var(--success);">TRANSFER COMPLETE</p>
                </div>
                <a href="${url}" download="${name}" class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.7rem;">SAVE</a>
            `;
        }
        this.receivedChunks.delete(id);
    }

    renderTransfer(id, name, type) {
        const container = document.getElementById('file-list');
        const card = document.createElement('div');
        card.className = 'file-card animate-slide';
        card.id = `file-${id}\ survival`;
        card.id = `file-${id}`;
        card.innerHTML = `
            <div style="flex: 1;">
                <p style="font-size: 0.9rem;">${name}</p>
                <div class="progress-track"><div class="progress-fill" id="progress-${id}" style="width: 0%"></div></div>
                <p style="font-size: 0.6rem; color: var(--text-muted); margin-top: 0.3rem;">${type.toUpperCase()}</p>
            </div>
        `;
        container.prepend(card);
    }

    updateProgress(id, percent) {
        const fill = document.getElementById(`progress-${id}`);
        if (fill) fill.style.width = `${percent}%`;
    }
}

export default new FileExchange();
