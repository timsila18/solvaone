import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^hostafrica-solvaone-private:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([a-f0-9]{64}):([a-f0-9]{64})$/i;
const MAX_BYTES = 20 * 1024 * 1024;

function secret() {
  const value = process.env.HOSTAFRICA_MEDIA_SECRET ?? "";
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("HostAfrica private storage is not configured");
  return value;
}

function keys(value: string) {
  return {
    signing: createHmac("sha256", value).update("solvaone-private-media-v1").digest("hex"),
    encryption: createHmac("sha256", value).update("solvaone-private-media-encryption-v1").digest()
  };
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

type PrivateMethod = "GET" | "POST" | "DELETE";

function requestHeaders(method: PrivateMethod, id: string, digest: string, value: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", keys(value).signing)
    .update(`private-v1\n${method}\n${timestamp}\n${id}\n${digest}`)
    .digest("hex");
  return {
    "Content-Type": "application/octet-stream",
    "X-Document-Id": id,
    "X-Document-Digest": digest,
    "X-Document-Timestamp": timestamp,
    "X-Document-Signature": signature
  };
}

function isTransientStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function privateRequest(method: PrivateMethod, id: string, digest: string, value: string, body?: Uint8Array) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(endpoint(), {
        method,
        headers: requestHeaders(method, id, digest, value),
        ...(body ? { body: Buffer.from(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
        cache: "no-store"
      });
      if (!isTransientStatus(response.status) || attempt === 2) return response;
      await response.body?.cancel().catch(() => undefined);
      lastError = new Error(`HostAfrica temporarily rejected private file (${response.status})`);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("HostAfrica private storage request failed");
}

function seal(bytes: Buffer, value: string) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("File must be between 1 byte and 20 MB");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys(value).encryption, iv);
  return Buffer.concat([iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
}

function unseal(bytes: Buffer, value: string) {
  if (bytes.length < 29 || bytes.length > MAX_BYTES + 28) throw new Error("Invalid encrypted file");
  const decipher = createDecipheriv("aes-256-gcm", keys(value).encryption, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]);
}

async function responseBytes(response: Response) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || !response.body || length > MAX_BYTES + 28) throw new Error("Private file is unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES + 28) throw new Error("Private file response is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks);
}

export function isHostAfricaPrivatePath(path: string | null | undefined): boolean {
  return Boolean(path && TOKEN.test(path));
}

export function hostAfricaPrivateOwner(path: string) {
  return TOKEN.exec(path)?.[1] ?? null;
}

export function hostAfricaPrivateStorageEnabled() {
  return process.env.HOSTAFRICA_MEDIA_ENABLED === "true" && /^[a-f0-9]{64}$/.test(process.env.HOSTAFRICA_MEDIA_SECRET ?? "");
}

function endpoint() {
  const value = process.env.HOSTAFRICA_MEDIA_ENDPOINT ?? "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("HostAfrica private storage endpoint is not configured");
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.pathname.endsWith("solvaone-private-media.php")) {
    throw new Error("HostAfrica private storage endpoint must be the HTTPS SolvaOne endpoint");
  }
  return url;
}

export async function storePrivateFile(bytes: Buffer, ownerId: string) {
  if (!UUID.test(ownerId)) throw new Error("A valid file owner is required");
  const value = secret();
  const encrypted = seal(bytes, value);
  const id = sha256(encrypted);
  const response = await privateRequest("POST", id, id, value, new Uint8Array(encrypted));
  if (!response.ok) throw new Error(`HostAfrica rejected private file (${response.status})`);
  const result = await response.json() as { id?: string; bytes?: number };
  if (result.id !== id || result.bytes !== encrypted.length) throw new Error("Unexpected HostAfrica upload response");
  const token = `hostafrica-solvaone-private:${ownerId}:${id}:${sha256(bytes)}`;
  if (!bytes.equals(await readPrivateFile(token))) throw new Error("HostAfrica file verification failed");
  return token;
}

export async function readPrivateFile(path: string) {
  const match = TOKEN.exec(path);
  if (!match) throw new Error("Invalid HostAfrica private-file reference");
  const [, , id, checksum] = match;
  const value = secret();
  const emptyDigest = sha256(Buffer.alloc(0));
  const response = await privateRequest("GET", id, emptyDigest, value);
  const encrypted = await responseBytes(response);
  if (sha256(encrypted) !== id) throw new Error("Private-file integrity check failed");
  const bytes = unseal(encrypted, value);
  if (sha256(bytes) !== checksum) throw new Error("Private-file checksum verification failed");
  return bytes;
}

export async function deletePrivateFile(path: string) {
  const match = TOKEN.exec(path);
  if (!match) return;
  const [, , id] = match;
  const response = await privateRequest("DELETE", id, sha256(Buffer.alloc(0)), secret());
  if (!response.ok && response.status !== 404) throw new Error(`HostAfrica could not remove private file (${response.status})`);
}
