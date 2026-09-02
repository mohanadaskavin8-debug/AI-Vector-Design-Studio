import { confirmObjectUpload, requestObjectUploadUrl } from '@workspace/api-client-react';
import type { VectorObject } from '../lib/types';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const resolvePrivateObjectUrl = (objectPath?: string) =>
  objectPath?.startsWith('/objects/') ? `${base}/api/storage${objectPath}` : objectPath || '';

export async function uploadEmbeddedImages(projectId: string, objects: VectorObject[]): Promise<VectorObject[]> {
  return Promise.all(objects.map(async object => {
    if (object.type !== 'image' || !object.imageSrc?.startsWith('data:image/')) return object;
    const response = await fetch(object.imageSrc);
    const blob = await response.blob();
    const contentType = blob.type || 'image/png';
    const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const upload = await requestObjectUploadUrl({ projectId, kind: 'image', name: `${object.id}.${extension}`, size: blob.size, contentType });
    const put = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!put.ok) throw new Error(`Image upload failed (${put.status}). Your changes remain unsaved.`);
    // Server verifies the real uploaded object (size + type) and rejects violators.
    await confirmObjectUpload({ objectPath: upload.objectPath });
    return { ...object, imageSrc: upload.objectPath };
  }));
}

export async function embedPrivateImages(objects: VectorObject[]): Promise<VectorObject[]> {
  return Promise.all(objects.map(async object => {
    if (object.type !== 'image' || !object.imageSrc?.startsWith('/objects/')) return object;
    const response = await fetch(resolvePrivateObjectUrl(object.imageSrc), { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not include image "${object.name}" in the export.`);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { ...object, imageSrc: dataUrl };
  }));
}