import { FileCode2, Folder, FolderOpen, Network } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';

export function Inspector() {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  if (!project) return <aside className="inspector" />;
  const node = project.nodes.find((item) => item.id === selectedId) ?? project.nodes[0];
  const children = project.nodes.filter((item) => item.parentId === node?.id);
  if (!node) return <aside className="inspector" />;
  const Icon = node.kind === 'project' ? Network : node.kind === 'directory' ? FolderOpen : FileCode2;
  const fileCount = node.kind === 'file' ? 1 : node.descendantFiles ?? 0;
  return <aside className="inspector">
    <div className="inspector-title"><span className="icon-box"><Icon size={20}/></span><div><h2>{node.name}</h2><p>{node.kind}</p></div></div>
    <dl className="details">
      <div><dt>Path</dt><dd>{node.path}</dd></div>
      <div><dt>Files</dt><dd>{fileCount.toLocaleString()}</dd></div>
      {node.kind !== 'file' && <div><dt>Folders</dt><dd>{(node.descendantFolders ?? 0).toLocaleString()}</dd></div>}
      <div><dt>Direct children</dt><dd>{children.length.toLocaleString()}</dd></div>
      <div><dt>Lines</dt><dd>{node.loc.toLocaleString()}</dd></div>
      <div><dt>Indexed size</dt><dd>{compactBytes(node.sizeBytes)}</dd></div>
      {node.language && <div><dt>Language</dt><dd>{node.language}</dd></div>}
      {node.analysisStatus && <div><dt>Content</dt><dd>{node.analysisStatus.replaceAll('-', ' ')}</dd></div>}
    </dl>
    <h3>Direct child items</h3>
    <div className="child-list">{children.slice(0, 12).map((child) => <button key={child.id} onClick={() => useAppStore.getState().selectNode(child.id)}>{child.kind === 'directory' ? <Folder size={15}/> : <FileCode2 size={15}/>}<span>{child.name}</span><small>{child.loc ? `${child.loc.toLocaleString()} lines` : ''}</small></button>)}{!children.length && <p className="muted">No child items.</p>}{children.length > 12 && <p className="muted">{children.length - 12} more direct children. Use Structure or Search to inspect them.</p>}</div>
  </aside>;
}
