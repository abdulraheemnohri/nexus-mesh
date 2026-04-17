/**
 * NEXUS MESH - Premium UI/UX Layer (Final Polish)
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
    touchStartX: 0,

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
        if (room) {
            document.getElementById('join-id').value = room;
            this.initRoom(room);
        }

        setInterval(() => {
            State.cleanupExpired();
            this.updateTimestamps();
            this.updateTopology();
        }, 1000);
    },

    playSound(type) {
        if (!Settings.current.soundFx) return;
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            const now = this.audioCtx.currentTime;
            if (type === 'join') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            } else if (type === 'msg') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(660, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            }
            osc.start(now);
            osc.stop(now + 0.1);
        } catch (e) {}
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
            if (id) {
                State.addToQueue(id, 'Syncing Media...', P2P.peerID);
                document.getElementById('video-url').value = '';
                Utils.toast('Media added to queue', 'success');
            } else {
                Utils.toast('Invalid URL', 'error');
            }
        });

        document.getElementById('send-message')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('wall-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        document.getElementById('create-poll-btn')?.addEventListener('click', () => {
            document.getElementById('poll-modal').style.display = 'flex';
        });

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
            const url = window.location.origin + window.location.pathname + "?room=" + P2P.roomID;
            navigator.clipboard.writeText(url).then(() => Utils.toast("Invite link copied!", "success"));
        });

        document.getElementById('export-data')?.addEventListener('click', () => {
            const data = State.exportState();
            const blob = new Blob([data], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `nexus-${P2P.roomID}.json`;
            a.click();
        });

        document.getElementById('import-data')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => State.importState(ev.target.result);
                reader.readAsText(file);
            }
        });

        document.getElementById('clear-local')?.addEventListener('click', async () => {
            if (confirm('Permanently erase all data and settings?')) {
                await Utils.db.clear();
                localStorage.clear();
                location.reload();
            }
        });

        window.addEventListener('p2p-player-sync', (e) => {
            const cmd = e.detail;
            if (this.player && this.isPlayerReady) {
                this.syncInProgress = true;
                if (cmd.action === 'play') this.player.playVideo();
                if (cmd.action === 'pause') this.player.pauseVideo();
                if (cmd.action === 'seek') this.player.seekTo(cmd.time, true);
                setTimeout(() => this.syncInProgress = false, 500);
            }
        });
    },

    setupMobileTabs() {
        document.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.target;
                document.querySelectorAll('.app-section').forEach(s => s.classList.add('mobile-hide'));
                document.getElementById(target).classList.remove('mobile-hide');
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
            if (e.key === ' ' && e.target.tagName !== 'INPUT') {
                if (this.player && this.isPlayerReady) {
                    const state = this.player.getPlayerState();
                    if (state === YT.PlayerState.PLAYING) this.player.pauseVideo();
                    else this.player.playVideo();
                    e.preventDefault();
                }
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
            if (document.getElementById('room-qr')) {
                document.getElementById('room-qr').src = Utils.generateQR(window.location.origin + window.location.pathname + "?room=" + P2P.roomID);
            }
            this.playSound('join');
            Utils.toast('Connected to Mesh', 'success');
        } catch (e) {
            Utils.toast('Handshake failed', 'error');
        }
    },

    setupYouTubeAPI() {
        window.onYouTubeIframeAPIReady = () => {
            this.player = new YT.Player('youtube-player', {
                height: '100%', width: '100%', videoId: '',
                playerVars: { autoplay: 0, controls: 1, modestbranding: 1 },
                events: {
                    onReady: () => {
                        this.isPlayerReady = true;
                        if (State.data.player.videoID) this.player.loadVideoById(State.data.player.videoID);
                    },
                    onStateChange: (e) => {
                        this.handlePlayerStateChange(e);
                        if (e.data === YT.PlayerState.ENDED && State.data.queue.length > 0 && (P2P.isHost || !State.data.player.hostOnly)) {
                            const next = State.data.queue[0];
                            State.update("player.videoID", next.videoID);
                            State.removeFromQueue(next.id);
                        }
                    }
                }
            });
        };
    },

    handlePlayerStateChange(event) {
        if (this.syncInProgress) return;
        if (!P2P.isHost && State.data.player.hostOnly) return;
        const pState = event.data;
        const time = this.player.getCurrentTime();
        P2P.broadcast({
            type: 'player_sync',
            action: pState === YT.PlayerState.PLAYING ? 'play' : (pState === YT.PlayerState.PAUSED ? 'pause' : 'seek'),
            time: time
        });
    },

    sendMessage() {
        const input = document.getElementById('wall-input');
        const text = input.value.trim();
        if (text) {
            State.addMessage(text, P2P.peerID, `https://api.dicebear.com/7.x/bottts/svg?seed=${P2P.peerID}`, Settings.current.msgLifetime);
            input.value = '';
            this.playSound('msg');
        }
    },

    render(data) {
        this.renderQueue(data.queue);
        this.renderPolls(data.polls);
        this.renderWall(data.wall);
        this.renderStatus(data);
        this.renderPeerList(data);
        if (this.isPlayerReady && data.player.videoID && data.player.videoID !== this.player.getVideoData().video_id) {
            this.player.loadVideoById(data.player.videoID);
        }
        document.getElementById('msg-life-val').textContent = `${Settings.current.msgLifetime}s`;
    },

    renderPeerList(data) {
        const container = document.getElementById('peer-list');
        if (!container) return;
        const peers = Array.from(P2P.connections.keys());
        if (peers.length === 0) {
            container.innerHTML = '<p style="font-size:0.7rem;color:var(--text-muted);">No other peers connected</p>';
            return;
        }
        container.innerHTML = peers.map(id => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem;background:rgba(255,255,255,0.02);border-radius:8px;margin-bottom:0.4rem;">
                <span style="font-size:0.75rem;font-family:monospace;">${id}</span>
                <div style="display:flex;gap:0.4rem;align-items:center;">
                    ${id === P2P.roomID ? '<span style="font-size:0.6rem;background:var(--primary);color:#000;padding:0.1rem 0.3rem;border-radius:4px;font-weight:700;">HOST</span>' : ''}
                    ${P2P.isHost ? `<button class="text-btn" onclick="P2P.kickPeer('${id}')" style="color:var(--accent);font-size:0.6rem;">KICK</button>` : ""}
                </div>
            </div>
        `).join("");
    },

    renderQueue(queue) {
        const container = document.getElementById('queue-list');
        if (!container) return;
        if (queue.length === 0) {
            container.innerHTML = '<div class="skeleton" style="height:50px;opacity:0.2;margin-bottom:1rem;"></div><div class="skeleton" style="height:50px;opacity:0.1;"></div>';
            return;
        }
        container.innerHTML = queue.map(item => `
            <div class="queue-item card-hover">
                <div style="flex: 1;">
                    <p style="font-weight: 700; font-size: 0.85rem;">${item.title}</p>
                    <span style="font-size: 0.7rem; color: var(--text-muted); opacity: 0.8;">${item.videoID}</span>
                </div>
                <div style="display: flex; gap: 0.4rem;">
                    <button class="secondary-btn" onclick="window.State.voteQueue('${item.id}', '${P2P.peerID}', 1)" style="padding: 0.4rem 0.8rem; font-size:0.8rem;">👍 ${item.votes}</button>
                    <button class="primary-btn" onclick="window.State.update('player.videoID', '${item.videoID}')" style="padding: 0.4rem; border-radius: 8px;">▶</button>
                </div>
            </div>
        `).join('');
    },

    renderPolls(polls) {
        const container = document.getElementById('polls-list');
        if (!container) return;
        container.innerHTML = polls.map(poll => {
            const total = poll.options.reduce((s, o) => s + o.votes, 0);
            const expired = Date.now() > poll.expiresAt;
            return `
                <div class="poll-item card" style="padding: 1rem; margin-bottom: 1rem; background: rgba(255,255,255,0.02);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
                        <p style="font-weight: 700; font-size: 0.9rem;">${poll.question}</p>
                        <button class="text-btn" onclick="window.State.downloadPoll('${poll.id}')" style="opacity: 0.6;">CSV</button>
                    </div>
                    ${poll.options.map((opt, idx) => {
                        const perc = total > 0 ? (opt.votes / total) * 100 : 0;
                        return `
                            <div class="poll-option" onclick="${expired ? '' : `window.State.votePoll('${poll.id}', ${idx}, '${P2P.peerID}')`}">
                                <div class="poll-progress" style="width: ${perc}%"></div>
                                <span class="poll-option-text">${opt.text}</span>
                                <span class="poll-option-count">${opt.votes}</span>
                            </div>
                        `;
                    }).join('')}
                    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem;">
                        <span>${total} participants</span>
                        <span class="poll-timer" data-expires="${poll.expiresAt}"></span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderWall(wall) {
        const container = document.getElementById('wall-messages');
        if (!container) return;
        if (wall.length === 0) {
            container.innerHTML = '<div class="skeleton" style="height:40px;width:70%;opacity:0.2;margin-bottom:1rem;"></div>';
            return;
        }
        container.innerHTML = wall.map(msg => `
            <div class="msg" id="msg-${msg.id}"
                 ontouchstart="UI.touchStartX = event.touches[0].clientX"
                 ontouchend="if(UI.touchStartX - event.changedTouches[0].clientX > 100) window.State.update('wall', window.State.data.wall.filter(m=>m.id!=='${msg.id}'))">
                <img src="${msg.senderAvatar}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border);">
                <div style="flex: 1; position: relative;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <span style="font-size:0.6rem; color:var(--text-muted); margin-bottom:0.2rem;">${msg.senderID.substring(0,6)} • ${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        <button class="text-btn" onclick="window.State.togglePin('${msg.id}')" style="font-size: 0.6rem; opacity: 0.5;">${msg.pinned ? "📌" : "📍"}</button>
                    </div>
                    <p style="font-size: 0.85rem; line-height: 1.4; padding-right: 20px;">${msg.text}</p>
                </div>
                <div class="msg-lifetime-bar" style="animation: shrink ${(msg.expiresAt - msg.createdAt)/1000}s linear forwards; animation-delay: -${(Date.now() - msg.createdAt)/1000}s;"></div>
            </div>
        `).join('');
    },

    renderStatus(data) {
        const dot = document.getElementById('conn-status');
        if (dot) dot.className = `connection-dot ${P2P.connections.size > 0 ? 'online' : 'offline'}`;
    },

    updateTimestamps() {
        document.querySelectorAll('.poll-timer').forEach(el => {
            const expires = parseInt(el.dataset.expires);
            const diff = Math.floor((expires - Date.now()) / 1000);
            if (diff > 0) el.textContent = `Ends in ${Math.floor(diff/60)}m ${diff%60}s`;
            else el.textContent = 'Poll Closed';
        });
    },

    updateTopology() {
        const container = document.getElementById('topology-viz');
        if (!container) return;
        container.innerHTML = '';
        const nodes = Array.from(P2P.connections.entries());
        nodes.push(['me', { latency: 0 }]);
        const centerX = 90, centerY = 90, radius = 50;
        nodes.forEach(([id, info], i) => {
            const angle = (i / nodes.length) * Math.PI * 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            if (id !== 'me') {
                const line = document.createElement('div');
                line.className = 'peer-line';
                line.style.width = `${radius}px`;
                line.style.left = `${centerX}px`;
                line.style.top = `${centerY}px`;
                line.style.transform = `rotate(${angle}rad)`;
                container.appendChild(line);
                const latency = document.createElement('span');
                latency.className = 'latency-label';
                latency.textContent = `${info.latency}ms`;
                latency.style.left = `${centerX + Math.cos(angle) * (radius/1.5)}px`;
                latency.style.top = `${centerY + Math.sin(angle) * (radius/1.5)}px`;
                container.appendChild(latency);
            }
            const node = document.createElement('div');
            node.className = 'peer-node';
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            if (id === 'me') node.style.background = 'var(--accent)';
            else if (P2P.isHost) node.onclick = () => { if(confirm(`Kick peer ${id}?`)) P2P.kickPeer(id); };
            container.appendChild(node);
        });
    }
};

window.UI = UI;
export default UI;
