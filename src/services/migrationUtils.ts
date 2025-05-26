// 临时迁移工具 - 用于从加密API密钥迁移到明文存储
// 这个文件在迁移完成后将被删除

import { EncryptedData } from "./encryption";

// 加密配置（复制自encryption.ts）
const ENCRYPTION_CONFIG = {
  algorithm: "AES-GCM",
  keyLength: 256,
  ivLength: 12,
  saltLength: 16,
  iterations: 100000,
} as const;

// 错误类型
export class MigrationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "MigrationError";
  }
}

// 将 Base64 转换为 ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// 从密码派生密钥
async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ENCRYPTION_CONFIG.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: ENCRYPTION_CONFIG.algorithm,
      length: ENCRYPTION_CONFIG.keyLength,
    },
    false,
    ["decrypt"]
  );
}

// 生成主密码（与encryption.ts中的实现相同）
async function generateMasterPassword(): Promise<string> {
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    "prompt-forge-master-key-v1",
  ].join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);

  // 将 ArrayBuffer 转换为 Base64
  const bytes = new Uint8Array(hashBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 解密 API 密钥（用于迁移）
export async function decryptApiKeyForMigration(
  encryptedData: EncryptedData
): Promise<string> {
  try {
    // 检查 Web Crypto API 支持
    if (!window.crypto || !window.crypto.subtle) {
      throw new MigrationError(
        "Web Crypto API is not supported in this browser"
      );
    }

    // 解码 Base64 数据
    const salt = new Uint8Array(base64ToArrayBuffer(encryptedData.salt));
    const iv = new Uint8Array(base64ToArrayBuffer(encryptedData.iv));
    const encrypted = base64ToArrayBuffer(encryptedData.encryptedData);

    // 生成主密码并派生解密密钥
    const masterPassword = await generateMasterPassword();
    const key = await deriveKey(masterPassword, salt);

    // 解密数据
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: ENCRYPTION_CONFIG.algorithm,
        iv: iv,
      },
      key,
      encrypted
    );

    // 转换为字符串
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    throw new MigrationError(
      "Failed to decrypt API key during migration",
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
