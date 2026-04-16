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

    init() {
        this.setupEventListeners();
        this.setupYouTubeAPI();
        State.subscribe((data) => this.render(data));
        this.render(State.data);
        setInterval(() => {
            State.cleanupExpired();
            this.updateTimestamps();
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
                State.addToQueue(id, 'Loading video...', P2P.peerID);
                document.getElementById('video-url').value = '';
            } else {
                Utils.toast('Invalid YouTube URL', 'error');
            }
        });
        document.getElementById('send-message')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('create-poll-btn')?.addEventListener('click', () => {
            document.getElementById('poll-modal').classList.remove('hide');
        });
        document.getElementById('submit-poll')?.addEventListener('click', () => {
            const question = document.getElementById('poll-q').value;
            const options = [
                document.getElementById('poll-o1').value,
                document.getElementById('poll-o2').value,
                document.getElementById('poll-o3').value,
                document.getElementById('poll-o4').value
            ].filter(o => o.trim() !== '');
            if (question && options.length >= 2) {
                State.addPoll(question, options, Settings.current.anonymousPolls, 5, P2P.peerID);
                document.getElementById('poll-modal').classList.add('hide');
            }
        });
        document.getElementById('settings-toggle')?.addEventListener('click', () => {
            document.getElementById('settings-panel').classList.toggle('show');
        });
        window.addEventListener('p2p-player-sync', (e) => {
            const cmd = e.detail;
            if (this.player && this.isPlayerReady) {
                if (cmd.action === 'play') this.player.playVideo();
                if (cmd.action === 'pause') this.player.pauseVideo();
                if (cmd.action === 'seek') this.player.seekTo(cmd.time, true);
            }
        });
    },

    async initRoom(roomID = null) {
        document.getElementById('setup-screen').classList.add('hide');
        document.getElementById('app-screen').classList.remove('hide');
        await P2P.init(roomID);
        await State.init(P2P.roomID, P2P.isHost);
        document.getElementById('display-room-id').textContent = P2P.roomID;
        if (document.getElementById('room-qr')) {
            document.getElementById('room-qr').src = Utils.generateQR(window.location.origin + window.location.pathname + "?room=" + P2P.roomID);
        }
        Utils.toast(`Joined Room: ${P2P.roomID}`, 'success');
    },

    setupYouTubeAPI() {
        window.onYouTubeIframeAPIReady = () => {
            this.player = new YT.Player('youtube-player', {
                height: '100%', width: '100%', videoId: '',
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
        if (!P2P.isHost && State.data.player.hostOnly) return;
        const pState = event.data;
        const time = this.player.getCurrentTime();
        if (Math.abs(State.data.player.currentTime - time) > 2) {
            P2P.broadcast({
                type: 'player_sync',
                action: pState === YT.PlayerState.PLAYING ? 'play' : (pState === YT.PlayerState.PAUSED ? 'pause' : 'seek'),
                time: time
            });
        }
    },

    sendMessage() {
        const input = document.getElementById('wall-input');
        const text = input.value.trim();
        if (text) {
            const data = {
                type: 'chat', text: text,
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${P2P.peerID}`,
                lifetime: Settings.current.msgLifetime
            };
            P2P.broadcast(data);
            State.addMessage(data.text, P2P.peerID, data.avatar, data.lifetime);
            input.value = '';
        }
    },

    render(data) {
        this.renderQueue(data.queue);
        this.renderPolls(data.polls);
        this.renderWall(data.wall);
        this.renderStatus(data);
    },

    renderQueue(queue) {
        const container = document.getElementById('queue-list');
        if (!container) return;
        container.innerHTML = queue.map(item => `
            <div class="queue-item card">
                <div class="queue-info">
                    <span class="queue-title">${item.title || 'Video'}</span>
                </div>
                <div class="queue-actions">
                    <button onclick="window.State.voteQueue('${item.id}', 1)">▲ ${item.votes}</button>
                    <button onclick="window.State.removeFromQueue('${item.id}')">✕</button>
                </div>
            </div>
        `).join('');
    },

    renderPolls(polls) {
        const container = document.getElementById('polls-list');
        if (!container) return;
        container.innerHTML = polls.map(poll => {
            const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);
            return `
                <div class="poll-card card">
                    <h3>${poll.question}</h3>
                    <div class="poll-options">
                        ${poll.options.map((opt, idx) => `
                            <div class="poll-option" onclick="window.P2P.handleData({type:'vote_poll', pollId:'${poll.id}', optionIndex:${idx}}, '${P2P.peerID}')">
                                <span class="poll-opt-text">${opt.text}</span>
                                <span class="poll-opt-count">${opt.votes}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    },

    renderWall(wall) {
        const container = document.getElementById('wall-messages');
        if (!container) return;
        container.innerHTML = wall.map(msg => `
            <div class="wall-msg">
                <img src="${msg.senderAvatar}" class="avatar">
                <div class="msg-content"><p>${msg.text}</p></div>
            </div>
        `).join('');
    },

    renderStatus(data) {
        const status = document.getElementById('conn-status');
        if (status) status.className = P2P.connections.size > 0 ? 'online' : 'offline';
    },

    updateTimestamps() {}
};

window.State = State;
window.P2P = P2P;
export default UI;
