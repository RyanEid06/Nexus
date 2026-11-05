import { useCallback, useEffect, useState } from 'react';
import { Box, FolderOpen, Plus, Trash2 } from 'lucide-react';
import type { ProjectIndex } from '../domain/models';
import { demoProject } from '../data/demoProject';
import { listProjects, loadProject, removeProject } from '../storage/db';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';
import { ImportProject } from './ImportProject';

type ProjectCard = Omit<ProjectIndex, 'nodes'>;

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

export function ProjectsPage() {
  const [importing, setImporting] = useState(false);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loadError, setLoadError] = useState('');
  const setProject = useAppStore((s) => s.setProject);

  const refresh = useCallback(async () => {
    try { setProjects(await listProjects()); setLoadError(''); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Local project indexes could not be loaded.'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function openProject(id: string) {
    const project = await loadProject(id);
    if (project) setProject(project);
  }

  async function remove(id: string) {
    await removeProject(id);
    await refresh();
  }

  return <main className="page projects-page">
    <header className="hero"><img src="/nexus-mark.svg" alt=""/><h1>NEXUS</h1><p>Visualize. Explore. Understand your code.</p><small>Turn a local software project into an interactive map without uploading the repository.</small><div><button className="primary" onClick={() => setImporting(true)}><FolderOpen size={17}/>Open Local Project</button><button className="ghost" onClick={() => setProject(demoProject)}>Open Curated Demo</button></div></header>
    <section className="feature-row"><div><Box/> <b>3D Structure</b><span>Explore repository hierarchy spatially.</span></div><div><Box/> <b>Project Insights</b><span>Files, lines, languages, and size.</span></div><div><Box/> <b>Real Dependencies</b><span>Only parsed relationships—never invented edges.</span></div></section>
    <div className="section-heading"><h2>Your Projects</h2><button className="primary small" onClick={() => setImporting(true)}><Plus size={15}/>Open Project</button></div>
    {loadError && <div className="error-box">{loadError}</div>}
    <section className="project-cards">
      {projects.map((project) => <article className="project-card" key={project.id}><button className="project-card-open" onClick={() => void openProject(project.id)}><div className="project-card-top"><span className="project-icon"><Box/></span><span className="cached-badge">Local index</span></div><h3>{project.name}</h3><p>{project.metrics.files.toLocaleString()} files · {project.metrics.totalLoc.toLocaleString()} lines · {compactBytes(project.metrics.indexedBytes)}</p><small>{relativeTime(project.updatedAt)}</small></button><button className="project-remove" title="Remove cached NEXUS index" aria-label={`Remove ${project.name} from NEXUS`} onClick={() => void remove(project.id)}><Trash2 size={14}/></button></article>)}
      <button className="new-card" onClick={() => setImporting(true)}><Plus/><b>Open a Project</b><span>Select a folder to analyze</span></button>
    </section>
    {!projects.length && <p className="empty-hint">No local projects saved yet. The curated demo is synthetic and is never mixed into your recent-project list.</p>}
    {importing && <ImportProject onClose={() => { setImporting(false); void refresh(); }} />}
  </main>;
}
