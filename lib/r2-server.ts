/**
 * Server-only R2 helpers — read + write via the S3-compatible API.
 * Do NOT import this in client components.
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const bucket = process.env.R2_BUCKET_NAME;
const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

/** Base public URL, e.g. https://pub-xxx.r2.dev — no trailing slash. */
const publicBase = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 is not configured — check AWS_ENDPOINT_URL_S3, R2_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY",
    );
  }
  if (!client) {
    client = new S3Client({
      endpoint,
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export function isR2Configured(): boolean {
  return !!(bucket && endpoint && accessKeyId && secretAccessKey);
}

/** Returns the Cloudflare CDN public URL for a given R2 key. */
export function r2PublicUrl(key: string): string {
  if (!publicBase) {
    throw new Error(
      "R2_PUBLIC_URL is not set — cannot derive public URL for key: " + key,
    );
  }
  return `${publicBase}/${key}`;
}

/**
 * Read an object from R2 by key.
 * Returns the body as a Buffer, or null if the key does not exist (NoSuchKey).
 * Throws on any other error.
 */
export async function getR2Object(key: string): Promise<Buffer | null> {
  const s3 = getClient();
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket!, Key: key }),
    );
    const body = response.Body;
    if (!body) return null;
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "name" in err
        ? (err as { name?: string }).name
        : "";
    if (code === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Read an object from R2 as a UTF-8 string.
 * Returns null if the key does not exist.
 */
export async function getR2Text(key: string): Promise<string | null> {
  const buf = await getR2Object(key);
  return buf ? buf.toString("utf-8") : null;
}

/** Returns true when an object exists at `key` in the configured bucket. */
export async function r2ObjectExists(key: string): Promise<boolean> {
  const s3 = getClient();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket!, Key: key }));
    return true;
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "name" in err
        ? (err as { name?: string }).name
        : "";
    if (code === "NotFound" || code === "NoSuchKey") return false;
    throw err;
  }
}

/**
 * Write a Buffer or string to R2 under the given key.
 * @param key      - R2 object key (path)
 * @param body     - content to upload
 * @param contentType - MIME type (default: application/octet-stream)
 */
export async function putR2Object(
  key: string,
  body: Buffer | string,
  contentType = "application/octet-stream",
): Promise<void> {
  const s3 = getClient();
  const buf =
    typeof body === "string" ? Buffer.from(body, "utf-8") : (body as Buffer);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket!,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }),
  );
}

/**
 * Write a UTF-8 string to R2.
 * Convenience wrapper over putR2Object with contentType text/plain.
 */
export async function putR2Text(key: string, text: string): Promise<void> {
  await putR2Object(key, text, "text/plain; charset=utf-8");
}
