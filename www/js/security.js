/**
 * NEXUS MESH - Cryptographic Node Identity
 */
class MeshSecurity {
    constructor() {
        this.keyPair = null;
        this.publicKeyJWK = null;
    }

    async init() {
        // Generate ephemeral RSA keypair for this session
        this.keyPair = await crypto.subtle.generateKey(
            {
                name: "RSASSA-PKCS1-v1_5",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["sign", "verify"]
        );

        this.publicKeyJWK = await crypto.subtle.exportKey("jwk", this.keyPair.publicKey);
        console.log("Node Identity Initialized:", this.publicKeyJWK.n.substring(0, 10));
    }

    async signMessage(data) {
        const encoder = new TextEncoder();
        const signature = await crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            this.keyPair.privateKey,
            encoder.encode(JSON.stringify(data))
        );
        return Array.from(new Uint8Array(signature));
    }

    async verifyMessage(data, signature, publicKeyJWK) {
        const key = await crypto.subtle.importKey(
            "jwk",
            publicKeyJWK,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            true,
            ["verify"]
        );
        const encoder = new TextEncoder();
        return await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            key,
            new Uint8Array(signature),
            encoder.encode(JSON.stringify(data))
        );
    }
}

export default new MeshSecurity();
