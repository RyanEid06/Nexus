import { BarChart3, Box, Files, HardDrive, Layers3, Network, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { compactBytes } from '../utils/fileTypes';
import { WorkspaceTabs } from './WorkspaceTabs';

export function AnalyticsPage() {
  const project = useAppStore((s) => s.project);
  if (!project) return null;
  const m = project.metrics;
  const deps = project.dependencies;

  const largestFiles = project.nodes
    .filter((node) => node.kind === 'file')
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 8);

  const largestFolders = project.nodes
    .filter((node) => node.kind === 'directory')
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 8);

  // Compute most depended-upon internal modules
  const inDegreeMap = new Map<string, number>();
  if (deps?.edges) {
    for (const edge of deps.edges) {
      const target = edge.targetResolvedPath ?? (!edge.isExternal && edge.isResolved ? edge.targetPath : undefined);
      if (target) {
        inDegreeMap.set(target, (inDegreeMap.get(target) ?? 0) + 1);
      }
    }
  }
  const topImportedModules = Array.from(inDegreeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <main className="project-page">
      <WorkspaceTabs />
      <div className="page analytics-page">
        <div className="page-title">
          <div>
            <p>PROJECT OVERVIEW</p>
            <h1>Project Insights</h1>
            <span>Deterministic metrics for the indexed portion of {project.name}.</span>
          </div>
        </div>

        <section className="metric-cards">
          <article>
            <Files />
            <b>{m.files.toLocaleString()}</b>
            <span>Indexed files</span>
          </article>
          <article>
            <HardDrive />
            <b>{compactBytes(m.indexedBytes)}</b>
            <span>Indexed file size</span>
          </article>
          <article>
            <BarChart3 />
            <b>{m.totalLoc.toLocaleString()}</b>
            <span>Physical analyzed lines</span>
          </article>
          <article>
            <Layers3 />
            <b>{compactBytes(m.analyzedTextBytes)}</b>
            <span>Text actually analyzed</span>
          </article>
        </section>

        {deps && (
          <section className="metric-cards">
            <article>
              <Network />
              <b>{(m.dependencyEdges ?? deps.edges.length).toLocaleString()}</b>
              <span>Parsed dependency edges</span>
            </article>
            <article>
              <Box />
              <b>{deps.externalPackages.length.toLocaleString()}</b>
              <span>External packages</span>
            </article>
            <article>
              <RefreshCw />
              <b>{(deps.circularCycles ?? deps.circularDependencies ?? []).length.toLocaleString()}</b>
              <span>Circular dependency cycles</span>
            </article>
            <article>
              <button
                className="action-btn"
                style={{ gridColumn: '1 / -1', justifyContent: 'center', height: '100%', padding: '12px' }}
                onClick={() => useAppStore.getState().setPage('dependencies')}
              >
                Open Dependencies Explorer →
              </button>
            </article>
          </section>
        )}

        <section className="analytics-grid">
          <article className="panel">
            <h2>Language Distribution</h2>
            <div className="language-bars">
              {m.languages.length ? (
                m.languages.map((lang) => (
                  <div key={lang.language}>
                    <label>
                      <b>{lang.language}</b>
                      <span>{lang.percentage.toFixed(1)}%</span>
                    </label>
                    <i>
                      <em style={{ width: `${lang.percentage}%` }} />
                    </i>
                  </div>
                ))
              ) : (
                <p className="muted">No analyzed language data yet.</p>
              )}
            </div>
          </article>

          <article className="panel">
            <h2>Analysis Summary</h2>
            <ul className="clean-list">
              <li>{m.analyzedFiles.toLocaleString()} files had text contents analyzed.</li>
              <li>{m.metadataOnlyFiles.toLocaleString()} files are metadata-only.</li>
              <li>{m.skippedLargeFiles.toLocaleString()} text files exceeded the read-size limit.</li>
              <li>{m.skippedSensitiveFiles.toLocaleString()} sensitive files were deliberately not read.</li>
              <li>{project.warnings.length.toLocaleString()} recoverable scan warnings.</li>
            </ul>
          </article>
        </section>

        <section className="analytics-grid analytics-lists">
          <article className="panel">
            <h2>Largest Indexed Files</h2>
            <div className="ranked-list">
              {largestFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => {
                    useAppStore.getState().selectNode(file.id);
                    useAppStore.getState().setPage('structure');
                  }}
                >
                  <span>{file.path}</span>
                  <b>{compactBytes(file.sizeBytes)}</b>
                </button>
              ))}
            </div>
          </article>

          <article className="panel">
            <h2>{topImportedModules.length > 0 ? 'Most Depended-Upon Modules' : 'Largest Indexed Folders'}</h2>
            <div className="ranked-list">
              {topImportedModules.length > 0
                ? topImportedModules.map(([path, count]) => {
                    const node = project.nodes.find((n) => n.path === path);
                    return (
                      <button
                        key={path}
                        onClick={() => {
                          if (node) useAppStore.getState().selectNode(node.id);
                          useAppStore.getState().setPage('dependencies');
                        }}
                      >
                        <span>{path}</span>
                        <b>{count} importer{count !== 1 ? 's' : ''}</b>
                      </button>
                    );
                  })
                : largestFolders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        useAppStore.getState().selectNode(folder.id);
                        useAppStore.getState().setPage('structure');
                      }}
                    >
                      <span>{folder.path}</span>
                      <b>{compactBytes(folder.sizeBytes)}</b>
                    </button>
                  ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

