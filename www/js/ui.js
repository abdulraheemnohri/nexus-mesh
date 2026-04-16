/**
 * NEXUS MESH - UI Layer
 */
import Utils from './utils.js';
import State from './state.js';
import P2P from './core.js';
import Settings from './settings.js';

const UI = {
    player: null,
    isPlayerReady: false,
    syncInProgress: false,

    init() {
        this.setupEventListeners();
        this.setupYouTubeAPI();
        this.setupMobileTabs();

        State.subscribe((data) => this.render(data));
        this.render(State.data);

        // Handle URL parameters for joining
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
                State.addToQueue(id, 'New Media', P2P.peerID);
                document.getElementById('video-url').value = '';
                Utils.toast('Added to queue', 'success');
            } else {
                Utils.toast('Invalid YouTube URL', 'error');
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
            const optionInputs = document.querySelectorAll('.poll-opt-in');
            const options = Array.from(optionInputs).map(i => i.value).filter(v => v.trim());
            const anon = document.getElementById('poll-anon').checked;

            if (question && options.length >= 2) {
                State.addPoll(question, options, anon, 5, P2P.peerID);
                document.getElementById('poll-modal').style.display = 'none';
            }
        });

        document.getElementById('settings-toggle')?.addEventListener('click', () => window.toggleSettings());

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
                reader.onload = (e) => State.importState(e.target.result);
                reader.readAsText(file);
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
        const tabs = document.querySelectorAll('.mobile-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.target;
                document.querySelectorAll('.app-section').forEach(s => s.classList.add('mobile-hide'));
                document.getElementById(target).classList.remove('mobile-hide');
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });
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
            Utils.toast(`Session Active: ${P2P.roomID}`, 'success');
        } catch (e) {
            Utils.toast('Connection error', 'error');
            console.error(e);
        }
    },

    setupYouTubeAPI() {
        window.onYouTubeIframeAPIReady = () => {
            this.player = new YT.Player('youtube-player', {
                height: '100%', width: '100%', videoId: '',
                playerVars: { autoplay: 0, controls: 1, modestbranding: 1 },
                events: {
                    onReady: (e) => {
                        this.isPlayerReady = true;
                        if (State.data.player.videoID) this.player.loadVideoById(State.data.player.videoID);
                    },
                    onStateChange: (e) => this.handlePlayerStateChange(e)
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
        }
    },

    render(data) {
        this.renderQueue(data.queue);
        this.renderPolls(data.polls);
        this.renderWall(data.wall);
        this.renderStatus(data);
        if (this.isPlayerReady && data.player.videoID && data.player.videoID !== this.player.getVideoData().video_id) {
            this.player.loadVideoById(data.player.videoID);
        }
    },

    renderQueue(queue) {
        const container = document.getElementById('queue-list');
        if (!container) return;
        container.innerHTML = queue.map(item => `
            <div class="queue-item">
                <div style="flex: 1;">
                    <p style="font-weight: 600; font-size: 0.9rem;">${item.title}</p>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${item.videoID}</span>
                </div>
                <div style="display: flex; gap: 0.4rem;">
                    <button class="secondary" onclick="window.State.voteQueue('${item.id}', '${P2P.peerID}', 1)" style="padding: 0.3rem 0.6rem; font-size:0.8rem;">👍 ${item.votes}</button>
                    <button class="secondary icon" onclick="window.State.removeFromQueue('${item.id}')">✕</button>
                    <button class="icon" onclick="window.State.update('player.videoID', '${item.videoID}')">▶</button>
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
                <div class="poll-item">
                    <p style="font-weight: 600; margin-bottom: 0.8rem; font-size: 0.9rem;">${poll.question}</p>
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
                        <span>${total} votes</span>
                        <span class="poll-timer" data-expires="${poll.expiresAt}"></span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderWall(wall) {
        const container = document.getElementById('wall-messages');
        if (!container) return;
        container.innerHTML = wall.map(msg => `
            <div class="msg" id="msg-${msg.id}">
                <img src="${msg.senderAvatar}" style="width: 28px; height: 28px; border-radius: 50%;">
                <div style="flex: 1;">
                    <p style="font-size: 0.85rem;">${msg.text}</p>
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
        const peers = Array.from(P2P.connections.keys());
        peers.push(P2P.peerID);
        peers.forEach((id, i) => {
            const node = document.createElement('div');
            node.className = 'peer-node';
            const angle = (i / peers.length) * Math.PI * 2;
            const x = 70 + Math.cos(angle) * 50;
            const y = 70 + Math.sin(angle) * 50;
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            if (id === P2P.peerID) node.style.background = 'var(--accent)';
            container.appendChild(node);
        });
    }
};

export default UI;
