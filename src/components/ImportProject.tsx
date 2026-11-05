import { useRef, useState } from 'react';
import { Check, FolderOpen, HardDrive, ShieldCheck, X } from 'lucide-react';
import type { AnalysisCategory } from '../domain/models';
import { pickLocalProjectDirectory, scanDirectoryHandle, type LocalDirectoryHandle, type ScanProgress } from '../services/projectScanner';
import { findProjectIdForHandle, loadPreferences, loadProject, saveProject } from '../storage/db';
import { useAppStore } from '../store/useAppStore';

const categories: Array<[AnalysisCategory, string]> = [
  ['source', 'Source code'],
  ['configuration', 'Configuration'],
  ['documentation', 'Documentation'],
  ['test', 'Tests'],
];

export function ImportProject({ onClose }: { onClose: () => void }) {
  const setProject = useAppStore((s) => s.setProject);
  const [folder, setFolder] = useState<LocalDirectoryHandle | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<AnalysisCategory>>(new Set(categories.map(([key]) => key)));
  const abortRef = useRef<AbortController | null>(null);

  async function choose() {
    try {
      setError('');
      setProgress(null);
      setFolder(await pickLocalProjectDirectory());
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    }
  }

  function toggleCategory(category: AnalysisCategory) {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  }

  async function analyze() {
    if (!folder) return;
    setBusy(true);
    setError('');
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const [preferences, existingId] = await Promise.all([loadPreferences(), findProjectIdForHandle(folder)]);
      const existing = existingId ? await loadProject(existingId) : undefined;
      const project = await scanDirectoryHandle(folder, {
        projectId: existing?.id,
        createdAt: existing?.createdAt,
        maxTextFileBytes: preferences.maxTextFileBytes,
        maxEntries: preferences.maxEntries,
        analyzeCategories: selectedCategories,
        signal: controller.signal,
        onProgress: setProgress,
      });
      await saveProject(project, folder);
      setProject(project);
      onClose();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function cancel() {
    if (busy) {
      abortRef.current?.abort();
      return;
    }
    onClose();
  }

  return <div className="modal-backdrop"><section className="import-card" role="dialog" aria-modal="true" aria-label="Configure project analysis">
    <button className="modal-close" onClick={cancel} aria-label={busy ? 'Cancel analysis' : 'Close'}><X size={16}/></button>
    <div className="steps"><span className="done"><Check size={13}/> Select Project</span><i/><span className="current">2 Analysis Rules</span><i/><span>3 Analyze</span></div>
    <h1>Configure Project Analysis</h1><p>NEXUS indexes the selected folder in place. Source contents are read only when needed for analysis and are never uploaded or stored as raw files.</p>
    <button className="folder-choice" onClick={choose} disabled={busy}><FolderOpen/><span>{folder?.name ?? 'Select a local project folder'}</span><b>{folder ? 'Change' : 'Choose'}</b></button>
    <div className="import-grid">
      <article><h3>Analyze contents of</h3>{categories.map(([key, label]) => <label key={key}><input type="checkbox" checked={selectedCategories.has(key)} onChange={() => toggleCategory(key)} disabled={busy}/><span>{label}</span></label>)}<label><input type="checkbox" checked readOnly/><span>Assets (metadata only)</span></label></article>
      <article><h3>Excluded before traversal</h3>{['node_modules/','.git/','build/','dist/','.gradle/','coverage/','known caches/vendor output'].map((item) => <label key={item}><input type="checkbox" checked readOnly/><span>{item}</span></label>)}</article>
      <article className="scan-summary"><h3>Scan Summary</h3><p><HardDrive size={17}/>Direct local access</p><p><ShieldCheck size={17}/>No source upload</p><strong>{progress ? `${progress.discovered.toLocaleString()} entries · ${progress.analyzed.toLocaleString()} analyzed` : 'Ready to scan'}</strong>{progress && <><small>{progress.currentPath}</small>{progress.warnings > 0 && <small>{progress.warnings} recoverable warning{progress.warnings === 1 ? '' : 's'}</small>}</>}</article>
    </div>
    {error && <div className="error-box">{error}</div>}
    <footer><button className="ghost" onClick={cancel}>{busy ? 'Stop analysis' : 'Cancel'}</button><button className="primary" disabled={!folder || busy} onClick={analyze}>{busy ? 'Analyzing…' : 'Analyze Project →'}</button></footer>
  </section></div>;
}
