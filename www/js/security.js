/**
 * NEXUS MESH - Hyper-Privacy Security Layer
 */
import Utils from './utils.js';
import Settings from './settings.js';

class MeshSecurity {
    constructor() {
        this.keyPair = null;
        this.publicKeyJWK = null;
        this.meshPassphrase = null;
        this.derivedKey = null;
    }

    async init() {
        this.keyPair = await crypto.subtle.generateKey(
            { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
            true, ["sign", "verify"]
        );
        this.publicKeyJWK = await crypto.subtle.exportKey("jwk", this.keyPair.publicKey);
    }

    async setPassphrase(pass) {
        this.meshPassphrase = pass;
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
        this.derivedKey = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: enc.encode("Utils.generateID(16)"), iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
        console.log("Vault: Security Layer Primed");
    }

    async encrypt(text) {
        if (!this.derivedKey) return text;
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.derivedKey, enc.encode(text));
        return {
            c: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            iv: btoa(String.fromCharCode(...iv))
        };
    }

    async decrypt(data) {
        if (!this.derivedKey || typeof data === 'string') return data;
        try {
            const ciphertext = new Uint8Array(atob(data.c).split("").map(c => c.charCodeAt(0)));
            const iv = new Uint8Array(atob(data.iv).split("").map(c => c.charCodeAt(0)));
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.derivedKey, ciphertext);
            return new TextDecoder().decode(decrypted);
        } catch (e) { return "[VAULT SECURE]"; }
    }
}

export default new MeshSecurity();
