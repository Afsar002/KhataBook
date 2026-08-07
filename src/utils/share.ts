/**
 * Writes an export (backup JSON, PDF, Excel) to a temp file and hands it to
 * the system share sheet — WhatsApp, Drive, Gmail, nearby sharing, etc.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

interface ShareFileOptions {
  /** File name shown to the user, e.g. `dailykhata-backup-2026-08-04.json`. */
  filename: string;
  /** Text or binary contents to write. */
  content: string | Uint8Array;
  mimeType?: string;
  dialogTitle?: string;
}

/**
 * Creates the file in the cache folder and opens the share sheet.
 * Resolves once written; throws if the write fails.
 */
export async function writeAndShareFile({
  filename,
  content,
  mimeType,
  dialogTitle,
}: ShareFileOptions): Promise<void> {
  const file = new File(Paths.cache, filename);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle,
      UTI: mimeType,
    });
  }
  // Without a share sheet the file still exists in app storage.
}
