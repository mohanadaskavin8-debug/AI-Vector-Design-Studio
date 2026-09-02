import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { confirmObjectUpload, createProject, createProjectVersion, getGetProjectQueryKey, getProject, requestObjectUploadUrl, updateProject, useGetProject } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { editorStore } from '../store/editor';
import { embroideryStore } from '../store/embroidery';
import { cloudDocumentFingerprint, createBlankCloudDocument, deserializeCloudDocument, serializeCloudDocument, type CloudDocumentV1 } from './cloudDocument';
import { uploadEmbeddedImages } from './assets';

export type CloudSaveStatus = 'loading' | 'local-only' | 'unsaved' | 'saving' | 'saved' | 'offline' | 'conflict' | 'read-only' | 'error' | 'updated';
interface CloudContextValue {
  projectId?: string; permission?: 'owner' | 'edit' | 'view'; revision?: number; status: CloudSaveStatus;
  message?: string; isReadOnly: boolean; saveNow: () => Promise<boolean>; checkpoint: (label: string) => Promise<void>;
  reloadRemote: () => Promise<void>; createCopy: () => Promise<void>; collaborationOpen: boolean; setCollaborationOpen: (open: boolean) => void;
  hydrateProject: (project: { document: unknown; revision: number; name: string }) => void;
}
const localValue: CloudContextValue = { status: 'local-only', isReadOnly: false, saveNow: async () => true, checkpoint: async () => {}, reloadRemote: async () => {}, createCopy: async () => {}, collaborationOpen: false, setCollaborationOpen: () => {}, hydrateProject: () => {} };
const CloudContext = createContext<CloudContextValue>(localValue);
export const useCloudProject = () => useContext(CloudContext);

const snapshot = () => serializeCloudDocument(editorStore.get(), embroideryStore.get());
const hydrate = (document: CloudDocumentV1, name: string) => {
  editorStore.set({
    objects: document.objects, artboard: document.artboard, guides: document.guides,
    snapToGrid: document.snapping.snapToGrid, snapToObjects: document.snapping.snapToObjects, gridSize: document.snapping.gridSize,
    unit: document.unit, previewState: document.preview, projectName: name, selection: [], activeTool: 'select',
    history: [document.objects], historyIndex: 0,
  });
  embroideryStore.set({ design: document.embroidery.design, viewSettings: document.embroidery.viewSettings, selectedRegionIds: [] });
};

async function uploadThumbnail(projectId: string, document: CloudDocumentV1) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${document.artboard.width} ${document.artboard.height}"><rect width="100%" height="100%" fill="${document.artboard.fill.replace(/["<>&]/g, '')}"/><text x="24" y="48" fill="#8b5cf6" font-family="sans-serif" font-size="22">${document.objects.length} layers</text></svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const target = await requestObjectUploadUrl({ projectId, kind: 'thumbnail', name: 'thumbnail.svg', size: blob.size, contentType: blob.type });
  const response = await fetch(target.uploadURL, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
  if (!response.ok) throw new Error('Thumbnail upload failed.');
  // Assets are unserveable until the server has verified the uploaded bytes.
  await confirmObjectUpload({ objectPath: target.objectPath });
  return target.objectPath;
}

export function CloudProjectProvider({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const query = useGetProject(projectId, { query: {
    queryKey: getGetProjectQueryKey(projectId),
    // Stop polling (and retrying) once access is denied or the project is
    // gone — hammering a 403/404 every 5s is pure noise.
    refetchInterval: latest => {
      const status = (latest.state.error as { status?: number } | null)?.status;
      return status === 403 || status === 404 ? false : 5000;
    },
    retry: (failureCount, error) => {
      const status = (error as { status?: number } | null)?.status;
      return status === 403 || status === 404 ? false : failureCount < 3;
    },
  } });
  const [status, setStatus] = useState<CloudSaveStatus>('loading');
  const [message, setMessage] = useState<string>();
  const [revision, setRevision] = useState<number>();
  const revisionRef = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const savedFingerprint = useRef('');
  const dirty = useRef(false);
  const hydratedRevision = useRef<number | undefined>(undefined);
  const saving = useRef(false);
  const thumbnailAt = useRef(0);
  const savedName = useRef('');
  const resaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resaveTimer.current), []);

  const hydrateProject = useCallback((project: { document: unknown; revision: number; name: string }) => {
    const fallback = snapshot();
    const document = deserializeCloudDocument(project.document, fallback);
    hydrate(document, project.name);
    savedFingerprint.current = cloudDocumentFingerprint(document);
    savedName.current = project.name;
    dirty.current = false;
    hydratedRevision.current = project.revision;
    revisionRef.current = project.revision;
    setRevision(project.revision);
    setStatus(query.data?.permission === 'view' ? 'read-only' : 'saved');
    setMessage(undefined);
  }, [query.data?.permission]);

  useEffect(() => {
    const project = query.data;
    if (!project) return;
    if (hydratedRevision.current === undefined) hydrateProject(project);
    else if (project.revision > (hydratedRevision.current ?? -1) && !dirty.current && !saving.current) {
      hydrateProject(project);
      setStatus(project.permission === 'view' ? 'read-only' : 'updated');
      setMessage('Updated from collaborator');
    }
  }, [query.data, hydrateProject]);
  useEffect(() => { if (query.error) { setStatus(navigator.onLine ? 'error' : 'offline'); setMessage((query.error as Error).message); } }, [query.error]);

  const save: (explicit?: boolean) => Promise<boolean> = useCallback(async (explicit = false) => {
    const project = query.data;
    if (!project || project.permission === 'view' || revisionRef.current === undefined || saving.current) return false;
    const initialDocument = snapshot();
    const currentName = editorStore.get().projectName.trim() || project.name;
    if (!explicit && cloudDocumentFingerprint(initialDocument) === savedFingerprint.current && (project.permission !== 'owner' || currentName === savedName.current)) {
      dirty.current = false;
      return true;
    }
    saving.current = true; setStatus('saving'); setMessage(undefined);
    try {
      let document = initialDocument;
      const uploaded = await uploadEmbeddedImages(projectId, document.objects);
      if (uploaded.some((object, index) => object.imageSrc !== document.objects[index]?.imageSrc)) {
        document = { ...document, objects: uploaded };
        const uploadedSources = new Map(uploaded.map(object => [object.id, object.imageSrc]));
        const state = editorStore.get();
        editorStore.set({
          objects: uploaded,
          history: state.history.map(entry => entry.map(object => {
            const imageSrc = uploadedSources.get(object.id);
            return imageSrc && object.type === 'image' ? { ...object, imageSrc } : object;
          })),
        });
      }
      const shouldThumbnail = explicit || Date.now() - thumbnailAt.current >= 30000;
      const thumbnailObjectPath = shouldThumbnail ? await uploadThumbnail(projectId, document) : undefined;
      if (shouldThumbnail) thumbnailAt.current = Date.now();
      const result = await updateProject(projectId, {
        expectedRevision: revisionRef.current, document, schemaVersion: 1,
        ...(project.permission === 'owner' ? { name: currentName } : {}),
        ...(thumbnailObjectPath ? { thumbnailObjectPath } : {}),
      });
      savedFingerprint.current = cloudDocumentFingerprint(document);
      savedName.current = result.name;
      const stillDirty = cloudDocumentFingerprint(snapshot()) !== savedFingerprint.current
        || (project.permission === 'owner' && (editorStore.get().projectName.trim() || result.name) !== savedName.current);
      dirty.current = stillDirty;
      hydratedRevision.current = result.revision;
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setStatus(stillDirty ? 'unsaved' : 'saved');
      if (stillDirty) {
        clearTimeout(resaveTimer.current);
        resaveTimer.current = setTimeout(() => void save(false), 1500);
      }
      return true;
    } catch (error) {
      const apiError = error as { name?: string; status?: number; data?: unknown };
      if (apiError.name === 'ApiError' && apiError.status === 409) {
        const data = apiError.data as { currentRevision?: number } | null;
        setStatus('conflict');
        setMessage(`A collaborator saved revision ${data?.currentRevision ?? 'newer'}. Choose a recovery action.`);
      } else {
        setStatus(navigator.onLine ? 'error' : 'offline');
        setMessage(error instanceof Error ? error.message : 'Cloud save failed.');
      }
      return false;
    } finally { saving.current = false; }
  }, [projectId, query.data]);

  useEffect(() => {
    if (!query.data || query.data.permission === 'view' || revision === undefined) return;
    let changeTimer: ReturnType<typeof setTimeout> | undefined;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(changeTimer);
      clearTimeout(saveTimer);
      changeTimer = setTimeout(() => {
        const next = cloudDocumentFingerprint(snapshot());
        const nameChanged = query.data.permission === 'owner'
          && (editorStore.get().projectName.trim() || query.data.name) !== savedName.current;
        if (next === savedFingerprint.current && !nameChanged) {
          dirty.current = false;
          return;
        }
        dirty.current = true;
        setStatus(current => current === 'conflict' ? current : 'unsaved');
        saveTimer = setTimeout(() => void save(false), 1350);
      }, 150);
    };
    const unsubEditor = editorStore.subscribe(changed);
    const unsubEmbroidery = embroideryStore.subscribe(changed);
    return () => {
      unsubEditor();
      unsubEmbroidery();
      clearTimeout(changeTimer);
      clearTimeout(saveTimer);
    };
  }, [query.data, revision, save]);

  const checkpoint = useCallback(async (label: string) => {
    if (!(await save(true))) throw new Error('Save the project before creating a checkpoint.');
    try {
      // Pin the checkpoint to the revision we just saved so a concurrent
      // collaborator save cannot slip into a checkpoint labeled by this user.
      await createProjectVersion(projectId, { label: label.trim() || null, expectedRevision: revisionRef.current });
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 409) throw new Error('A collaborator saved just now. Sync to the latest version, then try the checkpoint again.');
      throw error;
    }
  }, [projectId, save]);
  const reloadRemote = useCallback(async () => hydrateProject(await getProject(projectId)), [hydrateProject, projectId]);
  const createCopy = useCallback(async () => {
    try {
      let document = snapshot();
      const name = `${editorStore.get().projectName} (conflict copy)`;
      const copy = await createProject({ name, document: createBlankCloudDocument(), schemaVersion: 1 });
      document = { ...document, objects: await uploadEmbeddedImages(copy.id, document.objects) };
      await updateProject(copy.id, { expectedRevision: copy.revision, document, schemaVersion: 1, name });
      navigate(`/editor/${copy.id}`);
    } catch (error) {
      setStatus('conflict');
      setMessage(error instanceof Error ? `Could not create a recovery copy: ${error.message}` : 'Could not create a recovery copy.');
    }
  }, [navigate]);

  const value = useMemo<CloudContextValue>(() => ({
    projectId, permission: query.data?.permission, revision, status, message, isReadOnly: !query.data || query.data.permission === 'view',
    saveNow: () => save(true), checkpoint, reloadRemote, createCopy, collaborationOpen: open, setCollaborationOpen: setOpen, hydrateProject,
  }), [projectId, query.data?.permission, revision, status, message, save, checkpoint, reloadRemote, createCopy, open, hydrateProject]);
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}