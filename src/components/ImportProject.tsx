import { useEffect, useRef, useState } from 'react';
import { Check, FolderOpen, HardDrive, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import type { AnalysisCategory } from '../domain/models';
import {
  pickLocalProjectDirectory,
  scanDirectoryHandle,
  supportsLocalDirectoryPicker,
  type LocalDirectoryHandle,
  type ScanProgress,
} from '../services/projectScanner';
import { normalizeExclusionPath } from '../services/ignoreRules';
import { findProjectIdForHandle, loadPreferences, loadProject, saveProject } from '../storage/db';
import { useAppStore } from '../store/useAppStore';

const categories: Array<[AnalysisCategory, string]> = [
  ['source', 'Source code'],
  ['configuration', 'Configuration'],
  ['documentation', 'Documentation'],
  ['test', 'Tests'],
];

export function ImportProject({
  onClose,
  initialHandle,
}: {
  onClose: () => void;
  initialHandle?: LocalDirectoryHandle;
}) {
  const setProject = useAppStore((s) => s.setProject);
  const [folder, setFolder] = useState<LocalDirectoryHandle | null>(initialHandle ?? null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<AnalysisCategory>>(
    new Set(categories.map(([key]) => key))
  );
  const [customExclusions, setCustomExclusions] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const lastPhaseRef = useRef<string>('');
  const isSupported = supportsLocalDirectoryPicker();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy]);

  async function choose() {
    if (!isSupported) {
      setError('Direct local folder access requires a Chromium-based desktop browser (Chrome, Edge, Brave, Opera, Arc).');
      return;
    }
    try {
      setError('');
      setProgress(null);
      const picked = await pickLocalProjectDirectory();
      setFolder(picked);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    }
  }

  function toggleCategory(category: AnalysisCategory) {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function addCustomExclusion() {
    const normalized = normalizeExclusionPath(customInput);
    if (!normalized) return;
    if (!customExclusions.includes(normalized)) {
      setCustomExclusions([...customExclusions, normalized]);
    }
    setCustomInput('');
  }

  function removeCustomExclusion(item: string) {
    setCustomExclusions(customExclusions.filter((x) => x !== item));
  }

  const handleProgress = (p: ScanProgress) => {
    setProgress(p);

    // Announce phase changes to screen readers politely (Section 18F)
    if (p.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = p.phase;
      if (p.phase === 'discovering') {
        setLiveAnnouncement('Phase 1: Discovering project structure.');
      } else if (p.phase === 'analyzing') {
        setLiveAnnouncement(`Phase 2: Analyzing ${p.totalFilesToProcess ?? p.totalToAnalyze ?? 0} files.`);
      } else if (p.phase === 'building-relationships') {
        setLiveAnnouncement('Phase 3: Building dependency relationships.');
      } else if (p.phase === 'finalizing') {
        setLiveAnnouncement('Phase 4: Finalizing architectural metrics.');
      } else if (p.phase === 'saving') {
        setLiveAnnouncement('Phase 5: Saving local index.');
      } else if (p.phase === 'complete') {
        setLiveAnnouncement('Phase 6: Project analysis complete.');
      }
    }
  };

  async function analyze() {
    if (!folder) return;
    setBusy(true);
    setError('');
    setProgress(null);
    lastPhaseRef.current = '';
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const [preferences, existingId] = await Promise.all([
        loadPreferences(),
        findProjectIdForHandle(folder),
      ]);
      const existing = existingId ? await loadProject(existingId) : undefined;

      const project = await scanDirectoryHandle(folder, {
        projectId: existing?.id,
        createdAt: existing?.createdAt,
        maxTextFileBytes: preferences.maxTextFileBytes,
        maxEntries: preferences.maxEntries,
        analyzeCategories: selectedCategories,
        customExclusions: customExclusions.length > 0 ? customExclusions : undefined,
        signal: controller.signal,
        onProgress: handleProgress,
        previousProject: existing,
      });

      // Saving local index only while actual persistence is running (Truthful Phase 5)
      handleProgress({
        phase: 'saving',
        discovered: project.nodes.length,
        totalFilesToProcess: project.metrics.files,
        totalToAnalyze: project.metrics.files,
        processedFiles: project.metrics.files,
        analyzed: project.metrics.analyzedFiles,
        reused: 0,
        warnings: project.warnings.length,
        currentPath: 'Saving local index…',
        percentage: undefined,
      });

      await saveProject(project, folder);

      handleProgress({
        phase: 'complete',
        discovered: project.nodes.length,
        totalFilesToProcess: project.metrics.files,
        totalToAnalyze: project.metrics.files,
        processedFiles: project.metrics.files,
        analyzed: project.metrics.analyzedFiles,
        reused: 0,
        warnings: project.warnings.length,
        currentPath: 'Project index saved.',
        percentage: 100,
      });

      setLiveAnnouncement('Project analysis complete.');
      setProject(project);
      onClose();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        setError(msg);
        setLiveAnnouncement(`Analysis failed: ${msg}`);
      } else {
        setLiveAnnouncement('Project analysis was canceled.');
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function cancel() {
    if (busy) {
      abortRef.current?.abort();
      setLiveAnnouncement('Stopping analysis...');
      return;
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !busy) cancel(); }}>
      <section
        className="import-card"
        role="dialog"
        aria-modal="true"
        aria-label="Configure project analysis"
      >
        <button
          className="modal-close"
          onClick={cancel}
          aria-label={busy ? 'Cancel analysis' : 'Close modal'}
          title={busy ? 'Stop analysis' : 'Close modal'}
        >
          <X size={16} />
        </button>

        <div className="steps" role="navigation" aria-label="Import progress">
          {folder ? (
            <span className="done">
              <Check size={13} /> Select Project
            </span>
          ) : (
            <span className="current">1 Select Project</span>
          )}
          <i />
          {busy ? (
            <span className="done">
              <Check size={13} /> Analysis Rules
            </span>
          ) : folder ? (
            <span className="current">2 Analysis Rules</span>
          ) : (
            <span>2 Analysis Rules</span>
          )}
          <i />
          {busy ? (
            <span className="current">3 Analyze</span>
          ) : (
            <span>3 Analyze</span>
          )}
        </div>

        <h1>Configure Project Analysis</h1>
        <p>
          NEXUS indexes the selected folder directly in place. Source contents are read only when
          needed for analysis and are never uploaded or stored as raw files.
        </p>

        {!isSupported && (
          <div className="error-box" role="alert">
            Direct folder selection requires a desktop Chromium browser (Chrome, Edge, Brave, Opera, Arc).
          </div>
        )}

        <button
          className="folder-choice"
          onClick={choose}
          disabled={busy || !isSupported}
          aria-label={folder ? `Selected folder: ${folder.name}` : 'Select a local project folder'}
        >
          <FolderOpen />
          <span>{folder?.name ?? (isSupported ? 'Select a local project folder' : 'Browser does not support folder picker')}</span>
          <b>{folder ? 'Change' : 'Choose'}</b>
        </button>

        <div className="import-grid">
          {/* Column 1: Included Categories */}
          <article>
            <h3>Analyze contents of</h3>
            {categories.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={selectedCategories.has(key)}
                  onChange={() => toggleCategory(key)}
                  disabled={busy}
                />
                <span>{label}</span>
              </label>
            ))}
            <label>
              <input type="checkbox" checked readOnly />
              <span>Assets (metadata only)</span>
            </label>
          </article>

          {/* Column 2: Automatic & Custom Exclusions */}
          <article>
            <h3>Excluded before traversal</h3>
            {[
              'node_modules/',
              '.git/',
              'build/',
              'dist/',
              '.gradle/',
              'coverage/',
              'known caches/vendor',
            ].map((item) => (
              <label key={item}>
                <input type="checkbox" checked readOnly />
                <span>{item}</span>
              </label>
            ))}

            {/* Custom Exclusions (Section 20) */}
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #282A3D' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="e.g. fixtures or packages/legacy"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomExclusion();
                    }
                  }}
                  disabled={busy}
                  style={{
                    background: '#151624',
                    border: '1px solid #2B2E42',
                    borderRadius: '5px',
                    padding: '4px 8px',
                    fontSize: '10px',
                    color: 'white',
                    width: '100%',
                  }}
                />
                <button
                  type="button"
                  className="ghost small"
                  style={{ padding: '4px 8px' }}
                  onClick={addCustomExclusion}
                  disabled={busy || !customInput.trim()}
                  title="Add folder to exclude"
                >
                  <Plus size={12} />
                </button>
              </div>
              <small style={{ display: 'block', color: '#8E92A5', fontSize: '9px', marginTop: '4px' }}>
                "fixtures" excludes folders named fixtures anywhere; "temp/data" excludes that project path.
              </small>

              {customExclusions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                  {customExclusions.map((item) => (
                    <span
                      key={item}
                      style={{
                        background: '#1F2236',
                        border: '1px solid #31354F',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '9px',
                        color: '#C4B5FD',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {item}
                      {!busy && (
                        <button
                          type="button"
                          onClick={() => removeCustomExclusion(item)}
                          style={{
                            background: 'transparent',
                            border: 0,
                            padding: 0,
                            color: '#9CA3AF',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={9} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>

          {/* Column 3: Scan Summary & Calm Real Progress (Section 18B & 18D) */}
          <article className="scan-summary">
            <h3>Scan Summary</h3>
            <p>
              <HardDrive size={15} /> Direct local access
            </p>
            <p>
              <ShieldCheck size={15} /> No source upload
            </p>

            <div className="scan-progress-box">
              {progress ? (
                <>
                  <div className="progress-phase-title">
                    <span>
                      {progress.phase === 'discovering' && 'Discovering project…'}
                      {progress.phase === 'analyzing' && 'Analyzing files'}
                      {progress.phase === 'building-relationships' && 'Building relationships'}
                      {progress.phase === 'finalizing' && 'Finalizing metrics'}
                      {progress.phase === 'saving' && 'Saving local index'}
                      {progress.phase === 'complete' && 'Analysis complete'}
                    </span>
                    {progress.phase === 'analyzing' && progress.percentage !== undefined && (
                      <span className="tabular-nums">{progress.percentage}%</span>
                    )}
                  </div>

                  {/* Horizontal Calm Progress Bar (Section 18B) */}
                  <div
                    className="progress-bar-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.phase === 'analyzing' || progress.phase === 'complete' ? progress.percentage : undefined}
                    aria-label={
                      progress.phase === 'discovering'
                        ? 'Discovering project files'
                        : `Analyzing files: ${progress.percentage ?? 0}%`
                    }
                  >
                    {progress.phase === 'discovering' || progress.phase === 'building-relationships' || progress.phase === 'finalizing' || progress.phase === 'saving' ? (
                      <div className="progress-bar-indeterminate" />
                    ) : (
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${Math.min(100, Math.max(2, progress.percentage ?? 0))}%` }}
                      />
                    )}
                  </div>

                  {/* Stable Numeric Counters (Section 18C) */}
                  <div className="progress-stats-row">
                    {progress.phase === 'discovering' ? (
                      <span>{progress.discovered.toLocaleString()} entries found</span>
                    ) : (
                      <>
                        <span>
                          {(progress.processedFiles ?? (progress.analyzed + progress.reused)).toLocaleString()} / {(progress.totalFilesToProcess ?? progress.totalToAnalyze ?? progress.discovered).toLocaleString()} processed{progress.percentage !== undefined ? ` · ${progress.percentage}%` : ''}
                        </span>
                        <span style={{ color: '#8E92A5', fontSize: '10px' }}>
                          {progress.analyzed} analyzed · {progress.reused} reused
                        </span>
                      </>
                    )}
                  </div>

                  {/* Safely Truncated Current Path (Section 18C) */}
                  <div className="progress-path-text" title={progress.currentPath}>
                    {progress.currentPath}
                  </div>

                  {/* Stable Warnings Indicator */}
                  <div style={{ minHeight: '16px' }}>
                    {progress.warnings > 0 && (
                      <span className="warning-text" style={{ fontSize: '10px' }}>
                        {progress.warnings} recoverable warning{progress.warnings === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: '#737789', fontSize: '11px', textAlign: 'center', padding: '16px 0' }}>
                  Ready to scan
                </div>
              )}
            </div>
          </article>
        </div>

        {/* Polite Screen Reader Live Region (Section 18F) */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            margin: '-1px',
            padding: '0',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            border: '0',
          }}
        >
          {liveAnnouncement}
        </div>

        {error && <div className="error-box" role="alert">{error}</div>}

        <footer>
          <button className="ghost" onClick={cancel}>
            {busy ? 'Stop analysis' : 'Cancel'}
          </button>
          <button
            className="primary"
            disabled={!folder || busy}
            onClick={analyze}
          >
            {busy ? 'Analyzing…' : 'Analyze Project →'}
          </button>
        </footer>
      </section>
    </div>
  );
}
