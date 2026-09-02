import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import {
  useListProjects,
  getListProjectsQueryKey,
  useCreateProject,
  useDeleteProject,
  useArchiveProject,
  useDuplicateProject,
  useUpdateProject,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  FolderPlus, Plus, Search, MoreVertical, LayoutGrid, List as ListIcon, 
  Clock, Trash2, Copy, Edit2, Archive, ArchiveRestore, FolderOpen, PenTool
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserNav } from '@/components/UserNav';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { createBlankCloudDocument } from '@/cloud/cloudDocument';
import { resolvePrivateObjectUrl } from '@/cloud/assets';

export default function Projects() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [renamingProject, setRenamingProject] = useState<{id: string, name: string, revision: number} | null>(null);
  const [newName, setNewName] = useState('');

  const { data: projects, isLoading } = useListProjects(
    { archived: activeTab === 'archived' }
  );

  const createProject = useCreateProject();
  const archiveProject = useArchiveProject();
  const duplicateProject = useDuplicateProject();
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();

  const handleCreate = () => {
    createProject.mutate({
      data: {
        name: 'Untitled Project',
        schemaVersion: 1,
        document: createBlankCloudDocument()
      }
    }, {
      onSuccess: (project) => {
        setLocation(`/editor/${project.id}`);
      },
      onError: () => {
        toast.error('Failed to create project');
      }
    });
  };

  const handleArchive = (id: string, archive: boolean) => {
    archiveProject.mutate({
      projectId: id,
      data: { archived: archive }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ archived: true }) });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ archived: false }) });
        toast.success(archive ? 'Project archived' : 'Project restored');
      },
      onError: () => {
        toast.error('Action failed');
      }
    });
  };

  const handleDuplicate = (id: string, name: string) => {
    duplicateProject.mutate({
      projectId: id,
      data: { name: `${name} (Copy)` }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ archived: false }) });
        toast.success('Project duplicated');
      },
      onError: () => {
        toast.error('Failed to duplicate');
      }
    });
  };

  const handleRename = () => {
    if (!renamingProject || !newName.trim()) return;
    updateProject.mutate({
      projectId: renamingProject.id,
      data: { name: newName.trim(), expectedRevision: renamingProject.revision }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ archived: false }) });
        toast.success('Project renamed');
        setRenamingProject(null);
      },
      onError: () => {
        toast.error('Failed to rename project. It may have been modified by someone else.');
      }
    });
  };

  const handleDelete = (id: string) => {
    deleteProject.mutate({ projectId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({ archived: true }) });
        toast.success('Project deleted permanently');
      },
      onError: () => {
        toast.error('Failed to delete');
      }
    });
  };

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!search) return projects;
    const lowerSearch = search.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(lowerSearch));
  }, [projects, search]);

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      <header className="h-16 px-6 border-b border-border/40 bg-background flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Vector Studio" className="w-6 h-6" />
          <span className="font-semibold tracking-tight">Vector Studio</span>
        </div>
        <div className="flex flex-1 max-w-md mx-6">
          <div className="relative w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-ring transition-all"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={handleCreate} disabled={createProject.isPending} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
          <UserNav />
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-[300px]">
            <TabsList>
              <TabsTrigger value="active" className="flex-1">Active</TabsTrigger>
              <TabsTrigger value="archived" className="flex-1">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex items-center gap-2 border border-border/50 rounded-md p-1 bg-background">
            <Button
              variant="ghost"
              size="icon"
              className={`w-8 h-8 rounded-sm ${view === 'grid' ? 'bg-muted shadow-sm' : ''}`}
              onClick={() => setView('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`w-8 h-8 rounded-sm ${view === 'list' ? 'bg-muted shadow-sm' : ''}`}
              onClick={() => setView('list')}
            >
              <ListIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className={`grid gap-6 ${view === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className={`rounded-xl ${view === 'grid' ? 'h-64' : 'h-20'}`} />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
              {activeTab === 'archived' ? <Archive className="w-8 h-8" /> : <FolderOpen className="w-8 h-8" />}
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {search ? 'No projects found' : activeTab === 'archived' ? 'No archived projects' : 'No projects yet'}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              {search 
                ? 'Try adjusting your search terms.' 
                : activeTab === 'archived' 
                  ? 'Archived projects will appear here.' 
                  : 'Create your first project to start designing.'}
            </p>
            {activeTab === 'active' && !search && (
              <Button onClick={handleCreate} disabled={createProject.isPending}>
                <Plus className="w-4 h-4 mr-2" /> Create Project
              </Button>
            )}
          </div>
        ) : (
          <div className={`grid gap-6 ${view === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
            {filteredProjects.map(project => (
              <div
                key={project.id}
                className={`group relative bg-card border border-border/40 rounded-xl overflow-hidden hover:shadow-md transition-all hover:border-primary/30 flex ${view === 'grid' ? 'flex-col h-64' : 'flex-row items-center h-20 px-4'}`}
              >
                {view === 'grid' && (
                  <div 
                    className="flex-1 bg-muted/30 cursor-pointer overflow-hidden relative border-b border-border/20"
                    onClick={() => setLocation(`/editor/${project.id}`)}
                  >
                    {project.thumbnailObjectPath ? (
                      <img src={resolvePrivateObjectUrl(project.thumbnailObjectPath)} alt={project.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <FolderOpen className="w-12 h-12" />
                      </div>
                    )}
                  </div>
                )}
                
                <div className={`p-4 flex items-center justify-between ${view === 'grid' ? 'h-20' : 'flex-1'}`}>
                  <div 
                    className="flex flex-col overflow-hidden cursor-pointer flex-1"
                    onClick={() => setLocation(`/editor/${project.id}`)}
                  >
                    <h4 className="font-medium truncate pr-4 group-hover:text-primary transition-colors">{project.name}</h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span>
                      {project.permission !== 'owner' && (
                        <span className="bg-secondary px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold tracking-wider">
                          {project.permission}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setLocation(`/editor/${project.id}`)}>
                        <Edit2 className="w-4 h-4 mr-2" /> Open
                      </DropdownMenuItem>
                      {activeTab === 'active' && (
                        <>
                          <DropdownMenuItem onClick={() => {
                            setRenamingProject({ id: project.id, name: project.name, revision: project.revision });
                            setNewName(project.name);
                          }}>
                            <PenTool className="w-4 h-4 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(project.id, project.name)}>
                            <Copy className="w-4 h-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      {activeTab === 'active' ? (
                        <DropdownMenuItem onClick={() => handleArchive(project.id, true)}>
                          <Archive className="w-4 h-4 mr-2" /> Archive
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem onClick={() => handleArchive(project.id, false)}>
                            <ArchiveRestore className="w-4 h-4 mr-2" /> Restore
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(project.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!renamingProject} onOpenChange={(open) => !open && setRenamingProject(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project Name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingProject(null)} disabled={updateProject.isPending}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim() || updateProject.isPending}>
              {updateProject.isPending ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}