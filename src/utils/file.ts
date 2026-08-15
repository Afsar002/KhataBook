/**
 * File utilities for writing/reading from app storage directories.
 *
 * - `Paths.document` = Documents directory (persists across app updates, accessible on Android via file manager)
 * - `Paths.cache` = Cache directory (may be cleared by OS, not accessible to user)
 *
 * For backups that should survive app deletion, use the document directory.
 * Note: On iOS, the app's Documents folder is still in the sandbox and deleted with the app.
 * For true persistence, use the share sheet to save to iCloud/Google Drive/external storage.
 */

import { File, Paths } from 'expo-file-system';

/**
 * Writes content to a file in the Documents directory (persistent storage).
 * Returns the file URI.
 */
export async function writeFileToDocuments(filename: string, content: string): Promise<string> {
  const file = new File(Paths.document, filename);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(content);
  return file.uri;
}

/**
 * Writes content to a file in the cache directory (temporary storage).
 * Returns the file URI.
 */
export async function writeFileToCache(filename: string, content: string): Promise<string> {
  const file = new File(Paths.cache, filename);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(content);
  return file.uri;
}

/**
 * Reads a text file from the Documents directory.
 */
export async function readFileFromDocuments(filename: string): Promise<string | null> {
  const file = new File(Paths.document, filename);
  if (!file.exists) {
    return null;
  }
  return file.text();
}

/**
 * Reads a text file from the cache directory.
 */
export async function readFileFromCache(filename: string): Promise<string | null> {
  const file = new File(Paths.cache, filename);
  if (!file.exists) {
    return null;
  }
  return file.text();
}

/**
 * Deletes a file from the Documents directory.
 */
export async function deleteFileFromDocuments(filename: string): Promise<void> {
  const file = new File(Paths.document, filename);
  if (file.exists) {
    file.delete();
  }
}

/**
 * Deletes a file from the cache directory.
 */
export async function deleteFileFromCache(filename: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  if (file.exists) {
    file.delete();
  }
}

/**
 * Lists all files in the Documents directory.
 */
export async function listDocumentFiles(): Promise<string[]> {
  try {
    // Paths.document is already a Directory instance in expo-file-system v2
    const files = Paths.document.list();
    return files.map((f) => f.name);
  } catch {
    return [];
  }
}

/**
 * Lists all files in the cache directory.
 */
export async function listCacheFiles(): Promise<string[]> {
  try {
    const files = Paths.cache.list();
    return files.map((f) => f.name);
  } catch {
    return [];
  }
}