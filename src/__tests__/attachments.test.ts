/**
 * Attachment util crash-safety tests.
 *
 * Covers the pure parsers (`safeParseAttachments`, `attachmentFileName`),
 * the pick/compress/copy flow (image + PDF) with native modules mocked, size
 * caps, and graceful degradation for missing local files. Every case must
 * never throw unexpectedly — the util's contract is "toast, don't crash".
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

import type { AttachmentMeta } from '@/types';
import {
  attachmentFileName,
  attachmentFileUri,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  openAttachment,
  pickAttachment,
  removeAttachmentFiles,
  safeParseAttachments,
} from '@/utils/attachments';

// Deterministic uuid so stored filenames are known + SAFE_ID-valid.
jest.mock('@/utils/uuid', () => ({ uuid: () => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }));

// In-memory "filesystem": File/Directory with a shared map so copies are
// verifiable (exists + size) exactly like the native implementation.
jest.mock('expo-file-system', () => {
  const files = new Map<string, number>();
  class MockFile {
    uri: string;
    exists: boolean;
    size: number;
    constructor(...segments: unknown[]) {
      this.uri = segments.filter((s) => typeof s === 'string').join('/');
      this.exists = (files.get(this.uri) ?? 0) > 0;
      this.size = files.get(this.uri) ?? 0;
    }
    create() {
      // no-op — storage dir already "exists" in this mock
    }
    delete() {
      files.delete(this.uri);
      this.exists = false;
      this.size = 0;
    }
    async copy(destination: MockFile) {
      files.set(destination.uri, 54321);
      destination.exists = true;
      destination.size = 54321;
    }
    write() {
      // no-op
    }
  }
  class MockDirectory {
    uri: string;
    exists = true;
    constructor(...segments: unknown[]) {
      this.uri = segments.filter((s) => typeof s === 'string').join('/');
    }
    create() {
      // no-op
    }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: '/mock/documents', cache: '/mock/cache' },
  };
});

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

const launchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const manipulateAsync = ImageManipulator.manipulateAsync as jest.Mock;
const shareAsync = Sharing.shareAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  manipulateAsync.mockResolvedValue({ uri: 'file://manipulated.jpg', width: 1600, height: 800 });
});

const STORED_URI = '/mock/documents/attachments/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg';

describe('safeParseAttachments', () => {
  it('returns [] for empty / missing input', () => {
    expect(safeParseAttachments(null)).toEqual([]);
    expect(safeParseAttachments(undefined)).toEqual([]);
    expect(safeParseAttachments('')).toEqual([]);
  });

  it('returns [] for malformed JSON (never throws)', () => {
    expect(safeParseAttachments('{oops')).toEqual([]);
    expect(safeParseAttachments('[]broken')).toEqual([]);
  });

  it('returns [] when the JSON is not an array', () => {
    expect(safeParseAttachments('{}')).toEqual([]);
    expect(safeParseAttachments('"image"')).toEqual([]);
    expect(safeParseAttachments('42')).toEqual([]);
  });

  it('parses a well-formed array', () => {
    const meta: AttachmentMeta = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'receipt.jpg',
      mimeType: 'image/jpeg',
      size: 1234,
      kind: 'image',
    };
    expect(safeParseAttachments(JSON.stringify([meta]))).toEqual([meta]);
  });

  it('drops malformed entries and keeps valid ones', () => {
    const json = JSON.stringify([
      { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'ok.jpg', mimeType: 'image/jpeg', size: 1, kind: 'image' },
      { id: 'unsafe/../id', name: 'bad.jpg', mimeType: 'image/jpeg', size: 1, kind: 'image' }, // unsafe id
      { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'no-size', mimeType: 'image/jpeg', kind: 'image' }, // missing size
      { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'video.mp4', mimeType: 'video/mp4', size: 5, kind: 'video' }, // bad kind
      'not-an-object',
    ]);
    const parsed = safeParseAttachments(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('ok.jpg');
  });
});

describe('attachmentFileName (path-traversal guard)', () => {
  const base: AttachmentMeta = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 10,
    kind: 'image',
  };

  it('accepts a safe id and appends the right extension', () => {
    expect(attachmentFileName(base)).toBe(`${base.id}.jpg`);
    expect(attachmentFileName({ ...base, kind: 'pdf' })).toBe(`${base.id}.pdf`);
  });

  it.each([
    ['path traversal', '../evil'],
    ['absolute path', '/etc/passwd'],
    ['backslash', '..\\evil'],
    ['unsafe chars', 'id with spaces'],
    ['too short', 'abc'],
    ['empty', ''],
  ])('rejects %s', (_label, id) => {
    expect(attachmentFileName({ ...base, id })).toBeNull();
  });
});

describe('attachmentFileUri / openAttachment (missing-file degradation)', () => {
  const meta: AttachmentMeta = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'receipt.pdf',
    mimeType: 'application/pdf',
    size: 100,
    kind: 'pdf',
  };

  it('returns null for a missing file (does not throw)', () => {
    expect(attachmentFileUri(meta)).toBeNull();
  });

  it('openAttachment returns false when the file is missing', async () => {
    await expect(openAttachment(meta)).resolves.toBe(false);
    expect(shareAsync).not.toHaveBeenCalled();
  });
});

describe('pickAttachment — image', () => {
  beforeEach(() => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://library/big.png',
          fileSize: 2 * 1024 * 1024,
          width: 3000,
          height: 1500,
          fileName: 'Big Photo.png',
        },
      ],
    });
  });

  it('returns null when the user cancels', async () => {
    launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickAttachment('image')).resolves.toBeNull();
    expect(manipulateAsync).not.toHaveBeenCalled();
  });

  it('rejects an oversized image with a friendly message (no crash)', async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://library/huge.png', fileSize: MAX_IMAGE_BYTES + 1, width: 4000, height: 3000 }],
    });
    await expect(pickAttachment('image')).rejects.toThrow(/larger than 15 MB/i);
  });

  it('compresses (resize long edge + JPEG) and stores a verified copy', async () => {
    const meta = await pickAttachment('image');
    expect(meta).not.toBeNull();
    expect(meta!.kind).toBe('image');
    expect(meta!.mimeType).toBe('image/jpeg');
    expect(meta!.name).toBe('Big Photo.png');
    expect(meta!.size).toBeGreaterThan(0);
    // 3000x1500 exceeds 1600 → resized by width, saved as JPEG @ 0.7.
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file://library/big.png',
      [{ resize: { width: 1600 } }],
      { compress: 0.7, format: 'jpeg' }
    );
    // The copied file is visible at its stored uri.
    expect(attachmentFileUri(meta!)).toBe(STORED_URI);
  });

  it('does not upscale a small image (no resize actions)', async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://library/small.png', fileSize: 500, width: 800, height: 600, fileName: 'small.png' }],
    });
    const meta = await pickAttachment('image');
    expect(meta!.kind).toBe('image');
    expect(manipulateAsync).toHaveBeenCalledWith(
      'file://library/small.png',
      [],
      expect.objectContaining({ compress: 0.7, format: 'jpeg' })
    );
  });
});

describe('pickAttachment — pdf', () => {
  beforeEach(() => {
    (jest.requireMock('expo-document-picker').getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file://picker/bill.pdf',
          size: 1024,
          name: 'Bill 2026.pdf',
          mimeType: 'application/pdf',
        },
      ],
    });
  });

  it('returns null when the user cancels', async () => {
    (jest.requireMock('expo-document-picker').getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: null,
    });
    await expect(pickAttachment('pdf')).resolves.toBeNull();
  });

  it('rejects an oversized PDF with a friendly message', async () => {
    (jest.requireMock('expo-document-picker').getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://picker/huge.pdf', size: MAX_PDF_BYTES + 1, name: 'huge.pdf' }],
    });
    await expect(pickAttachment('pdf')).rejects.toThrow(/larger than 25 MB/i);
  });

  it('stores the PDF as-is and returns its metadata', async () => {
    const meta = await pickAttachment('pdf');
    expect(meta).not.toBeNull();
    expect(meta!.kind).toBe('pdf');
    expect(meta!.name).toBe('Bill 2026.pdf');
    expect(meta!.size).toBeGreaterThan(0);
    expect(attachmentFileUri(meta!)).toBe('/mock/documents/attachments/a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf');
  });
});

describe('removeAttachmentFiles (best-effort cleanup)', () => {
  const meta: AttachmentMeta = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 100,
    kind: 'image',
  };

  it('does not throw for missing files or unsafe ids', async () => {
    await expect(removeAttachmentFiles([meta])).resolves.toBeUndefined();
    await expect(removeAttachmentFiles([{ ...meta, id: '../evil' }])).resolves.toBeUndefined();
    await expect(removeAttachmentFiles([])).resolves.toBeUndefined();
  });

  it('deletes a stored file', async () => {
    // Make the file "exist" by going through the copy flow.
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://library/photo.png', fileSize: 500, width: 800, height: 600, fileName: 'photo.png' }],
    });
    const stored = await pickAttachment('image');
    expect(attachmentFileUri(stored!)).not.toBeNull();
    await removeAttachmentFiles([stored!]);
    expect(attachmentFileUri(stored!)).toBeNull();
  });
});
