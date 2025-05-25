// 加密服务 - 使用 Web Crypto API 进行 AES-GCM 加密

// 加密配置
const ENCRYPTION_CONFIG = {
  algorithm: "AES-GCM",
  keyLength: 256,
  ivLength: 12, // 96 bits for GCM
  saltLength: 16, // 128 bits
  iterations: 100000, // PBKDF2 迭代次数
} as const;

// 加密结果接口
export interface EncryptedData {
  encryptedData: string; // Base64 编码的加密数据
  iv: string; // Base64 编码的初始化向量
  salt: string; // Base64 编码的盐值
  keyId: string; // 密钥标识符
}

// 错误类型
export class EncryptionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "EncryptionError";
  }
}

// 检查 Web Crypto API 支持
function checkCryptoSupport(): void {
  if (!window.crypto || !window.crypto.subtle) {
    throw new EncryptionError(
      "Web Crypto API is not supported in this browser"
    );
  }
}

// 生成随机字节
function generateRandomBytes(length: number): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(length));
}

// 将 ArrayBuffer 或 Uint8Array 转换为 Base64
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

  // 导入密码作为密钥材料
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // 使用 PBKDF2 派生密钥
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
    ["encrypt", "decrypt"]
  );
}

// 生成主密码（基于浏览器指纹和固定盐）
async function generateMasterPassword(): Promise<string> {
  // 使用浏览器特征生成一致的密码
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    "prompt-forge-master-key-v1", // 应用特定的盐
  ].join("|");

  // 对指纹进行哈希
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);

  return arrayBufferToBase64(hashBuffer);
}

// 加密 API 密钥
export async function encryptApiKey(
  apiKey: string,
  providerId: string
): Promise<EncryptedData> {
  try {
    checkCryptoSupport();

    // 生成随机盐和 IV
    const salt = generateRandomBytes(ENCRYPTION_CONFIG.saltLength);
    const iv = generateRandomBytes(ENCRYPTION_CONFIG.ivLength);

    // 生成主密码并派生加密密钥
    const masterPassword = await generateMasterPassword();
    const key = await deriveKey(masterPassword, salt);

    // 加密 API 密钥
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: ENCRYPTION_CONFIG.algorithm,
        iv: iv,
      },
      key,
      data
    );

    // 生成密钥 ID（用于标识和验证）
    const keyId = await generateKeyId(providerId, salt);

    return {
      encryptedData: arrayBufferToBase64(encryptedBuffer),
      iv: arrayBufferToBase64(iv),
      salt: arrayBufferToBase64(salt),
      keyId,
    };
  } catch (error) {
    throw new EncryptionError(
      "Failed to encrypt API key",
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

// 解密 API 密钥
export async function decryptApiKey(
  encryptedData: EncryptedData
): Promise<string> {
  try {
    checkCryptoSupport();

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
    throw new EncryptionError(
      "Failed to decrypt API key",
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

// 生成密钥 ID（用于验证和标识）
async function generateKeyId(
  providerId: string,
  salt: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${providerId}:${arrayBufferToBase64(salt)}`);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);

  // 返回哈希的前 16 个字符作为密钥 ID
  return arrayBufferToBase64(hashBuffer).substring(0, 16);
}

// 验证加密数据的完整性
export async function validateEncryptedData(
  encryptedData: EncryptedData,
  providerId: string
): Promise<boolean> {
  try {
    const salt = new Uint8Array(base64ToArrayBuffer(encryptedData.salt));
    const expectedKeyId = await generateKeyId(providerId, salt);
    return expectedKeyId === encryptedData.keyId;
  } catch (error) {
    return false;
  }
}

// 生成用于显示的掩码密钥
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) {
    return "*".repeat(apiKey.length);
  }

  const start = apiKey.substring(0, 3);
  const end = apiKey.substring(apiKey.length - 4);
  return `${start}...${end}`;
}

// 验证 API 密钥格式（基本验证）
export function validateApiKeyFormat(
  apiKey: string,
  providerId: string
): boolean {
  if (!apiKey || apiKey.length < 10) {
    return false;
  }

  // 提供商特定的验证规则
  switch (providerId) {
    case "openai":
      return apiKey.startsWith("sk-") && apiKey.length >= 20;
    case "anthropic":
      return apiKey.startsWith("sk-ant-") && apiKey.length >= 20;
    case "google":
      return apiKey.length >= 20; // Google API 密钥格式较灵活
    default:
      return apiKey.length >= 10; // 通用最小长度要求
  }
}

// 安全地清除内存中的敏感数据（尽力而为）
export function secureClear(str: string): void {
  // 注意：JavaScript 中无法真正安全地清除字符串内存
  // 这只是一个象征性的操作，提醒开发者注意安全
  if (typeof str === "string") {
    // 尝试覆盖字符串（虽然在 JS 中字符串是不可变的）
    for (let i = 0; i < str.length; i++) {
      // 这实际上不会修改原字符串，但表达了安全意图
    }
  }
}

// 导出加密配置（用于测试和调试）
export const getEncryptionConfig = () => ({
  ...ENCRYPTION_CONFIG,
  // 不暴露敏感信息
  supportedAlgorithms: ["AES-GCM"],
  keyDerivation: "PBKDF2",
  hashFunction: "SHA-256",
});
