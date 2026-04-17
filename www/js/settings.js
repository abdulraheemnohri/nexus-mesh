/**
 * NEXUS MESH - Hyper-Privacy Settings
 */
const Settings = {
    defaults: {
        theme: 'dark',
        maxPeers: 15,
        msgLifetime: 60,
        soundFx: true,
        profanityFilter: true,
        stealth: false,
        camouflage: false,
        vaultActive: false,
        e2e: true,
        zeroFootprint: false,
        obfuscateSignals: false
    },
    current: {},
    init() {
        const saved = localStorage.getItem('nx_settings');
        this.current = saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults };
        this.apply();
    },
    update(key, value) {
        this.current[key] = value;
        localStorage.setItem('nx_settings', JSON.stringify(this.current));
        this.apply();
    },
    apply() {
        const root = document.documentElement;
        root.setAttribute('data-theme', this.current.theme);
        if (this.current.stealth) root.classList.add('stealth-active');
        else root.classList.remove('stealth-active');
        window.dispatchEvent(new CustomEvent('settings-updated', { detail: this.current }));
    }
};
export default Settings;
