/**
 * NEXUS - Local-First Code Architecture Visualizer
 * Milestone 1 Implementation: Desktop-only, client-only, zero-fake-data.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { WelcomeState } from './components/WelcomeState';
import { FileTree } from './components/FileTree';
import { FileViewer } from './components/FileViewer';
import { ProjectMetrics } from './components/ProjectMetrics';
import {
  FileFilterState,
  NexusNode,
  NexusProject,
  RecentProjectMetadata,
} from './types/nexus';
import { createProjectId } from './lib/identity';
import { buildNexusTree, filterTree, FlatFileInput } from './lib/treeBuilder';
import {
  isFileSystemAccessSupported,
  scanDataTransferItemList,
  scanDirectoryHandle,
  scanFileList,
} from './lib/fileSystem';
import {
  getRecentProjects,
  saveRecentProject,
} from './lib/recentProjects';

export default function App() {
  const [project, setProject] = useState<NexusProject | null>(null);
  const [selectedNode, setSelectedNode] = useState<NexusNode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [recentProjects, setRecentProjects] = useState<RecentProjectMetadata[]>([]);

  // Filter state
  const [filter, setFilter] = useState<FileFilterState>({
    searchQuery: '',
    selectedExtension: 'ALL',
    hideDotFiles: true,
    hideNodeModules: true,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  // Load recents on mount
  useEffect(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  const refreshRecents = useCallback(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  const handleFilterChange = useCallback((updated: Partial<FileFilterState>) => {
    setFilter((prev) => ({ ...prev, ...updated }));
  }, []);

  // Process raw files into structured NexusProject
  const processIngestedFiles = useCallback(
    (name: string, files: FlatFileInput[], rootHandle?: FileSystemDirectoryHandle) => {
      const projectId = createProjectId(name);
      const { rootNode, allNodes, languageStats } = buildNexusTree(projectId, name, files);

      const newProject: NexusProject = {
        id: projectId,
        name,
        openedAt: Date.now(),
        fileCount: files.length,
        directoryCount: allNodes.filter((n) => n.kind === 'directory').length - 1,
        totalBytes: rootNode.sizeBytes,
        nodes: allNodes,
        rootNode,
        rootHandle,
      };

      setProject(newProject);
      setSelectedNode(rootNode);

      // Save to recent projects cache
      const meta: RecentProjectMetadata = {
        id: projectId,
        name,
        fileCount: newProject.fileCount,
        directoryCount: newProject.directoryCount,
        totalBytes: newProject.totalBytes,
        lastOpened: Date.now(),
      };
      saveRecentProject(meta);
      setRecentProjects(getRecentProjects());
    },
    []
  );

  // Trigger Chromium File System Access Picker
  const handleOpenFolder = async () => {
    if (!isFileSystemAccessSupported()) {
      // In non-Chromium or sandboxed environments, trigger fallback
      const input = document.querySelector<HTMLInputElement>('input[webkitdirectory]');
      if (input) {
        input.click();
      }
      return;
    }

    try {
      setIsScanning(true);
      setScanStatus('Waiting for folder authorization...');

      // @ts-expect-error window.showDirectoryPicker is standard in Chromium
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read',
      });

      setScanStatus(`Scanning ${dirHandle.name}...`);
      const files = await scanDirectoryHandle(dirHandle, {
        includeNodeModules: false,
        onProgress: (count, cur) => {
          setScanStatus(`Indexed ${count} files (${cur})...`);
        },
      });

      processIngestedFiles(dirHandle.name, files, dirHandle);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User closed picker dialog without selecting
      } else {
        console.error('Directory picker error, falling back:', err);
        const input = document.querySelector<HTMLInputElement>('input[webkitdirectory]');
        if (input) {
          input.click();
        }
      }
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  // Handle files selected via webkitdirectory input fallback
  const handleFilesSelected = (fileList: FileList) => {
    setIsScanning(true);
    setScanStatus(`Indexing ${fileList.length} files...`);

    try {
      const files = scanFileList(fileList, { includeNodeModules: false });
      let projectName = 'Project';
      if (fileList.length > 0) {
        const rel = fileList[0].webkitRelativePath;
        if (rel && rel.includes('/')) {
          projectName = rel.split('/')[0];
        }
      }
      processIngestedFiles(projectName, files);
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  // Handle drag and drop folder
  const handleDropItems = async (items: DataTransferItemList) => {
    setIsScanning(true);
    setScanStatus('Reading dropped directory entries...');

    try {
      const result = await scanDataTransferItemList(items, { includeNodeModules: false });
      processIngestedFiles(result.projectName, result.files);
    } catch (err) {
      console.error('Failed to parse dropped directory:', err);
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  // Rescan current active directory
  const handleRefresh = async () => {
    if (!project?.rootHandle) {
      return;
    }
    setIsScanning(true);
    setScanStatus(`Rescanning ${project.name}...`);

    try {
      const files = await scanDirectoryHandle(project.rootHandle, {
        includeNodeModules: false,
      });
      processIngestedFiles(project.name, files, project.rootHandle);
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  const handleCloseProject = () => {
    setProject(null);
    setSelectedNode(null);
  };

  // Compute filtered tree based on active user criteria
  const filteredRootNode = useMemo(() => {
    if (!project) return null;
    return filterTree(project.rootNode, filter) || project.rootNode;
  }, [project, filter]);

  // Compute project language statistics
  const languageStats = useMemo(() => {
    if (!project) return [];
    const { languageStats } = buildNexusTree(project.id, project.name, project.nodes.filter(n => n.kind === 'file').map(n => ({
      path: n.path,
      sizeBytes: n.sizeBytes,
    })));
    return languageStats;
  }, [project]);

  return (
    <div className="w-screen h-screen bg-[#07060A] text-slate-100 flex flex-col overflow-hidden font-sans select-none">
      {/* Top Navigation Bar */}
      <Header
        project={project}
        onOpenFolder={handleOpenFolder}
        onRefresh={handleRefresh}
        onCloseProject={handleCloseProject}
        isScanning={isScanning}
      />

      {/* Main Workspace */}
      {!project ? (
        <WelcomeState
          onOpenFolder={handleOpenFolder}
          onFilesSelected={handleFilesSelected}
          onDropItems={handleDropItems}
          recentProjects={recentProjects}
          onRefreshRecents={refreshRecents}
          isScanning={isScanning}
          scanStatus={scanStatus}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Interactive File Tree */}
          {filteredRootNode && (
            <FileTree
              rootNode={filteredRootNode}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              filter={filter}
              onFilterChange={handleFilterChange}
              languageStats={languageStats}
            />
          )}

          {/* Center: File Viewer & Code Inspector */}
          <FileViewer
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
          />

          {/* Right: Project Metrics & Language Breakdown */}
          <ProjectMetrics
            project={project}
            languageStats={languageStats}
            onSelectExtension={(ext) => handleFilterChange({ selectedExtension: ext })}
            selectedExtension={filter.selectedExtension}
            onSelectNode={setSelectedNode}
          />
        </div>
      )}

      {/* Persistent Status Bar */}
      <footer className="h-6 bg-[#09080E] border-t border-[#1F192E] px-4 flex items-center justify-between text-[11px] font-mono text-[#64748B] shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${project ? 'bg-emerald-400' : 'bg-[#7C3AED]'}`} />
            <span>{isScanning ? scanStatus || 'Scanning...' : project ? `Active: ${project.name}` : 'NEXUS Engine Ready'}</span>
          </span>
          {project && (
            <span>
              {project.fileCount} files indexed • {project.directoryCount} folders
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[#A855F7]">Milestone 1 Active</span>
          <span className="text-[#475569]">•</span>
          <span>Zero-Fake-Data</span>
          <span className="text-[#475569]">•</span>
          <span className="text-emerald-500 font-medium">Local-First</span>
        </div>
      </footer>
    </div>
  );
}
