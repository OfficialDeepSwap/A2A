/**
 * Encryption utilities for Agent-to-Agent secure communication
 * Uses Web Crypto API for end-to-end encryption
 */

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface SerializedKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  ephemeralPublicKey: string;
  tag: string;
}

/**
 * Generate a new ECDH key pair for agent encryption
 * @returns KeyPair object containing public and private keys
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Export key pair to base64 strings for storage
 * @param keyPair KeyPair to serialize
 * @returns SerializedKeyPair with base64-encoded keys
 */
export async function serializeKeyPair(keyPair: KeyPair): Promise<SerializedKeyPair> {
  const publicKeyData = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyData = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyData),
    privateKey: arrayBufferToBase64(privateKeyData),
  };
}

/**
 * Import key pair from base64 strings
 * @param serializedKeyPair SerializedKeyPair with base64-encoded keys
 * @returns KeyPair object
 */
export async function deserializeKeyPair(serializedKeyPair: SerializedKeyPair): Promise<KeyPair> {
  const publicKeyData = base64ToArrayBuffer(serializedKeyPair.publicKey);
  const privateKeyData = base64ToArrayBuffer(serializedKeyPair.privateKey);

  const publicKey = await window.crypto.subtle.importKey(
    'spki',
    publicKeyData,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );

  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyData,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );

  return { publicKey, privateKey };
}

/**
 * Import a public key from base64 string
 * @param publicKeyString Base64-encoded public key
 * @returns CryptoKey public key
 */
export async function importPublicKey(publicKeyString: string): Promise<CryptoKey> {
  const publicKeyData = base64ToArrayBuffer(publicKeyString);

  return await window.crypto.subtle.importKey(
    'spki',
    publicKeyData,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

/**
 * Derive a shared secret using ECDH
 * @param privateKey Your private key
 * @param publicKey Recipient's public key
 * @returns Shared AES-GCM key
 */
async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const sharedSecret = await window.crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    256
  );

  return await window.crypto.subtle.importKey(
    'raw',
    sharedSecret,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a message using recipient's public key
 * @param message Plain text message to encrypt
 * @param recipientPublicKey Recipient's public key (base64 string)
 * @returns EncryptedMessage object
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: string
): Promise<EncryptedMessage> {
  const ephemeralKeyPair = await generateKeyPair();
  const recipientKey = await importPublicKey(recipientPublicKey);

  const sharedKey = await deriveSharedKey(ephemeralKeyPair.privateKey, recipientKey);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
    },
    sharedKey,
    data
  );

  const serializedEphemeralPublicKey = await window.crypto.subtle.exportKey(
    'spki',
    ephemeralKeyPair.publicKey
  );

  const ciphertext = encryptedData.slice(0, encryptedData.byteLength - 16);
  const tag = encryptedData.slice(encryptedData.byteLength - 16);

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
    ephemeralPublicKey: arrayBufferToBase64(serializedEphemeralPublicKey),
    tag: arrayBufferToBase64(tag),
  };
}

/**
 * Decrypt a message using your private key
 * @param encryptedMessage EncryptedMessage object
 * @param privateKey Your private key
 * @returns Decrypted plain text message
 */
export async function decryptMessage(
  encryptedMessage: EncryptedMessage,
  privateKey: CryptoKey
): Promise<string> {
  const ephemeralPublicKeyData = base64ToArrayBuffer(encryptedMessage.ephemeralPublicKey);
  const ephemeralPublicKey = await window.crypto.subtle.importKey(
    'spki',
    ephemeralPublicKeyData,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );

  const sharedKey = await deriveSharedKey(privateKey, ephemeralPublicKey);

  const ciphertextData = base64ToArrayBuffer(encryptedMessage.ciphertext);
  const tagData = base64ToArrayBuffer(encryptedMessage.tag);
  const ivData = base64ToArrayBuffer(encryptedMessage.iv);

  const encryptedData = new Uint8Array(ciphertextData.byteLength + tagData.byteLength);
  encryptedData.set(new Uint8Array(ciphertextData), 0);
  encryptedData.set(new Uint8Array(tagData), ciphertextData.byteLength);

  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivData,
      tagLength: 128,
    },
    sharedKey,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedData);
}

/**
 * Generate a SHA-256 hash of content for verification
 * @param content Content to hash
 * @returns Base64-encoded hash
 */
export async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Verify content against a hash
 * @param content Content to verify
 * @param hash Expected hash (base64)
 * @returns True if content matches hash
 */
export async function verifyContentHash(content: string, hash: string): Promise<boolean> {
  const computedHash = await generateContentHash(content);
  return computedHash === hash;
}

/**
 * Convert ArrayBuffer to base64 string
 * @param buffer ArrayBuffer to convert
 * @returns Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 * @param base64 Base64 string
 * @returns ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Store key pair in local storage (encrypted with password)
 * @param keyPair KeyPair to store
 * @param agentId Agent identifier
 */
export async function storeKeyPair(keyPair: KeyPair, agentId: string): Promise<void> {
  const serialized = await serializeKeyPair(keyPair);
  localStorage.setItem(`a2a_keys_${agentId}`, JSON.stringify(serialized));
}

/**
 * Load key pair from local storage
 * @param agentId Agent identifier
 * @returns KeyPair or null if not found
 */
export async function loadKeyPair(agentId: string): Promise<KeyPair | null> {
  const stored = localStorage.getItem(`a2a_keys_${agentId}`);
  if (!stored) return null;

  try {
    const serialized: SerializedKeyPair = JSON.parse(stored);
    return await deserializeKeyPair(serialized);
  } catch (error) {
    console.error('Failed to load key pair:', error);
    return null;
  }
}

/**
 * Clear stored key pair
 * @param agentId Agent identifier
 */
export function clearKeyPair(agentId: string): void {
  localStorage.removeItem(`a2a_keys_${agentId}`);
}
