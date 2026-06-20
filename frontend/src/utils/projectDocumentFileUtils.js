/** Resolve API base URL for static /uploads file paths. */
export function getProjectDocumentApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes('8084') || origin.includes('8080')) {
    return origin.replace(/:8080|:8084|:5174/, ':3000');
  }
  return window.location.origin;
}

/** Build a browser URL for a stored project document path. */
export function getProjectDocumentFileUrl(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;

  const apiBaseUrl = getProjectDocumentApiBaseUrl();
  let fileUrl = filePath;
  if (fileUrl.startsWith('api/')) fileUrl = fileUrl.substring(4);

  if (fileUrl.startsWith('/uploads/')) return `${apiBaseUrl}${fileUrl}`;
  if (fileUrl.startsWith('uploads/')) return `${apiBaseUrl}/${fileUrl}`;
  if (fileUrl.startsWith('/')) return `${apiBaseUrl}${fileUrl}`;
  return `${apiBaseUrl}/uploads/${fileUrl}`;
}

function getFileExtension(doc) {
  const value = String(doc?.originalFileName || doc?.fileName || doc?.documentPath || doc?.filePath || '').toLowerCase();
  const match = value.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  return match?.[1] || '';
}

export function inferProjectDocumentMimeType(doc) {
  const mime = doc?.mimeType || doc?.mime_type || doc?.mimetype;
  if (mime) return String(mime);
  const ext = getFileExtension(doc);
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  if (['txt', 'csv', 'log'].includes(ext)) return 'text/plain';
  if (['htm', 'html'].includes(ext)) return 'text/html';
  if (['mp4', 'webm', 'ogg'].includes(ext)) return `video/${ext === 'ogg' ? 'ogg' : ext}`;
  if (['mp3', 'wav', 'm4a'].includes(ext)) return `audio/${ext === 'm4a' ? 'mp4' : ext}`;
  return '';
}

export function canPreviewProjectDocumentInline(doc) {
  const mime = inferProjectDocumentMimeType(doc).toLowerCase();
  const ext = getFileExtension(doc);
  return (
    mime.startsWith('image/')
    || mime === 'application/pdf'
    || mime.startsWith('text/')
    || mime.startsWith('video/')
    || mime.startsWith('audio/')
    || ['pdf', 'txt', 'csv', 'log', 'html', 'htm', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a'].includes(ext)
  );
}

export function isProjectDocumentImage(doc) {
  const mime = inferProjectDocumentMimeType(doc).toLowerCase();
  const ext = getFileExtension(doc);
  return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
}
