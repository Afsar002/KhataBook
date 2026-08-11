/**
 * Loads the Inter TTF bytes used to render PDFs with a real ₹ (U+20B9) glyph.
 *
 * pdf-lib's built-in base-14 fonts (Helvetica) use WinAnsi encoding, which has
 * no rupee sign — so a PDF that renders "₹" must embed a custom font. We reuse
 * the app's bundled Inter fonts (the same files `useFonts` loads for the UI),
 * which include U+20B9.
 *
 * Loading the bytes is async and environment-dependent (native asset download
 * on device, none in Jest), so anything can fail. Every failure is swallowed
 * and `getPdfFontBytes()` returns `null`; the PDF builders then fall back to
 * Helvetica and "Rs. 1,23,456" with an identical layout.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';

export interface PdfFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
}

/** Bytes injected by tests/dev environments that cannot load native assets. */
let injected: PdfFontBytes | null = null;
/** `undefined` = not resolved yet; `null` = resolved to "no fonts". */
let cached: PdfFontBytes | null | undefined;

/** Supplies font bytes from outside (tests), bypassing asset loading. */
export function setPdfFontBytes(bytes: PdfFontBytes | null): void {
  injected = bytes;
  cached = undefined; // invalidate any cached resolution
}

async function readAssetBytes(resource: unknown): Promise<Uint8Array | null> {
  try {
    const asset = Asset.fromModule(resource as Parameters<typeof Asset.fromModule>[0]);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) return null;
    return new File(uri).bytes();
  } catch {
    return null;
  }
}

/** Memoized loader. Resolves to `null` when the font bytes are unavailable. */
export async function getPdfFontBytes(): Promise<PdfFontBytes | null> {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    if (injected) {
      cached = injected;
      return cached;
    }
    const [regular, bold] = await Promise.all([
      readAssetBytes(Inter_400Regular),
      readAssetBytes(Inter_700Bold),
    ]);
    if (regular && bold) {
      cached = { regular, bold };
    }
  } catch {
    cached = null;
  }
  return cached;
}
