import {
  NOTE_ATTACHMENT_MAX_BYTES,
  type NoteAttachment,
  type NoteAttachmentMimeType,
} from '@/src/shared/data-schema';
import {
  loadStoredNoteAttachment,
  markStoredNoteAttachmentUploaded,
  saveStoredNoteAttachment,
} from '@/lib/storage';

const MIME_TYPES = new Set<NoteAttachmentMimeType>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const attachmentLoads = new Map<string, Promise<Blob | null>>();

function isSupportedMimeType(value: string): value is NoteAttachmentMimeType {
  return MIME_TYPES.has(value as NoteAttachmentMimeType);
}

async function upload(id: string, blob: Blob) {
  const response = await fetch(
    `/api/note-attachments/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': blob.type },
      body: blob,
    },
  );
  if (!response.ok)
    throw new Error(`Attachment upload failed: ${response.status}`);
  await markStoredNoteAttachmentUploaded(id);
}

async function download(id: string) {
  const response = await fetch(
    `/api/note-attachments/${encodeURIComponent(id)}`,
    { credentials: 'same-origin' },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`Attachment download failed: ${response.status}`);
  const blob = await response.blob();
  if (!isSupportedMimeType(blob.type))
    throw new Error('Attachment has an unsupported image type');
  await saveStoredNoteAttachment(id, { blob, uploaded: true });
  return blob;
}

export async function savePastedNoteAttachment(
  file: File,
): Promise<NoteAttachment> {
  const mimeType = file.type.toLowerCase();
  if (!isSupportedMimeType(mimeType))
    throw new Error('Поддерживаются PNG, JPEG, WebP и GIF');
  if (file.size === 0) throw new Error('Пустое изображение не добавлено');
  if (file.size > NOTE_ATTACHMENT_MAX_BYTES)
    throw new Error('Изображение больше 12 МБ');

  const id = crypto.randomUUID();
  const blob = file.slice(0, file.size, mimeType);
  await saveStoredNoteAttachment(id, { blob, uploaded: false });
  void upload(id, blob).catch(() => undefined);
  return { id, mimeType, size: blob.size, createdAt: Date.now() };
}

export function loadNoteAttachment(id: string) {
  const existing = attachmentLoads.get(id);
  if (existing) return existing;

  const load = loadStoredNoteAttachment(id)
    .then((local) => {
      if (!local) return download(id);
      if (!local.uploaded) void upload(id, local.blob).catch(() => undefined);
      return local.blob;
    })
    .finally(() => {
      if (attachmentLoads.get(id) === load) attachmentLoads.delete(id);
    });
  attachmentLoads.set(id, load);
  return load;
}

export async function synchronizeNoteAttachments(ids: readonly string[]) {
  await Promise.allSettled(ids.map((id) => loadNoteAttachment(id)));
}

function convertToPng(blob: Blob) {
  return createImageBitmap(blob).then(async (bitmap) => {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Canvas is unavailable');
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!png) throw new Error('Image conversion failed');
    return png;
  });
}

export function copyNoteAttachmentToClipboard(blob: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
    return Promise.reject(new Error('Image clipboard is unavailable'));

  const supported =
    typeof ClipboardItem.supports !== 'function' ||
    ClipboardItem.supports(blob.type);
  const mimeType = supported ? blob.type : 'image/png';
  const value = supported ? blob : convertToPng(blob);
  return navigator.clipboard.write([new ClipboardItem({ [mimeType]: value })]);
}
