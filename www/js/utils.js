/**
 * NEXUS MESH - Utilities
 */

const Utils = {
    /**
     * Generate a unique 6-character Room ID
     */
    generateID: (length = 6) => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * Extract YouTube ID from various URL formats
     */
    parseYouTubeID: (url) => {
        if (!url) return null;
        const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    /**
     * Simple Toast Notification System
     */
    toast: (message, type = 'info', duration = 3000) => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * IndexedDB Wrapper for persistence
     */
    db: {
        name: 'NexusMeshDB',
        version: 1,
        store: 'state',

        init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.name, this.version);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.store)) {
                        db.createObjectStore(this.store);
                    }
                };
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            });
        },

        async get(key) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.store, 'readonly');
                const request = transaction.objectStore(this.store).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async set(key, value) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.store, 'readwrite');
                const request = transaction.objectStore(this.store).put(value, key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async delete(key) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.store, 'readwrite');
                const request = transaction.objectStore(this.store).delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async clear() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(this.store, 'readwrite');
                const request = transaction.objectStore(this.store).clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    },

    /**
     * Format seconds to MM:SS
     */
    formatTime: (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Generate QR Code URL (using Google Charts API for zero-dependency)
     */
    generateQR: (data) => {
        return `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(data)}`;
    }
};

export default Utils;
