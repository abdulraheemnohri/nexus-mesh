/**
 * NEXUS MESH - Full-Mesh UI/UX Layer
 */
import Utils from './utils.js';
import State from './state.js';
import P2P from './core.js';
import Settings from './settings.js';

const UI = {
    player: null,
    isPlayerReady: false,
    syncInProgress: false,
    audioCtx: null,

    init() {
        this.setupEventListeners();
        this.setupYouTubeAPI();
        this.setupMobileTabs();
        this.setupKeyboardNav();

        State.subscribe((data) => this.render(data));
        this.render(State.data);

        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            document.getElementById('join-id').value = room;
            this.initRoom(room);
        }

        setInterval(() => {
            State.cleanupExpired();
            this.updateTimestamps();
            this.updateTopology();
        }, 1000);

        window.addEventListener('mesh-updated', () => this.updateTopology());
    },

    playSound(type) {
        if (!Settings.current.soundFx) return;
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            const now = this.audioCtx.currentTime;
            if (type === 'join') {
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
            } else {
                osc.frequency.setValueAtTime(660, now);
                gain.gain.setValueAtTime(0.05, now);
            }
            osc.start(); osc.stop(now + 0.1);
        } catch(e) {}
    },

    setupEventListeners() {
        document.getElementById('create-room')?.addEventListener('click', () => this.initRoom());
        document.getElementById('join-room')?.addEventListener('click', () => {
            const id = document.getElementById('join-id')?.value.toUpperCase();
            if (id) this.initRoom(id);
        });
        document.getElementById('add-to-queue')?.addEventListener('click', () => {
            const url = document.getElementById('video-url')?.value;
            const id = Utils.parseYouTubeID(url);
            if (id) State.addToQueue(id, 'Media Stream', P2P.peerID);
        });
        document.getElementById('send-message')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('wall-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });
        document.getElementById('create-poll-btn')?.addEventListener('click', () => document.getElementById('poll-modal').style.display = 'flex');
        document.getElementById('submit-poll')?.addEventListener('click', () => {
            const question = document.getElementById('poll-q').value;
            const options = Array.from(document.querySelectorAll('.poll-opt-in')).map(i => i.value).filter(v => v.trim());
            if (question && options.length >= 2) {
                State.addPoll(question, options, document.getElementById('poll-anon').checked, 5, P2P.peerID);
                document.getElementById('poll-modal').style.display = 'none';
            }
        });
        document.getElementById('settings-toggle')?.addEventListener('click', () => window.toggleSettings());
        document.getElementById('copy-link')?.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.origin + window.location.pathname + "?room=" + P2P.roomID)
                .then(() => Utils.toast("Mesh Invite Copied", "success"));
        });
        document.getElementById('clear-local')?.addEventListener('click', async () => {
            if (confirm('Wipe everything?')) { await Utils.db.clear(); localStorage.clear(); location.reload(); }
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

    async initRoom(roomID = null) {
        try {
            document.getElementById('setup-screen').classList.add('hide');
            document.getElementById('app-screen').classList.remove('hide');
            await P2P.init(roomID);
            await State.init(P2P.roomID, P2P.isHost);
            document.getElementById('display-room-id').textContent = P2P.roomID;
            if (document.getElementById('room-qr')) document.getElementById('room-qr').src = Utils.generateQR(window.location.href + "?room=" + P2P.roomID);
            this.playSound('join');
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
            const data = { type: 'chat', text, avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${P2P.peerID}`, lifetime: Settings.current.msgLifetime };
            P2P.broadcast(data);
            State.addMessage(text, P2P.peerID, data.avatar, data.lifetime);
            document.getElementById('wall-input').value = '';
            this.playSound('msg');
        }
    },

    render(data) {
        this.renderQueue(data.queue);
        this.renderPolls(data.polls);
        this.renderWall(data.wall);
        this.renderStatus(data);
        if (this.isPlayerReady && data.player.videoID && data.player.videoID !== this.player.getVideoData().video_id) this.player.loadVideoById(data.player.videoID);
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
                <div style="flex:1;"><p style="font-size:0.85rem;line-height:1.4;">${msg.text}</p></div>
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
        const centerX = 80, centerY = 60, radius = 50;

        // Draw Full-Mesh lines
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

export default UI;
