import { FileCode2, Folder, Network } from 'lucide-react';
import { useMemo } from 'react';
import type { ProjectNode } from '../domain/models';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';
import { Inspector } from './Inspector';
import { WorkspaceTabs } from './WorkspaceTabs';

const FOUNDATION_ROW_BUDGET = 1500;

function safeStructureRows(nodes: ProjectNode[], selectedId: string | null): { rows: ProjectNode[]; limited: boolean } {
  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path));
  if (sorted.length <= FOUNDATION_ROW_BUDGET) return { rows: sorted, limited: false };

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keep = new Map<string, ProjectNode>();
  for (const node of sorted) {
    if (node.depth <= 1) keep.set(node.id, node);
    if (keep.size >= FOUNDATION_ROW_BUDGET) break;
  }

  let selected = selectedId ? byId.get(selectedId) : undefined;
  while (selected) {
    keep.set(selected.id, selected);
    selected = selected.parentId ? byId.get(selected.parentId) : undefined;
  }
  if (selectedId) {
    for (const child of sorted) {
      if (child.parentId === selectedId) keep.set(child.id, child);
      if (keep.size >= FOUNDATION_ROW_BUDGET) break;
    }
  }

  return { rows: [...keep.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, FOUNDATION_ROW_BUDGET), limited: true };
}

export function StructurePage() {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const selectNode = useAppStore((s) => s.selectNode);
  const result = useMemo(() => project ? safeStructureRows(project.nodes, selectedId) : { rows: [], limited: false }, [project, selectedId]);
  if (!project) return null;

  return <main className="workspace">
    <section className="workspace-main">
      <WorkspaceTabs/>
      {result.limited && <div className="structure-limit">Large index: this foundation renders a safe structural subset instead of creating tens of thousands of DOM rows. Search and selection context remain available; Milestone 2 must add a virtualized/expandable full explorer.</div>}
      <div className="structure-view"><div className="structure-header"><span>Name</span><span>Lines</span><span>Size</span></div>{result.rows.map((node) => {
        const Icon = node.kind === 'project' ? Network : node.kind === 'directory' ? Folder : FileCode2;
        return <button key={node.id} className={node.id === selectedId ? 'selected' : ''} onClick={() => selectNode(node.id)}><span className="structure-name" style={{ paddingLeft: `${Math.min(node.depth, 12) * 18}px` }}><Icon size={14}/>{node.name}</span><span>{node.loc ? node.loc.toLocaleString() : '—'}</span><span>{node.sizeBytes ? compactBytes(node.sizeBytes) : '—'}</span></button>;
      })}</div>
    </section>
    <Inspector/>
  </main>;
}
