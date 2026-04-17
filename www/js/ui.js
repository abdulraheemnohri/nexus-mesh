/**
 * NEXUS MESH V5 - Ultimate Workspace UI
 */
import Security from './security.js';
import Evolution from './evolution.js';
import Utils from './utils.js';
import State from './state.js';
import P2P from './core.js';
import Settings from './settings.js';
import Swarm from './swarm.js';
import Sketchboard from './sketch.js';
import Brain from './brain.js';

const UI = {
    player: null,
    isPlayerReady: false,
    syncInProgress: false,
    audioCtx: null,
    totalTraffic: 0,
    startTime: Date.now(),
    pulses: [],

    init() {
        this.setupEventListeners();
        this.setupYouTubeAPI();
        this.setupMobileTabs();
        this.setupKeyboardNav();
        this.setupNetworkStatus();
        this.setupSwarmListeners();

        State.subscribe((data) => this.render(data));
        this.render(State.data);

        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) { document.getElementById('join-id').value = room; this.initRoom(room); }

        setInterval(() => {
            State.cleanupExpired();
            this.updateTopology();
            this.updateBrainStatus();
            this.updateDiagnostics();
        }, 1000);

        window.addEventListener('mesh-updated', () => this.updateTopology());
        window.addEventListener('mesh-log', (e) => this.log(e.detail));
        Sketchboard.init("sketch-canvas");
    },

    log(msg) {
        const log = document.getElementById("system-log");
        if (log) {
            const entry = document.createElement("div");
            entry.className = "log-entry animate-slide";
            entry.innerHTML = `<span style="opacity:0.4;">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
            log.prepend(entry);
            if (log.children.length > 25) log.lastChild.remove();
        }
    },

    updateBrainStatus() {
        const hud = document.getElementById('evolution-hud');
        if (hud) {
            const active = Evolution.rules.filter(r => r.condition(Brain.metrics)).map(r => r.name);
            hud.innerHTML = `NEURAL STATE: <b style="color:var(--primary);">${active.length > 0 ? active[0] : 'STEADY'}</b>`;
        }
    },

    trackTraffic(bytes) {
        this.totalTraffic += bytes;
        const el = document.getElementById('diag-traffic');
        if (el) el.textContent = (this.totalTraffic / 1024).toFixed(1) + 'kb';
        this.createPulse();
    },

    createPulse() {
        // Visual Data Pulse logic for Topology
        const hub = document.getElementById('topology-viz');
        if (!hub) return;
        const pulse = document.createElement('div');
        pulse.className = 'data-pulse';
        pulse.style.left = '50%'; pulse.style.top = '50%';
        hub.appendChild(pulse);
        setTimeout(() => pulse.remove(), 1000);
    },

    updateDiagnostics() {
        const up = document.getElementById('diag-uptime');
        if (up) up.textContent = Math.floor((Date.now() - this.startTime) / 1000) + 's';
        const stab = document.getElementById('diag-stability');
        if (stab) {
            const lats = Array.from(P2P.connections.values()).map(i => i.latency);
            const val = lats.length === 0 ? 100 : Math.max(0, 100 - (lats.filter(l => l > 400).length * 25));
            stab.textContent = val + '%';
        }
    },

    setupEventListeners() {
        document.getElementById('create-room')?.addEventListener('click', () => this.initRoom());
        document.getElementById('join-room')?.addEventListener('click', () => {
            const id = document.getElementById('join-id')?.value.toUpperCase();
            if (id) this.initRoom(id);
        });
        document.getElementById('scan-mesh')?.addEventListener('click', () => P2P.scanLocalMesh());
        document.getElementById('add-to-queue')?.addEventListener('click', () => {
            const url = document.getElementById('video-url')?.value;
            const id = Utils.parseYouTubeID(url);
            if (id) State.addToQueue(id, 'Sync Stream', P2P.peerID);
        });
        document.getElementById('send-message')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('wall-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });
        document.getElementById('create-poll-btn')?.addEventListener('click', () => document.getElementById('poll-modal').style.display = 'flex');

        document.getElementById('drop-zone')?.addEventListener('click', () => document.getElementById('file-input').click());
        document.getElementById('file-input')?.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const h = await Swarm.createTorrent(e.target.files[0]);
                this.renderTorrent(Swarm.torrents.get(h));
                this.log('Swarm: Generating Metadata for ' + e.target.files[0].name);
            }
        });

        document.getElementById('settings-toggle')?.addEventListener('click', () => window.toggleSettings());
        document.getElementById('copy-link')?.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href + "?room=" + P2P.roomID).then(() => Utils.toast("Link Encrypted & Copied", "success"));
        });
        document.getElementById('clear-local')?.addEventListener('click', async () => {
            if (confirm('Irreversibly wipe all data?')) { await Utils.db.clear(); localStorage.clear(); location.reload(); }
        });
    },

    async initRoom(roomID = null) {
        try {
            document.getElementById('setup-screen').classList.add('hide');
            document.getElementById('app-screen').classList.remove('hide');
            if(roomID) document.getElementById('vault-entry').classList.remove('hide');

            await P2P.init(roomID);
            const pass = document.getElementById('mesh-pass').value;
            if(pass) await Security.setPassphrase(pass);

            await State.init(P2P.roomID, P2P.isHost);
            document.getElementById('display-room-id').textContent = P2P.roomID;
            if (document.getElementById('room-qr')) document.getElementById('room-qr').src = Utils.generateQR(window.location.href + "?room=" + P2P.roomID);
            this.log('Node Identified: ' + P2P.peerID.substring(0,8));
        } catch (e) { Utils.toast('Mesh Handshake Failed', 'error'); }
    },

    setupYouTubeAPI() {
        window.onYouTubeIframeAPIReady = () => {
            this.player = new YT.Player('youtube-player', {
                height: '100%', width: '100%', videoId: '',
                playerVars: { autoplay: 0, controls: 1, modestbranding: 1 },
                events: {
                    onReady: () => { this.isPlayerReady = true; if (State.data.player.videoID) this.player.loadVideoById(State.data.player.videoID); },
                    onStateChange: (e) => {
                        if (!this.syncInProgress) P2P.broadcast({ type: 'player_sync', action: e.data === YT.PlayerState.PLAYING ? 'play' : 'pause', time: this.player.getCurrentTime() });
                    }
                }
            });
        };
    },

    sendMessage() {
        const input = document.getElementById('wall-input');
        const text = input.value.trim();
        if (text) { State.addMessage(text, P2P.peerID, `https://api.dicebear.com/7.x/bottts/svg?seed=${P2P.peerID}`, Settings.current.msgLifetime); input.value = ''; }
    },

    async render(data) {
        this.renderQueue(data.queue);
        this.renderPolls(data.polls);
        await this.renderWall(data.wall);
        this.renderPeerList();
        if (this.isPlayerReady && data.player.videoID && data.player.videoID !== this.player.getVideoData().video_id) this.player.loadVideoById(data.player.videoID);
    },

    renderPeerList() {
        const container = document.getElementById('peer-list');
        if (!container) return;
        container.innerHTML = Array.from(P2P.connections.keys()).map(id => `
            <div class="peer-item animate-slide">
                <span style="font-family:monospace;">${id.substring(0,8)}</span>
                ${P2P.isHost ? `<button class="text-btn" onclick="P2P.kickPeer('${id}')">✕</button>` : ""}
            </div>
        `).join("");
    },

    renderQueue(q) {
        const container = document.getElementById('queue-list');
        if (!container) return;
        container.innerHTML = q.map(item => `
            <div class="queue-item animate-slide">
                <p style="flex:1; font-weight:700; font-size:0.8rem;">${item.title}</p>
                <button class="btn-primary" onclick="window.State.update('player.videoID', '${item.videoID}')" style="padding:0.3rem 0.6rem; font-size:0.7rem;">PLAY</button>
            </div>
        `).join('') || '<div class="skeleton" style="height:30px;opacity:0.05;"></div>';
    },

    renderPolls(p) {
        const container = document.getElementById('polls-list');
        if (!container) return;
        container.innerHTML = p.map(poll => {
            const total = poll.options.reduce((s, o) => s + o.votes, 0);
            return `
                <div class="poll-item card" style="padding:1rem;margin-bottom:0.8rem;background:rgba(255,255,255,0.01);">
                    <p style="font-weight:700;font-size:0.85rem;margin-bottom:0.8rem;">${poll.question}</p>
                    ${poll.options.map((opt, idx) => `
                        <div class="poll-option" onclick="window.State.votePoll('${poll.id}', ${idx}, '${P2P.peerID}')">
                            <div class="poll-progress" style="width:${total > 0 ? (opt.votes/total)*100 : 0}%"></div>
                            <span class="poll-option-text">${opt.text}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');
    },

    async renderWall(w) {
        const container = document.getElementById('wall-messages');
        if (!container) return;
        const html = await Promise.all(w.map(async msg => {
            const text = await Security.decrypt(msg.text);
            return `<div class="msg animate-slide"><img src="${msg.senderAvatar}" style="width:30px;height:30px;border-radius:50%;"><div style="flex:1;"><p style="font-size:0.85rem;">${text}</p></div></div>`;
        }));
        container.innerHTML = html.join('') || '<div class="skeleton" style="height:20px;opacity:0.05;width:60%;"></div>';
    },

    renderTorrent(t) {
        const container = document.getElementById('file-list');
        const card = document.createElement('div');
        card.className = 'file-card animate-slide';
        card.innerHTML = `<div style="flex:1;"><p style="font-size:0.8rem;font-weight:700;">${t.name}</p>
        <div class="progress-track"><div class="progress-fill" id="swarm-progress-${t.infoHash}" style="width:0%"></div></div></div>`;
        container.prepend(card);
    },

    setupSwarmListeners() {
        window.addEventListener('swarm-progress', (e) => {
            const el = document.getElementById(`swarm-progress-${e.detail.infoHash}`);
            if (el) el.style.width = `${e.detail.percent}%`;
        });
    },

    setupMobileTabs() {
        document.querySelectorAll('.mobile-tab').forEach(tab => tab.addEventListener('click', () => {
            document.querySelectorAll('.app-section').forEach(s => s.classList.add('mobile-hide'));
            document.getElementById(tab.dataset.target).classList.remove('mobile-hide');
            document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        }));
    },

    setupKeyboardNav() { window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.getElementById('settings-panel').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); } }); },
    setupNetworkStatus() {},
    updateTopology() {
        const container = document.getElementById('topology-viz');
        if (!container) return;
        container.innerHTML = '';
        const nodes = Array.from(P2P.connections.entries());
        nodes.push(['me', { latency: 0 }]);
        const centerX = 150, centerY = 100, radius = 70;
        nodes.forEach((n1, i) => {
            const a1 = (i / nodes.length) * Math.PI * 2;
            const x1 = centerX + Math.cos(a1) * radius;
            const y1 = centerY + Math.sin(a1) * radius;
            nodes.forEach((n2, j) => {
                if (i >= j) return;
                const a2 = (j / nodes.length) * Math.PI * 2;
                const x2 = centerX + Math.cos(a2) * radius;
                const y2 = centerY + Math.sin(a2) * radius;
                const line = document.createElement('div');
                line.className = 'peer-line';
                const dist = Math.hypot(x2 - x1, y2 - y1);
                line.style.width = `${dist}px`;
                line.style.left = `${x1}px`; line.style.top = `${y1}px`;
                line.style.transform = `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
                container.appendChild(line);
            });
            const node = document.createElement('div');
            node.className = 'peer-node';
            node.style.left = `${x1}px`; node.style.top = `${y1}px`;
            if (n1[0] === 'me') { node.style.background = 'var(--primary)'; node.style.width = '16px'; node.style.height = '16px'; }
            container.appendChild(node);
        });
    }
};

window.UI = UI;
export default UI;
