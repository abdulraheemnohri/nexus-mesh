import Evolution from './evolution.js';
/**
 * NEXUS MESH V4 - Autonomous UI Layer
 */
import Utils from './utils.js';
import State from './state.js';
import P2P from './core.js';
import Settings from './settings.js';
import Brain from './brain.js';

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
            this.updateDiagnostics(); this.updateEvolutionHUD();
        }, 1000);

        window.addEventListener('mesh-updated', () => this.updateTopology());
        window.addEventListener('mesh-log', (e) => this.log(e.detail));
    },

    log(msg) {
        const log = document.getElementById("system-log");
        if (log) {
            const entry = document.createElement("div");
            entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            log.prepend(entry);
            if (log.children.length > 10) log.lastChild.remove();
        }
    },

    updateBrainStatus() {
        const brainInfo = document.getElementById('brain-status');
        if (brainInfo) {
            const status = Brain.isSuperNode ? 'SUPER NODE' : 'MESH NODE';
            brainInfo.textContent = `AUTONOMOUS: ${status} | ${Brain.state}`;
            brainInfo.className = Brain.isSuperNode ? 'brain-active' : 'brain-idle';
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
            stabilityEl.style.color = stability > 80 ? 'var(--success)' : 'var(--warning)';
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
            gain.gain.setValueAtTime(0.05, now);
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
            if (id) State.addToQueue(id, 'Syncing Media...', P2P.peerID);
        });
        document.getElementById('send-message')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('wall-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });
        document.getElementById('create-poll-btn')?.addEventListener('click', () => document.getElementById('poll-modal').style.display = 'flex');
        document.getElementById('submit-poll')?.addEventListener('click', () => {
            const q = document.getElementById('poll-q').value;
            const o = Array.from(document.querySelectorAll('.poll-opt-in')).map(i => i.value).filter(v => v.trim());
            if (q && o.length >= 2) {
                State.addPoll(q, o, document.getElementById('poll-anon').checked, 5, P2P.peerID);
                document.getElementById('poll-modal').style.display = 'none';
            }
        });
        document.getElementById('settings-toggle')?.addEventListener('click', () => window.toggleSettings());
        document.getElementById('copy-link')?.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href + "?room=" + P2P.roomID).then(() => Utils.toast("Link Copied", "success"));
        });
        document.getElementById('add-session')?.addEventListener('click', () => {
            const id = prompt("Join parallel mesh?");
            if (id) window.open(window.location.origin + window.location.pathname + "?room=" + id, "_blank");
        });
        document.getElementById('clear-local')?.addEventListener('click', async () => {
            if (confirm('Wipe Mesh Cache?')) { await Utils.db.clear(); localStorage.clear(); location.reload(); }
        });
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
        window.addEventListener('online', () => document.getElementById('offline-banner').classList.add('hide'));
        window.addEventListener('offline', () => document.getElementById('offline-banner').classList.remove('hide'));
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
            this.log('Mesh Node Activated: ' + P2P.peerID.substring(0,6));
        } catch (e) { Utils.toast('Mesh error', 'error'); }
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
        document.getElementById('msg-life-val').textContent = `${Settings.current.msgLifetime}s`;
    },

    renderPeerList() {
        const container = document.getElementById('peer-list');
        if (!container) return;
        const peers = Array.from(P2P.connections.keys());
        container.innerHTML = peers.map(id => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem;background:rgba(255,255,255,0.02);border-radius:8px;margin-bottom:0.4rem;">
                <span style="font-size:0.7rem;font-family:monospace;">${id.substring(0,8)}</span>
                <div style="display:flex;gap:0.4rem;">
                    ${id === P2P.roomID ? '<span style="font-size:0.6rem;background:var(--primary);color:#000;padding:0.1rem 0.2rem;border-radius:4px;">HOST</span>' : ''}
                    ${P2P.isHost ? `<button class="text-btn" onclick="P2P.kickPeer('${id}')" style="color:var(--accent);font-size:0.6rem;">KICK</button>` : `<button class="text-btn" onclick="P2P.proposeVote('kick', {peerID:'${id}'})" style="font-size:0.5rem;opacity:0.5;">VOTE KICK</button>`}
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
                    <button class="secondary-btn" onclick="window.State.voteQueue('${item.id}', '${P2P.peerID}', 1)">👍 ${item.votes}</button>
                    <button class="primary-btn" onclick="window.State.update('player.videoID', '${item.videoID}')">▶</button>
                </div>
            </div>
        `).join('') || '<div class="skeleton" style="height:40px;opacity:0.1;"></div>';
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
        container.innerHTML = w.map(msg => `
            <div class="msg" id="msg-${msg.id}">
                <img src="${msg.senderAvatar}" style="width:32px;height:32px;border-radius:50%;">
                <div style="flex:1;"><p style="font-size:0.85rem;line-height:1.4;">${State.deobfuscate(msg.text)}</p></div>
                <div class="msg-lifetime-bar" style="animation: shrink ${(msg.expiresAt-msg.createdAt)/1000}s linear forwards;"></div>
            </div>
        `).join('') || '<div class="skeleton" style="height:30px;opacity:0.1;width:60%;"></div>';
    },

    renderStatus() {
        const dot = document.getElementById('conn-status');
        if (dot) dot.className = `connection-dot ${P2P.connections.size > 0 ? 'online' : 'offline'}`;
    },

    updateTimestamps() {
        document.querySelectorAll('.poll-timer').forEach(el => {
            const diff = Math.floor((parseInt(el.dataset.expires) - Date.now()) / 1000);
            el.textContent = diff > 0 ? `Ends in ${Math.floor(diff/60)}m ${diff%60}s` : 'Closed';
        });
    },

    updateTopology() {
        const container = document.getElementById('topology-viz');
        if (!container) return;
        container.innerHTML = '';
        const nodes = Array.from(P2P.connections.entries());
        nodes.push(['me', { latency: 0 }]);
        const centerX = 90, centerY = 70, radius = 50;
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
            if (n1[0] === 'me') node.style.background = 'var(--accent)';
            container.appendChild(node);
        });
    }
};

window.UI = UI;
export default UI;

    updateEvolutionHUD() {
        const hud = document.getElementById('active-strategies');
        if (hud) {
            const active = Evolution.rules.filter(r => r.condition(Brain.metrics)).map(r => r.name);
            hud.textContent = active.length > 0 ? 'Active Strategies: ' + active.join(', ') : 'Optimal State - Observing...';
        }
    }
