import { ChevronLeft, ChevronRight, FileCode2, Folder, FolderOpen, Network } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';

export function Inspector() {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const isCollapsed = useAppStore((s) => s.isInspectorCollapsed);
  const toggleInspector = useAppStore((s) => s.toggleInspector);
  const setPage = useAppStore((s) => s.setPage);

  if (!project) {
    return <aside className="inspector" />;
  }

  const node = project.nodes.find((item) => item.id === selectedId) ?? project.nodes[0];
  if (!node) {
    return <aside className="inspector" />;
  }

  // Collapsed ribbon: returns space to the Map while preserving selection
  if (isCollapsed) {
    return (
      <aside className="inspector-collapsed-ribbon" aria-label="Inspector collapsed">
        <button
          className="inspector-toggle-btn"
          onClick={toggleInspector}
          title="Expand inspector panel"
          aria-label="Expand inspector panel"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="collapsed-inspector-label">Inspector</span>
      </aside>
    );
  }

  const children = project.nodes.filter((item) => item.parentId === node.id);
  const Icon = node.kind === 'project' ? Network : node.kind === 'directory' ? FolderOpen : FileCode2;
  const fileCount = node.kind === 'file' ? 1 : node.descendantFiles ?? 0;

  // Compute dependency info for file
  const outgoingCount =
    node.kind === 'file' && project.dependencies
      ? project.dependencies.edges.filter((e) => e.sourcePath === node.path).length
      : 0;
  const incomingCount =
    node.kind === 'file' && project.dependencies
      ? project.dependencies.edges.filter(
          (e) => e.targetResolvedPath === node.path || (!e.isExternal && e.isResolved && e.targetPath === node.path)
        ).length
      : 0;

  return (
    <aside className="inspector" aria-label="Node inspector">
      <div className="inspector-header-row">
        <div className="inspector-title">
          <span className="icon-box">
            <Icon size={20} />
          </span>
          <div>
            <h2>{node.name}</h2>
            <p>{node.kind}</p>
          </div>
        </div>

        <button
          className="inspector-collapse-btn"
          onClick={toggleInspector}
          title="Collapse inspector panel"
          aria-label="Collapse inspector panel"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <dl className="details">
        <div>
          <dt>Path</dt>
          <dd>{node.path || '(root)'}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{fileCount.toLocaleString()}</dd>
        </div>
        {node.kind !== 'file' && (
          <div>
            <dt>Folders</dt>
            <dd>{(node.descendantFolders ?? 0).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>Direct children</dt>
          <dd>{children.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{node.loc.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Indexed size</dt>
          <dd>{compactBytes(node.sizeBytes)}</dd>
        </div>
        {node.language && (
          <div>
            <dt>Language</dt>
            <dd>{node.language}</dd>
          </div>
        )}
        {node.analysisStatus && (
          <div>
            <dt>Content</dt>
            <dd>{node.analysisStatus.replaceAll('-', ' ')}</dd>
          </div>
        )}
        {node.kind === 'file' && project.dependencies && (
          <>
            <div>
              <dt>Imports</dt>
              <dd>{outgoingCount.toLocaleString()} modules</dd>
            </div>
            <div>
              <dt>Imported by</dt>
              <dd>{incomingCount.toLocaleString()} files</dd>
            </div>
          </>
        )}
      </dl>

      {node.kind === 'file' && (
        <div className="inspector-actions">
          <button
            className="action-btn primary"
            style={{ width: '100%', marginTop: '12px', justifyContent: 'center' }}
            onClick={() => useAppStore.getState().openFileViewer(node.id)}
          >
            <FileCode2 size={15} /> Open File Preview
          </button>
          {(outgoingCount > 0 || incomingCount > 0) && (
            <button
              className="action-btn"
              style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}
              onClick={() => setPage('dependencies')}
            >
              View in Dependencies Explorer →
            </button>
          )}
        </div>
      )}

      <h3>Direct child items ({children.length})</h3>
      <div className="child-list">
        {/* Short preview of at most 8 items to prevent panel domination (Section 15) */}
        {children.slice(0, 8).map((child) => (
          <button
            key={child.id}
            onClick={() => useAppStore.getState().selectNode(child.id)}
            onDoubleClick={() => {
              if (child.kind === 'file') useAppStore.getState().openFileViewer(child.id);
              else useAppStore.getState().drillDownNode(child.id);
            }}
            title={child.kind === 'file' ? 'Click to select · Double-click to open' : 'Click to select · Double-click to explore'}
          >
            {child.kind === 'directory' ? <Folder size={15} /> : <FileCode2 size={15} />}
            <span>{child.name}</span>
            <small>{child.loc ? `${child.loc.toLocaleString()} lines` : ''}</small>
          </button>
        ))}
        {!children.length && <p className="muted">No child items.</p>}
        {children.length > 8 && (
          <button
            className="view-all-children-btn"
            onClick={() => {
              useAppStore.getState().selectNode(node.id);
              useAppStore.getState().expandNode(node.id);
              setPage('structure');
            }}
          >
            View all {children.length.toLocaleString()} children in Structure →
          </button>
        )}
      </div>
    </aside>
  );
}
