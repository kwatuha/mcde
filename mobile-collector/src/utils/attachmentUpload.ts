import { ChecklistPhotoEntry } from '../types/dataCollection';
import apiService from '../services/api';
import { photoList } from './checklistValidation';

/** Upload any photos that still have localUri; returns answers ready for API submit. */
export async function uploadPendingPhotosInAnswers(
  answers: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...answers };

  for (const [itemId, raw] of Object.entries(answers)) {
    const photos = photoList(raw);
    if (!photos.length) continue;

    const uploaded: ChecklistPhotoEntry[] = [];
    for (const p of photos) {
      if (p.fileId && p.url) {
        uploaded.push(p);
        continue;
      }
      if (!p.localUri) {
        uploaded.push(p);
        continue;
      }
      const meta = await apiService.uploadAttachment(p.localUri, {
        itemId,
        fileName: p.fileName || 'photo.jpg',
        mimeType: 'image/jpeg',
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy,
        capturedAt: p.capturedAt,
      });
      uploaded.push({
        fileId: meta.fileId,
        url: meta.url,
        fileName: meta.fileName,
        lat: meta.lat,
        lng: meta.lng,
        accuracy: meta.accuracy,
        capturedAt: meta.capturedAt,
      });
    }
    next[itemId] = { photos: uploaded };
  }

  return next;
}

export function answersHavePendingPhotos(answers: Record<string, unknown>): boolean {
  for (const raw of Object.values(answers)) {
    for (const p of photoList(raw)) {
      if (p.localUri && !p.fileId) return true;
    }
  }
  return false;
}
