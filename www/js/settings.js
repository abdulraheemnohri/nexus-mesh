/**
 * NEXUS MESH - Advanced Settings Manager
 */
const Settings = {
    defaults: {
        theme: 'dark',
        maxPeers: 10,
        autoPlay: true,
        loop: false,
        msgLifetime: 60,
        anonymousPolls: false,
        fontScale: 1,
        highContrast: false,
        reducedMotion: false,
        requireApproval: false,
        soundFx: true,
        profanityFilter: true,
        localOnly: false,
        sessions: [],
        e2e: false
    },

    current: {},

    init() {
        const saved = localStorage.getItem('nexus_mesh_settings');
        this.current = saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults };
        this.apply();
    },

    update(key, value) {
        this.current[key] = value;
        localStorage.setItem('nexus_mesh_settings', JSON.stringify(this.current));
        this.apply();
    },

    apply() {
        const root = document.documentElement;
        root.setAttribute('data-theme', this.current.theme);
        root.style.setProperty('--font-scale', this.current.fontScale);
        if (this.current.highContrast) root.classList.add('high-contrast');
        else root.classList.remove('high-contrast');
        if (this.current.reducedMotion) root.classList.add('reduced-motion');
        else root.classList.remove('reduced-motion');
        window.dispatchEvent(new CustomEvent('settings-updated', { detail: this.current }));
    }
};

export default Settings;
