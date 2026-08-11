/**
 * Attachment pick / compress / copy / view helpers.
 *
 * Every function here is crash-safe by construction: picker results are
 * validated, files are size-capped, copies are verified, and malformed stored
 * JSON never throws. The attachment *bytes* live in the app's document
 * directory (`attachments/<id>.<ext>`); only the small `AttachmentMeta` JSON is
 * stored in the DB and synced, so on another device a chip may show without the
 * file — viewers must degrade gracefully (see `attachmentFileUri` returning
 * null instead of throwing).
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

import type { AttachmentMeta } from '@/types';
import { uuid } from '@/utils/uuid';

/** Max attachments per entry. */
export const MAX_ATTACHMENTS = 5;
/** Images are rejected above this size (before compression). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
/** PDFs are rejected above this size. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Longest image edge after compression (pixels). */
const MAX_IMAGE_DIMENSION = 1600;
/** JPEG compression quality applied to every picked image. */
const IMAGE_QUALITY = 0.7;

const ATTACHMENTS_DIR_NAME = 'attachments';

/** Stable id check — also guards the stored filename against path traversal. */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** File extension for a stored attachment (images are re-encoded to JPEG). */
function extensionFor(meta: AttachmentMeta): string {
  return meta.kind === 'pdf' ? 'pdf' : 'jpg';
}

/**
 * Parses the `attachments` JSON column into `AttachmentMeta[]`. Returns `[]`
 * for any malformed input — never throws.
 */
export function safeParseAttachments(json: string | null | undefined): AttachmentMeta[] {
  if (!json) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isAttachmentMeta);
}

function isAttachmentMeta(value: unknown): value is AttachmentMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    SAFE_ID.test(v.id) &&
    typeof v.name === 'string' &&
    typeof v.mimeType === 'string' &&
    typeof v.size === 'number' &&
    v.size >= 0 &&
    (v.kind === 'image' || v.kind === 'pdf')
  );
}

/**
 * The stored filename (`<id>.<ext>`), or null when the id is unsafe so it can
 * never escape the attachments directory.
 */
export function attachmentFileName(meta: AttachmentMeta): string | null {
  if (!SAFE_ID.test(meta.id)) {
    return null;
  }
  return `${meta.id}.${extensionFor(meta)}`;
}

/**
 * URI of the stored file, or null when the file is missing (e.g. synced
 * metadata on a device that never received the bytes). Callers show a friendly
 * message instead of crashing.
 */
export function attachmentFileUri(meta: AttachmentMeta): string | null {
  const name = attachmentFileName(meta);
  if (!name) {
    return null;
  }
  const file = new File(Paths.document, ATTACHMENTS_DIR_NAME, name);
  return file.exists ? file.uri : null;
}

function ensureAttachmentsDir(): Directory {
  const dir = new Directory(Paths.document, ATTACHMENTS_DIR_NAME);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Copies the source file (a picker/manipulator uri) into the attachments
 * directory as `filename`. Uses the streaming File API on native; falls back to
 * fetch→write on web. Throws if the copy could not be verified.
 */
async function copyIntoAttachments(sourceUri: string, filename: string): Promise<number> {
  ensureAttachmentsDir();
  const destination = new File(Paths.document, ATTACHMENTS_DIR_NAME, filename);
  if (destination.exists) {
    destination.delete();
  }
  destination.create({ intermediates: true });
  try {
    await new File(sourceUri).copy(destination);
  } catch {
    // Web / unusual uris (blob:, data:) can't stream-copy — read the bytes.
    const response = await fetch(sourceUri);
    const buffer = await response.arrayBuffer();
    destination.write(new Uint8Array(buffer));
  }
  if (!destination.exists || destination.size <= 0) {
    throw new Error('Attachment file could not be written.');
  }
  return destination.size;
}

/**
 * Picks an image (compress → store) or a PDF (store). Returns the attachment
 * metadata, or null when the user cancelled. Throws a descriptive Error on any
 * failure (size cap, unwritable file) — callers toast and continue.
 */
export async function pickAttachment(kind: 'image' | 'pdf'): Promise<AttachmentMeta | null> {
  if (kind === 'image') {
    return pickImage();
  }
  return pickPdf();
}

async function pickImage(): Promise<AttachmentMeta | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsMultipleSelection: false,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets?.[0];
  if (!asset?.uri) {
    return null;
  }
  if (asset.fileSize != null && asset.fileSize > MAX_IMAGE_BYTES) {
    throw new Error(`Image is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB. Pick a smaller one.`);
  }

  // Resize only when an edge exceeds the cap (never upscale), keeping aspect.
  const actions: ImageManipulator.Action[] = [];
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width >= height) {
      actions.push({ resize: { width: MAX_IMAGE_DIMENSION } });
    } else {
      actions.push({ resize: { height: MAX_IMAGE_DIMENSION } });
    }
  }

  // Re-encode to JPEG even when no resize is needed — this is what guarantees
  // compression for PNG/BMP sources (the picker's `quality` is ignored there).
  const manipulated = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: IMAGE_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const meta: AttachmentMeta = {
    id: uuid(),
    name: asset.fileName?.trim() || 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 0,
    kind: 'image',
  };
  const filename = attachmentFileName(meta);
  if (!filename) {
    throw new Error('Could not store the attachment.');
  }
  meta.size = await copyIntoAttachments(manipulated.uri, filename);
  return meta;
}

async function pickPdf(): Promise<AttachmentMeta | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets?.[0];
  if (!asset?.uri) {
    return null;
  }
  if (asset.size != null && asset.size > MAX_PDF_BYTES) {
    throw new Error(`PDF is larger than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB. Pick a smaller one.`);
  }

  const meta: AttachmentMeta = {
    id: uuid(),
    name: asset.name?.trim() || 'document.pdf',
    mimeType: asset.mimeType || 'application/pdf',
    size: 0,
    kind: 'pdf',
  };
  const filename = attachmentFileName(meta);
  if (!filename) {
    throw new Error('Could not store the attachment.');
  }
  meta.size = await copyIntoAttachments(asset.uri, filename);
  return meta;
}

/**
 * Opens an attachment for viewing. Images are rendered in-app by the caller;
 * this handles the share/open for PDFs (and any file). Returns false when the
 * file is missing on this device so the caller can explain.
 */
export async function openAttachment(meta: AttachmentMeta): Promise<boolean> {
  const uri = attachmentFileUri(meta);
  if (!uri) {
    return false;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: meta.mimeType, dialogTitle: meta.name });
    return true;
  }
  if (typeof window !== 'undefined') {
    window.open(uri, '_blank');
    return true;
  }
  return false;
}

/** True when the stored file exists locally. */
export function attachmentFileExists(meta: AttachmentMeta): boolean {
  const name = attachmentFileName(meta);
  if (!name) {
    return false;
  }
  return new File(Paths.document, ATTACHMENTS_DIR_NAME, name).exists;
}

/**
 * Best-effort deletion of the stored files. Never throws — used when an
 * attachment chip is removed or its entry is deleted.
 */
export async function removeAttachmentFiles(metas: AttachmentMeta[]): Promise<void> {
  for (const meta of metas) {
    const name = attachmentFileName(meta);
    if (!name) {
      continue;
    }
    try {
      const file = new File(Paths.document, ATTACHMENTS_DIR_NAME, name);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Best-effort cleanup — a stale file is harmless, a crash is not.
    }
  }
}
