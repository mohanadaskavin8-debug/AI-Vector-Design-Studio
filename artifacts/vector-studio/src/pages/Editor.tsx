import React, { useState, useEffect } from 'react';
import { useEditorStore, editorStore } from '../../store/editor';
import Workspace from './Workspace';
import Toolbar from './Toolbar';
import TopBar from './TopBar';
import RightSidebar from './RightSidebar';
import { Command } from 'lucide-react';

export default function Editor() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { objects, selection } = useEditorStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
      
      // Delete selection
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          if (selection.length > 0) {
             const newObjs = objects.filter(o => !selection.includes(o.id));
             editorStore.set({ objects: newObjs, selection: [] });
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [objects, selection]);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-background text-foreground select-none flex flex-col">
      <TopBar />
      <div className="flex-1 relative w-full h-full">
        <Workspace />
        <Toolbar />
        <RightSidebar />
      </div>
      
      {/* Simple Command Palette Mock */}
      {cmdOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh]">
          <div className="bg-card w-[400px] max-w-[90vw] rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
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
               <div className="px-3 py-1.5 text-xs text-muted-foreground font-semibold">Actions</div>
               <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 rounded-md" onClick={() => setCmdOpen(false)}>Export SVG</button>
               <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 rounded-md" onClick={() => setCmdOpen(false)}>Toggle Embroidery Mode</button>
               <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 rounded-md" onClick={() => setCmdOpen(false)}>Clear Canvas</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
