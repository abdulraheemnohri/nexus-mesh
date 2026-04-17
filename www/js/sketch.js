/**
 * NEXUS MESH - Collaborative Sketchboard
 */
import P2P from './core.js';

class Sketchboard {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.drawing = false;
        this.color = '#00f2ff';
        this.lineWidth = 3;
    }

    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Resize canvas
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.setupListeners();

        window.addEventListener('p2p-draw', (e) => this.drawFromPeer(e.detail));
        window.addEventListener('p2p-clear-canvas', () => this.clear(false));
    }

    setupListeners() {
        const start = (e) => {
            this.drawing = true;
            this.draw(e);
        };
        const end = () => {
            this.drawing = false;
            this.ctx.beginPath();
        };
        const move = (e) => {
            if (!this.drawing) return;
            this.draw(e);
        };

        this.canvas.onmousedown = start;
        this.canvas.onmousemove = move;
        this.canvas.onmouseup = end;
        this.canvas.onmouseout = end;

        this.canvas.ontouchstart = (e) => { e.preventDefault(); start(e.touches[0]); };
        this.canvas.ontouchmove = (e) => { e.preventDefault(); move(e.touches[0]); };
        this.canvas.ontouchend = end;

        document.getElementById('sketch-color').onchange = (e) => this.color = e.target.value;
        document.getElementById('sketch-clear').onclick = () => this.clear(true);
    }

    draw(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);

        // Broadcast to mesh
        P2P.broadcast({
            type: 'draw',
            x: x / this.canvas.width,
            y: y / this.canvas.height,
            color: this.color,
            isDrawing: this.drawing
        });
    }

    drawFromPeer(data) {
        const x = data.x * this.canvas.width;
        const y = data.y * this.canvas.height;

        this.ctx.strokeStyle = data.color;
        this.ctx.lineWidth = this.lineWidth;

        if (!data.isDrawing) {
            this.ctx.beginPath();
            return;
        }

        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
    }

    clear(broadcast = true) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (broadcast) P2P.broadcast({ type: 'clear_canvas' });
    }
}

export default new Sketchboard();
