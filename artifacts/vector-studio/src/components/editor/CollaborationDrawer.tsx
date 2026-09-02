import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/react';
import { getListProjectPresenceQueryKey, getListProjectShareLinksQueryKey, getListProjectVersionsQueryKey, useCreateProjectShareLink, useHeartbeatProjectPresence, useListProjectPresence, useListProjectShareLinks, useListProjectVersions, useRestoreProjectVersion, useRevokeProjectShareLink } from '@workspace/api-client-react';
import { Copy, History, Link2, Users, X } from 'lucide-react';
import { useCloudProject } from '../../cloud/CloudProjectProvider';
import { deserializeCloudDocument } from '../../cloud/cloudDocument';
import { editorStore, useEditorStore } from '../../store/editor';
import { embroideryStore } from '../../store/embroidery';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const clientId = (() => {
  const key = 'vector-studio-presence-client';
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
})();

export default function CollaborationDrawer() {
  const cloud = useCloudProject();
  const { user } = useUser();
  const { selection, workspaceMode } = useEditorStore();
  const projectId = cloud.projectId || '';
  const [tab, setTab] = useState<'presence' | 'history' | 'share'>('presence');
  const [label, setLabel] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [duration, setDuration] = useState(7);
  const presence = useListProjectPresence(projectId, { query: { queryKey: getListProjectPresenceQueryKey(projectId), enabled: !!projectId && cloud.collaborationOpen, refetchInterval: 8000 } });
  const versions = useListProjectVersions(projectId, { query: { queryKey: getListProjectVersionsQueryKey(projectId), enabled: !!projectId && cloud.collaborationOpen } });
  const shares = useListProjectShareLinks(projectId, { query: { queryKey: getListProjectShareLinksQueryKey(projectId), enabled: !!projectId && cloud.collaborationOpen && cloud.permission === 'owner' } });
  const heartbeat = useHeartbeatProjectPresence();
  const restore = useRestoreProjectVersion();
  const createShare = useCreateProjectShareLink();
  const revoke = useRevokeProjectShareLink();

  const presenceState = useMemo(() => ({
    displayName: user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Collaborator',
    avatarUrl: user?.imageUrl, color: '#8B5CF6', mode: workspaceMode,
    selectionCount: selection.length, permission: cloud.permission,
  }), [user, workspaceMode, selection.length, cloud.permission]);
  useEffect(() => {
    if (!projectId) return;
    const beat = () => heartbeat.mutate({ projectId, data: { clientId, state: presenceState } });
    beat(); const timer = setInterval(beat, 12000); return () => clearInterval(timer);
  }, [projectId, presenceState]); // mutation object is intentionally excluded: it is not stable
  useEffect(() => {
    if (!cloud.collaborationOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') cloud.setCollaborationOpen(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [cloud.collaborationOpen]);
  useEffect(() => {
    if (!cloud.collaborationOpen) setCreatedUrl('');
  }, [cloud.collaborationOpen]);
  if (!cloud.collaborationOpen || !projectId) return null;

  const currentFallback = deserializeCloudDocument(null, {
    type: 'vector-studio-document', version: 1, objects: editorStore.get().objects, artboard: editorStore.get().artboard,
    guides: editorStore.get().guides, snapping: { snapToGrid: editorStore.get().snapToGrid, snapToObjects: editorStore.get().snapToObjects, gridSize: editorStore.get().gridSize },
    unit: editorStore.get().unit, preview: editorStore.get().previewState,
    embroidery: { design: embroideryStore.get().design, viewSettings: embroideryStore.get().viewSettings },
  });
  const summary = (payload: unknown) => {
    const doc = deserializeCloudDocument(payload, currentFallback);
    return `${doc.objects.length} layers · ${doc.artboard.width}×${doc.artboard.height} · ${doc.preview.scene}/${doc.preview.preset} · ${doc.embroidery.design.regions.length} stitch regions`;
  };
  const makeShare = () => createShare.mutate({
    projectId, data: { permission, expiresAt: new Date(Date.now() + duration * 86400000).toISOString() },
  }, { onSuccess: result => { setCreatedUrl(`${window.location.origin}${base}/join/${result.token}`); shares.refetch(); } });

  return (
    <div className="fixed inset-0 z-[80] bg-black/60" onPointerDown={() => cloud.setCollaborationOpen(false)}>
      <aside role="dialog" aria-modal="true" aria-label="Project collaboration" onPointerDown={event => event.stopPropagation()} className="absolute right-0 top-0 h-full w-[440px] max-w-full bg-card border-l border-white/10 shadow-2xl flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-white/10">
          <div><h2 className="font-semibold">Collaboration</h2><p className="text-[11px] text-muted-foreground">Presence and updates are polled — not realtime cursors.</p></div>
          <button autoFocus aria-label="Close collaboration" onClick={() => cloud.setCollaborationOpen(false)} className="p-2 rounded hover:bg-white/10"><X size={18}/></button>
        </header>
        <nav aria-label="Collaboration sections" className="grid grid-cols-3 gap-1 p-2 border-b border-white/10">
          {(['presence', 'history', ...(cloud.permission === 'owner' ? ['share' as const] : [])] as Array<'presence' | 'history' | 'share'>).map(item =>
            <button key={item} onClick={() => setTab(item)} className={`rounded px-2 py-2 text-xs capitalize ${tab === item ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/5'}`}>{item}</button>)}
        </nav>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'presence' && <div className="space-y-3">
            <h3 className="text-xs uppercase text-muted-foreground flex gap-2"><Users size={14}/> Active recently</h3>
            {(presence.data || []).map(item => {
              const state = item.state as typeof presenceState;
              return <div key={`${item.userId}-${item.clientId}`} className="flex gap-3 rounded-lg bg-black/20 border border-white/5 p-3">
                {state.avatarUrl ? <img src={state.avatarUrl} alt="" className="w-8 h-8 rounded-full"/> : <span className="w-8 h-8 rounded-full bg-primary/30"/>}
                <div className="min-w-0"><div className="text-sm truncate">{state.displayName || 'Collaborator'}</div><div className="text-[10px] text-muted-foreground capitalize">{state.permission || 'member'} · {state.mode || 'editor'} · {state.selectionCount || 0} selected</div></div>
              </div>;
            })}
            {!presence.isLoading && !presence.data?.length && <p className="text-sm text-muted-foreground">No active collaborators reported.</p>}
          </div>}
          {tab === 'history' && <div className="space-y-3">
            {!cloud.isReadOnly && <form className="flex gap-2" onSubmit={async event => {
              event.preventDefault();
              setHistoryError('');
              try {
                await cloud.checkpoint(label);
                setLabel('');
                versions.refetch();
              } catch (error) {
                setHistoryError(error instanceof Error ? error.message : 'Could not create the checkpoint. Try again.');
              }
            }}>
              <input aria-label="Checkpoint label" maxLength={120} value={label} onChange={event => setLabel(event.target.value)} placeholder="Checkpoint label" className="min-w-0 flex-1 bg-black/30 border border-white/10 rounded px-3 text-sm"/>
              <button className="bg-primary px-3 py-2 rounded text-xs">Save checkpoint</button>
            </form>}
            {historyError && <p role="alert" className="text-xs text-destructive">{historyError}</p>}
            {(versions.data || []).map(version => <article key={version.id} className="rounded-lg border border-white/10 p-3">
              <div className="flex justify-between gap-2"><strong className="text-sm">{version.label || `Revision ${version.revision}`}</strong><time className="text-[10px] text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</time></div>
               <p className="text-[10px] text-muted-foreground mt-1">Author {version.createdBy === user?.id ? 'You' : version.createdBy} · {summary(version.document)}</p>
              {!cloud.isReadOnly && <button className="mt-2 text-xs text-primary" onClick={() => {
                if (!confirm('Restore this checkpoint? Current unsaved edits will be discarded.')) return;
                restore.mutate({ projectId, versionId: version.id, data: { expectedRevision: cloud.revision || 0 } }, { onSuccess: project => { cloud.hydrateProject(project); versions.refetch(); } });
              }}><History size={12} className="inline mr-1"/>Restore</button>}
            </article>)}
          </div>}
          {tab === 'share' && cloud.permission === 'owner' && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Permission<select value={permission} onChange={e => setPermission(e.target.value as 'view'|'edit')} className="mt-1 w-full bg-black/30 border border-white/10 rounded p-2 text-foreground"><option value="view">View only</option><option value="edit">Can edit</option></select></label>
              <label className="text-xs text-muted-foreground">Expires<select value={duration} onChange={e => setDuration(Number(e.target.value))} className="mt-1 w-full bg-black/30 border border-white/10 rounded p-2 text-foreground"><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
            </div>
            <button onClick={makeShare} className="w-full bg-primary rounded p-2 text-sm"><Link2 size={14} className="inline mr-2"/>Create share link</button>
            {createdUrl && <div role="status" className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-2">
              <p className="text-emerald-200">Link created — copy it now, it is shown only once.</p>
              <input aria-label="New share link URL" readOnly value={createdUrl} onFocus={event => event.currentTarget.select()} className="w-full bg-black/40 border border-emerald-500/30 rounded px-2 py-1.5 font-mono text-[10px] text-emerald-100"/>
              <button aria-label="Copy new share link" className="text-emerald-300" onClick={() => navigator.clipboard.writeText(createdUrl)}><Copy size={12} className="inline mr-1"/>Copy link</button>
            </div>}
            {(shares.data || []).map(link => <div key={link.id} className="rounded border border-white/10 p-3 text-xs flex justify-between gap-2"><span className="capitalize">{link.permission} · expires {new Date(link.expiresAt).toLocaleDateString()} · {link.revokedAt ? 'revoked' : 'active'}</span>{!link.revokedAt && <button className="text-destructive" onClick={() => { if (confirm('Revoke this share link?')) revoke.mutate({ projectId, shareLinkId: link.id }, { onSuccess: () => shares.refetch() }); }}>Revoke</button>}</div>)}
          </div>}
        </div>
      </aside>
    </div>
  );
}