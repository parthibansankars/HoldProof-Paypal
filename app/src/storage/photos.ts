/** Evidence photos live in the app's private document directory; their SHA-256 goes into the evidence digest. */
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const dir = () => new Directory(Paths.document, 'evidence');

function ensureDir() {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
}

export async function sha256(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

export function newId(): string {
  return Crypto.randomUUID();
}

/** Normalises a camera capture to a 1024 px JPEG, stores it, and returns its file name, base64 and hash. */
export async function storeEvidencePhoto(sourceUri: string, fileName: string): Promise<{ fileName: string; base64: string; sha256: string }> {
  ensureDir();
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: 1024 });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!result.base64) throw new Error('Could not encode the photo.');
  const file = new File(dir(), fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(result.base64, { encoding: 'base64' });
  // Hash the stored bytes as read back, so later verification reads exactly the same encoding.
  const stored = await file.base64();
  const hash = await sha256(stored);
  return { fileName, base64: stored, sha256: hash };
}

export function photoUri(fileName: string): string {
  return new File(dir(), fileName).uri;
}

export async function readPhotoBase64(fileName: string): Promise<string> {
  const file = new File(dir(), fileName);
  if (!file.exists) throw new Error(`Evidence photo ${fileName} is missing.`);
  return file.base64();
}

export async function hashStoredPhoto(fileName: string): Promise<string | null> {
  try {
    return await sha256(await readPhotoBase64(fileName));
  } catch {
    return null;
  }
}
