import React, { useState, useEffect } from 'react';
import { useEditorStore, editorStore, deleteSelection, duplicateSelection, groupSelection, ungroupSelection, undo, redo } from '../store/editor';
import Workspace from '../components/editor/Workspace';
import EmbroideryWorkspace from '../components/editor/EmbroideryWorkspace';
import PreviewWorkspace from '../components/editor/PreviewWorkspace';
import Toolbar from '../components/editor/Toolbar';
import TopBar from '../components/editor/TopBar';
import RightSidebar from '../components/editor/RightSidebar';
import { Command } from 'lucide-react';
import { useCloudProject } from '../cloud/CloudProjectProvider';
import CollaborationDrawer from '../components/editor/CollaborationDrawer';
import TextConvertDialog from '../components/editor/TextConvertDialog';
import { getClipboardImageFile, IMAGE_PASTE_EVENT } from '../lib/imageImport';

export default function Editor() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { selection, workspaceMode } = useEditorStore();
  const { isReadOnly, saveNow, status, message } = useCloudProject();

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isReadOnly || status === 'conflict' || workspaceMode === 'embroidery' || workspaceMode === 'preview') return;
      const activeElement = document.activeElement as HTMLElement | null;
      const target = e.target as HTMLElement | null;
      const isEditable = [activeElement, target].some(element =>
        element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.isContentEditable,
      );
      if (isEditable) return;
      const file = getClipboardImageFile(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent<File>(IMAGE_PASTE_EVENT, { detail: file, cancelable: true }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isReadOnly) void saveNow();
        return;
      }
      if (status === 'conflict') return;
      if (workspaceMode === 'embroidery' || workspaceMode === 'preview') return;
      // Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
      
      // Delete selection
      if (!isReadOnly && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          deleteSelection();
        }
      }
      if (!isReadOnly && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
      }
      if (!isReadOnly && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (!isReadOnly && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        editorStore.set({ selection: [] });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [selection, workspaceMode, isReadOnly, saveNow, status]);

  // A file dropped outside a drop zone would otherwise navigate the browser
  // away from the editor. Swallow stray drops; inner drop zones handle theirs.
  useEffect(() => {
    const preventStray = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', preventStray);
    window.addEventListener('drop', preventStray);
    return () => {
      window.removeEventListener('dragover', preventStray);
      window.removeEventListener('drop', preventStray);
    };
  }, []);

  const commands = (isReadOnly ? [
    { label: 'Clear selection', shortcut: 'Esc', action: () => editorStore.set({ selection: [] }) },
  ] : [
    { label: 'Undo last change', shortcut: '⌘ Z', action: undo },
    { label: 'Redo last change', shortcut: '⇧ ⌘ Z', action: redo },
    { label: 'Duplicate selection', shortcut: '⌘ D', action: duplicateSelection },
    { label: 'Group selection', shortcut: '⌘ G', action: groupSelection },
    { label: 'Ungroup selection', shortcut: '⇧ ⌘ G', action: ungroupSelection },
    { label: 'Clear selection', shortcut: 'Esc', action: () => editorStore.set({ selection: [] }) },
  ]);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-background text-foreground select-none flex flex-col">
      <TopBar />
      <div className="flex-1 relative w-full h-full">
        {workspaceMode === 'embroidery' ? <EmbroideryWorkspace /> : workspaceMode === 'preview' ? <PreviewWorkspace /> : <Workspace />}
        {workspaceMode === 'design' && !isReadOnly && <Toolbar />}
        <div className={isReadOnly ? 'pointer-events-none' : ''}><RightSidebar /></div>
      </div>
      {status === 'read-only' && <div className="fixed left-4 bottom-4 z-50 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300">Read-only viewer</div>}
      {status === 'conflict' && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3"><div role="alertdialog" aria-modal="true" aria-label="Save conflict" className="w-full max-w-2xl rounded-xl border border-red-500/40 bg-card p-4 shadow-2xl"><strong className="text-red-300">Cloud save conflict</strong><p className="my-2 text-xs text-muted-foreground">{message}</p><div className="flex flex-wrap gap-2"><ConflictActions /></div></div></div>}
      <CollaborationDrawer />
      <TextConvertDialog />
      
      {cmdOpen && (
         <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh]" onPointerDown={() => setCmdOpen(false)}>
           <div className="bg-card w-[440px] max-w-[90vw] rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" onPointerDown={e => e.stopPropagation()}>
             <div className="flex items-center px-4 py-3 border-b border-white/10">
               <Command className="text-muted-foreground mr-3" size={18} />
               <input 
                 autoFocus
                 type="text" 
                 placeholder="Type a command or search..." 
                 className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
                 onKeyDown={(e) => {
                   if (e.key === 'Escape') setCmdOpen(false);
                 }}
               />
             </div>
             <div className="p-2 space-y-1">
                <div className="px-3 py-1.5 text-xs text-muted-foreground font-semibold">Editor commands</div>
                {commands.map(command => (
                  <button key={command.label} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 focus:bg-white/5 focus:outline-none rounded-md transition-colors" onClick={() => { command.action(); setCmdOpen(false); }}>
                    <span>{command.label}</span><span className="text-[10px] text-muted-foreground font-mono">{command.shortcut}</span>
                  </button>
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConflictActions() {
  const cloud = useCloudProject();
  return <><button autoFocus onClick={() => { if (confirm('Discard all local edits and reload the latest cloud version?')) void cloud.reloadRemote(); }} className="rounded bg-red-500/20 px-3 py-2 text-xs text-red-200">Reload latest</button><button onClick={() => void cloud.createCopy()} className="rounded bg-primary px-3 py-2 text-xs">Create cloud copy</button></>;
}
