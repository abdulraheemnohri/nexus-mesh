/**
 * NEXUS MESH - Hyper-Swarm Workspace UI
 */
import Utils from './utils.js';
import State from './state.js';
import P2P from './core.js';
import Settings from './settings.js';
import Brain from './brain.js';
import Evolution from './evolution.js';
import Swarm from './swarm.js';
import Sketchboard from './sketch.js';

const UI = {
    player: null,
    isPlayerReady: false,
    syncInProgress: false,
    audioCtx: null,
    totalTraffic: 0,
    startTime: Date.now(),

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
            this.updateTimestamps();
            this.updateTopology();
            this.updateBrainStatus();
            this.updateDiagnostics();
        }, 1000);

        window.addEventListener('mesh-updated', () => this.updateTopology());
        window.addEventListener('mesh-log', (e) => this.log(e.detail));

        Sketchboard.init("sketch-canvas");
    },

    setupSwarmListeners() {
        window.addEventListener('swarm-new-torrent', (e) => {
            const torrent = Swarm.torrents.get(e.detail);
            this.renderTorrent(torrent);
            Utils.toast('Swarm: New file detected', 'info');
        });
        window.addEventListener('swarm-progress', (e) => {
            const el = document.getElementById(`swarm-progress-${e.detail.infoHash}`);
            if (el) el.style.width = `${e.detail.percent}%`;
        });
    },

    log(msg) {
        const log = document.getElementById("system-log");
        if (log) {
            const entry = document.createElement("div");
            entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            log.prepend(entry);
            if (log.children.length > 20) log.lastChild.remove();
        }
    },

    updateBrainStatus() {
        const brainInfo = document.getElementById('evolution-hud');
        if (brainInfo) {
            const active = Evolution.rules.filter(r => r.condition(Brain.metrics)).map(r => r.name);
            brainInfo.textContent = active.length > 0 ? 'INTELLIGENCE: ' + active[0] : 'NEURAL STATE: BALANCED';
        }
    },

    trackTraffic(bytes) {
        this.totalTraffic += bytes;
        const trafficEl = document.getElementById('diag-traffic');
        if (trafficEl) trafficEl.textContent = Math.round(this.totalTraffic / 1024) + 'kb';
    },

    updateDiagnostics() {
        const uptimeEl = document.getElementById('diag-uptime');
        if (uptimeEl) uptimeEl.textContent = Math.floor((Date.now() - this.startTime) / 1000) + 's';
        const stabilityEl = document.getElementById('diag-stability');
        if (stabilityEl) {
            const lats = Array.from(P2P.connections.values()).map(i => i.latency);
            const stability = lats.length === 0 ? 100 : Math.max(0, 100 - (lats.filter(l => l > 500).length * 20));
            stabilityEl.textContent = stability + '%';
        }
    },

    playSound(type) {
        if (!Settings.current.soundFx) return;
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            const now = this.audioCtx.currentTime;
            osc.frequency.setValueAtTime(type === 'join' ? 440 : 660, now);
            gain.gain.setValueAtTime(0.02, now);
            osc.start(); osc.stop(now + 0.1);
        } catch(e) {}
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
            if (id) State.addToQueue(id, 'Swarm Media', P2P.peerID);
        });
        document.getElementById('send-message')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('wall-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });
        document.getElementById('create-poll-btn')?.addEventListener('click', () => document.getElementById('poll-modal').style.display = 'flex');

        document.getElementById('drop-zone')?.addEventListener('click', () => document.getElementById('file-input').click());
        document.getElementById('file-input')?.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const infoHash = await Swarm.createTorrent(e.target.files[0]);
                this.renderTorrent(Swarm.torrents.get(infoHash));
            }
        });

        document.getElementById('settings-toggle')?.addEventListener('click', () => window.toggleSettings());
        document.getElementById('copy-link')?.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href + "?room=" + P2P.roomID).then(() => Utils.toast("Link Copied", "success"));
        });
        document.getElementById('clear-local')?.addEventListener('click', async () => {
            if (confirm('Wipe everything?')) { await Utils.db.clear(); localStorage.clear(); location.reload(); }
        });
    },

    renderTorrent(t) {
        const container = document.getElementById('file-list');
        const card = document.createElement('div');
        card.className = 'file-card animate-slide';
        card.id = `torrent-${t.infoHash}`;
        card.innerHTML = `
            <div style="flex: 1;">
                <p style="font-size: 0.9rem; font-weight: 700;">${t.name}</p>
                <div class="progress-track"><div class="progress-fill" id="swarm-progress-${t.infoHash}" style="width: ${t.availability.every(a=>a)?'100':'0'}%"></div></div>
                <p style="font-size: 0.6rem; color: var(--text-muted); margin-top: 0.4rem;">SWARM HASH: ${t.infoHash}</p>
            </div>
            <button class="btn-primary" onclick="window.UI.saveTorrent('${t.infoHash}')" style="padding:0.4rem 0.8rem; font-size:0.7rem;">SAVE</button>
        `;
        container.prepend(card);
    },

    saveTorrent(infoHash) {
        const t = Swarm.torrents.get(infoHash);
        if (!t || !t.availability.every(a => a)) return Utils.toast('Wait for download...', 'warning');
        const blob = new Blob(t.pieces.map(p => p.data));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = t.name; a.click();
    },

    openDM(id) {
        const text = prompt("Signal private node " + id.substring(0,4));
        if (text) State.sendDM(id, text);
    },

    setupMobileTabs() {
        document.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.app-section').forEach(s => s.classList.add('mobile-hide'));
                document.getElementById(tab.dataset.target).classList.remove('mobile-hide');
                document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });
    },

    setupKeyboardNav() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('settings-panel').classList.remove('active');
                document.getElementById('overlay').classList.remove('active');
                document.getElementById('poll-modal').style.display = 'none';
            }
        });
    },

    setupNetworkStatus() {
        window.addEventListener('online', () => Utils.toast('Mesh: Back Online', 'success'));
        window.addEventListener('offline', () => Utils.toast('Mesh: Working Offline', 'warning'));
    },

    async initRoom(roomID = null) {
        try {
            document.getElementById('setup-screen').classList.add('hide');
            document.getElementById('app-screen').classList.remove('hide');
            await P2P.init(roomID);
            await State.init(P2P.roomID, P2P.isHost);
            document.getElementById('display-room-id').textContent = P2P.roomID;
            if (document.getElementById('room-qr')) document.getElementById('room-qr').src = Utils.generateQR(window.location.href + "?room=" + P2P.roomID);
            this.playSound('join');
            this.log('Node Identified: ' + P2P.peerID.substring(0,8));
        } catch (e) { Utils.toast('Handshake failed', 'error'); }
    },

    setupYouTubeAPI() {
        window.onYouTubeIframeAPIReady = () => {
            this.player = new YT.Player('youtube-player', {
                height: '100%', width: '100%', videoId: '',
                playerVars: { autoplay: 0, controls: 1, modestbranding: 1 },
                events: {
                    onReady: () => { this.isPlayerReady = true; if (State.data.player.videoID) this.player.loadVideoById(State.data.player.videoID); },
                    onStateChange: (e) => this.handlePlayerStateChange(e)
                }
            });
        };
    },

    handlePlayerStateChange(event) {
        if (this.syncInProgress || (!P2P.isHost && State.data.player.hostOnly)) return;
        P2P.broadcast({ type: 'player_sync', action: event.data === YT.PlayerState.PLAYING ? 'play' : 'pause', time: this.player.getCurrentTime() });
    },

    sendMessage() {
        const text = document.getElementById('wall-input').value.trim();
        if (text) {
            State.addMessage(text, P2P.peerID, `https://api.dicebear.com/7.x/bottts/svg?seed=${P2P.peerID}`, Settings.current.msgLifetime);
            document.getElementById('wall-input').value = '';
            this.playSound('msg');
        }
    },

    render(data) {
        this.renderQueue(data.queue);
        this.renderPolls(data.polls);
        this.renderWall(data.wall);
        this.renderStatus();
        this.renderPeerList();
        if (this.isPlayerReady && data.player.videoID && data.player.videoID !== this.player.getVideoData().video_id) this.player.loadVideoById(data.player.videoID);
    },

    renderPeerList() {
        const container = document.getElementById('peer-list');
        if (!container) return;
        const peers = Array.from(P2P.connections.entries());
        container.innerHTML = peers.map(([id, info]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.8rem;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:0.6rem; border: 1px solid var(--border);">
                <div>
                    <p style="font-size:0.75rem;font-family:'JetBrains Mono';font-weight:700;">${id.substring(0,8)}</p>
                    <p style="font-size:0.6rem; color:var(--text-muted);">LATENCY: ${info.latency}ms</p>
                </div>
                <div style="display:flex;gap:0.4rem;align-items:center;">
                    <button class="text-btn" onclick="window.UI.openDM('${id}')" style="font-size:0.8rem;">✉️</button>
                    ${id === P2P.roomID ? '<span style="font-size:0.5rem;background:var(--primary);color:#000;padding:0.1rem 0.3rem;border-radius:4px;font-weight:800;">HOST</span>' : ''}
                    ${P2P.isHost ? `<button class="text-btn" onclick="P2P.kickPeer('${id}')" style="color:var(--accent);font-size:0.8rem;">✕</button>` : ""}
                </div>
            </div>
        `).join("");
    },

    renderQueue(q) {
        const container = document.getElementById('queue-list');
        if (!container) return;
        container.innerHTML = q.map(item => `
            <div class="queue-item">
                <div style="flex:1;"><p style="font-weight:700;font-size:0.85rem;">${item.title}</p></div>
                <div style="display:flex;gap:0.4rem;">
                    <button class="btn-ghost" onclick="window.State.voteQueue('${item.id}', '${P2P.peerID}', 1)" style="padding: 0.3rem 0.6rem; font-size:0.8rem; border-radius:8px;">👍 ${item.votes}</button>
                    <button class="btn-primary" onclick="window.State.update('player.videoID', '${item.videoID}')" style="padding: 0.3rem 0.6rem; border-radius:8px;">▶</button>
                </div>
            </div>
        `).join('') || '<div class="skeleton" style="height:40px;opacity:0.05;"></div>';
    },

    renderPolls(p) {
        const container = document.getElementById('polls-list');
        if (!container) return;
        container.innerHTML = p.map(poll => {
            const total = poll.options.reduce((s, o) => s + o.votes, 0);
            return `
                <div class="poll-item card" style="padding:1rem;margin-bottom:1rem;background:rgba(255,255,255,0.02);">
                    <p style="font-weight:700;font-size:0.9rem;margin-bottom:1rem;">${poll.question}</p>
                    ${poll.options.map((opt, idx) => `
                        <div class="poll-option" onclick="window.State.votePoll('${poll.id}', ${idx}, '${P2P.peerID}')">
                            <div class="poll-progress" style="width:${total > 0 ? (opt.votes/total)*100 : 0}%"></div>
                            <span class="poll-option-text">${opt.text}</span>
                            <span class="poll-option-count">${opt.votes}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');
    },

    renderWall(w) {
        const container = document.getElementById('wall-messages');
        if (!container) return;

        // Include DMs in the wall view for local node
        const myDMs = State.data.dms.filter(d => d.to === P2P.peerID || d.from === P2P.peerID);
        const allMsgs = [...w, ...myDMs.map(d=>({...d, isDM:true}))].sort((a,b) => b.createdAt-a.createdAt || b.t-a.t);

        container.innerHTML = allMsgs.map(msg => `
            <div class="msg ${msg.isDM ? 'dm-msg' : ''}" id="msg-${msg.id}">
                <img src="${msg.senderAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed='+msg.from}" style="width:34px;height:34px;border-radius:50%;border:1px solid var(--border);">
                <div style="flex:1;">
                    <p style="font-size:0.6rem; color:var(--text-muted); margin-bottom:0.2rem; font-weight:700;">${(msg.senderID || msg.from).substring(0,8)} ${msg.isDM ? '[PRIVATE]' : ''}</p>
                    <p style="font-size:0.85rem;line-height:1.4;">${State.deobfuscate(msg.text)}</p>
                </div>
                ${!msg.isDM ? `<div class="msg-lifetime-bar" style="animation: shrink ${(msg.expiresAt-msg.createdAt)/1000}s linear forwards;"></div>` : ''}
            </div>
        `).join('') || '<div class="skeleton" style="height:30px;opacity:0.05;width:70%;"></div>';
    },

    renderStatus() {
        const dot = document.getElementById('conn-status');
        if (dot) dot.className = `connection-dot ${P2P.connections.size > 0 ? 'online' : 'offline'}`;
    },

    updateTimestamps() {},

    updateTopology() {
        const container = document.getElementById('topology-viz');
        if (!container) return;
        container.innerHTML = '';
        const nodes = Array.from(P2P.connections.entries());
        nodes.push(['me', { latency: 0 }]);
        const centerX = 120, centerY = 120, radius = 80;
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
                line.style.left = `${x1}px`;
                line.style.top = `${y1}px`;
                line.style.transform = `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
                container.appendChild(line);
            });
            const node = document.createElement('div');
            node.className = 'peer-node';
            node.style.left = `${x1}px`; node.style.top = `${y1}px`;
            if (n1[0] === 'me') { node.style.background = 'var(--primary)'; node.style.width = '20px'; node.style.height = '20px'; }
            container.appendChild(node);
        });
    }
};

window.UI = UI;
export default UI;
