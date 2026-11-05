import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

function rank(name: string, path: string, query: string): number {
  const n = name.toLowerCase();
  const p = path.toLowerCase();
  if (n === query) return 0;
  if (n.startsWith(query)) return 1;
  if (n.includes(query)) return 2;
  if (p.includes(query)) return 3;
  return 99;
}

export function SearchPage() {
  const [q, setQ] = useState('');
  const project = useAppStore((s) => s.project);
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!project || !query) return [];
    return project.nodes
      .map((node) => ({ node, score: rank(node.name, node.path, query) }))
      .filter((item) => item.score < 99)
      .sort((a, b) => a.score - b.score || a.node.path.localeCompare(b.node.path))
      .slice(0, 50)
      .map((item) => item.node);
  }, [project, query]);

  if (!project) return null;
  return <main className="page"><div className="page-title"><div><p>SEARCH</p><h1>Find anything</h1><span>Search indexed file names, folder names, and relative paths.</span></div></div><div className="big-search"><Search/><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files, folders, or paths…"/></div>{!query ? <section className="panel empty-state"><h2>Search your project</h2><p>Type a filename, folder, or path. NEXUS searches the local index only.</p></section> : <section className="panel search-results">{results.map((node) => <button key={node.id} onClick={() => { useAppStore.getState().selectNode(node.id); useAppStore.getState().setPage('graph'); }}><b>{node.name}</b><span>{node.path}</span><small>{node.kind}</small></button>)}{results.length === 0 && <div className="empty-result">No indexed paths match “{q}”.</div>}</section>}</main>;
}
