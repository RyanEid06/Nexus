import React from 'react';
import { 
  FolderTree, 
  FolderOpen, 
  RefreshCw, 
  X, 
  ShieldCheck, 
  HardDrive
} from 'lucide-react';
import { NexusProject } from '../types/nexus';
import { formatBytes } from '../lib/fileClassifier';

interface HeaderProps {
  project: NexusProject | null;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onCloseProject: () => void;
  isScanning: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  onOpenFolder,
  onRefresh,
  onCloseProject,
  isScanning,
}) => {
  return (
    <header className="h-14 border-b border-[#251E38] bg-[#0E0C16] px-4 flex items-center justify-between select-none z-20">
      {/* Brand & Active Project */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C3AED] via-[#9333EA] to-[#4C1D95] p-[1px] shadow-[0_0_15px_rgba(147,51,234,0.35)] flex items-center justify-center">
            <div className="w-full h-full bg-[#0E0C16] rounded-[7px] flex items-center justify-center">
              <FolderTree className="w-4 h-4 text-[#A855F7]" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold tracking-wider text-white text-base font-mono">
              NEXUS
            </span>
            <span className="text-[10px] font-mono tracking-widest px-1.5 py-0.5 rounded bg-[#2E1E54] text-[#C084FC] border border-[#6D28D9]/40">
              M1
            </span>
          </div>
        </div>

        {project && (
          <div className="hidden sm:flex items-center gap-2 pl-3 ml-2 border-l border-[#28203E]">
            <div className="flex items-center gap-1.5 text-xs text-[#E2E8F0] font-mono font-medium max-w-[200px] truncate bg-[#161324] px-2.5 py-1 rounded-md border border-[#30274B]">
              <HardDrive className="w-3.5 h-3.5 text-[#9333EA]" />
              <span className="truncate">{project.name}</span>
            </div>
            <span className="text-[11px] text-[#94A3B8] font-mono">
              {project.fileCount} files • {formatBytes(project.totalBytes)}
            </span>
          </div>
        )}
      </div>

      {/* Right Controls: Actions & Privacy Pill */}
      <div className="flex items-center gap-2.5">
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#141122] border border-[#2D2447] text-[11px] font-mono text-[#A855F7]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
          <span className="text-[#94A3B8]">Privacy:</span>
          <span className="text-emerald-400 font-semibold">100% In-Browser</span>
        </div>

        {project ? (
          <>
            <button
              onClick={onRefresh}
              disabled={isScanning}
              title="Rescan local project directory"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1B162E] hover:bg-[#251E3E] text-[#D8B4FE] border border-[#3E2D64] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-[#A855F7]' : ''}`} />
              <span className="hidden sm:inline">Rescan</span>
            </button>
            <button
              onClick={onOpenFolder}
              disabled={isScanning}
              title="Open a different local folder"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#251A45] hover:bg-[#342460] text-purple-200 border border-[#583994] transition-colors shadow-[0_0_10px_rgba(124,58,237,0.2)]"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#C084FC]" />
              <span className="hidden sm:inline">Change Folder</span>
            </button>
            <button
              onClick={onCloseProject}
              title="Close project workspace"
              className="p-1.5 text-xs font-medium rounded-md bg-[#161224] hover:bg-red-950/40 text-[#94A3B8] hover:text-red-300 border border-[#2D2348] hover:border-red-900/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={onOpenFolder}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-all shadow-[0_0_15px_rgba(124,58,237,0.4)] hover:shadow-[0_0_20px_rgba(124,58,237,0.6)]"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open Local Folder</span>
          </button>
        )}
      </div>
    </header>
  );
};
