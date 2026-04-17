/**
 * NEXUS MESH V5 - Cognitive Mesh Brain
 */
import Evolution from './evolution.js';
import Settings from './settings.js';

class MeshBrain {
    constructor() {
        this.metrics = {
            latency: 0,
            load: 0,
            stability: 1.0,
            msgRate: 0
        };
        this.role = 'MESH_NODE';
        this.trust = new Map();
        this.lastPulse = Date.now();
    }

    analyzeNetwork(connections) {
        // 1. Gather Metrics
        const count = connections.size;
        let totalLat = 0;
        connections.forEach(i => totalLat += i.latency);

        this.metrics = {
            peerCount: count,
            avgLatency: count > 0 ? totalLat / count : 0,
            stability: this.calculateStability(connections),
            messageRate: this.getMsgRate(),
            cpu: 0.1 // Simulated
        };

        // 2. Observer Phase (Evolution Engine)
        Evolution.observe(this.metrics);

        // 3. Adaptive Role Management
        this.updateRole();
    }

    calculateStability(connections) {
        if (connections.size === 0) return 1.0;
        const lowLatency = Array.from(connections.values()).filter(i => i.latency < 200).length;
        return lowLatency / connections.size;
    }

    getMsgRate() {
        // Actual logic hooked into State.js message events
        return window.msgCount || 0;
    }

    updateRole() {
        if (this.metrics.peerCount > 10 && this.metrics.avgLatency < 100) {
            this.role = 'SUPER_NODE';
        } else if (this.metrics.cpu > 0.8) {
            this.role = 'RELAY_NODE';
        } else {
            this.role = 'MESH_NODE';
        }
    }

    evaluateNodeTrust(peerID, behavior) {
        let score = this.trust.get(peerID) || 100;
        if (behavior === 'spam') score -= 20;
        if (behavior === 'reliable') score += 2;
        this.trust.set(peerID, Math.min(100, Math.max(0, score)));
    }
}

export default new MeshBrain();
