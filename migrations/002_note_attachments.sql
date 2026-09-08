CREATE TABLE note_attachments (
  owner_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, attachment_id)
) STRICT;
