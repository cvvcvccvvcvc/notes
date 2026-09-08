import type { NotesDatabase } from './database.js';

type AttachmentRow = {
  mime_type: string;
  data: Buffer;
};

export class NoteAttachmentRepository {
  constructor(private readonly database: NotesDatabase) {}

  get(ownerId: string, attachmentId: string) {
    const row = this.database
      .prepare(
        `SELECT mime_type, data
         FROM note_attachments
         WHERE owner_id = ? AND attachment_id = ?`,
      )
      .get(ownerId, attachmentId) as AttachmentRow | undefined;
    if (!row) return null;
    return { mimeType: row.mime_type, data: row.data };
  }

  put(ownerId: string, attachmentId: string, mimeType: string, data: Buffer) {
    const existing = this.get(ownerId, attachmentId);
    if (existing)
      return existing.mimeType === mimeType && existing.data.equals(data)
        ? 'unchanged'
        : 'conflict';

    this.database
      .prepare(
        `INSERT INTO note_attachments
           (owner_id, attachment_id, mime_type, data, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(ownerId, attachmentId, mimeType, data, Date.now());
    return 'created';
  }
}
