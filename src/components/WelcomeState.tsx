import React, { useRef, useState } from 'react';
import {
  FolderOpen,
  ShieldCheck,
  FolderTree,
  Clock,
  Trash2,
  HardDrive,
  FileCode,
  Upload,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { RecentProjectMetadata } from '../types/nexus';
import { formatBytes } from '../lib/fileClassifier';
import { clearRecentProjects, removeRecentProject } from '../lib/recentProjects';

interface WelcomeStateProps {
  onOpenFolder: () => void;
  onFilesSelected: (files: FileList) => void;
  onDropItems: (items: DataTransferItemList) => void;
  recentProjects: RecentProjectMetadata[];
  onRefreshRecents: () => void;
  isScanning: boolean;
  scanStatus: string;
}

export const WelcomeState: React.FC<WelcomeStateProps> = ({
  onOpenFolder,
  onFilesSelected,
  onDropItems,
  recentProjects,
  onRefreshRecents,
  isScanning,
  scanStatus,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      onDropItems(e.dataTransfer.items);
    } else if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleClearRecents = () => {
    clearRecentProjects();
    onRefreshRecents();
  };

  const handleRemoveRecent = (id: string) => {
    removeRecentProject(id);
    onRefreshRecents();
  };

  return (
    <div className="flex-1 h-full bg-[#07060A] overflow-y-auto flex flex-col items-center justify-center p-6 select-none relative">
      {/* Background Radial Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#6D28D9]/15 via-[#9333EA]/10 to-transparent blur-3xl pointer-events-none rounded-full" />

      {/* Hidden file input for webkitdirectory fallback */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is standard in Chromium/Firefox/Safari for folders
        webkitdirectory="true"
        directory="true"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files);
          }
        }}
      />

      <div className="max-w-2xl w-full z-10 space-y-8 my-auto">
        {/* Branding Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A142A] border border-[#3E2863] text-xs font-mono text-[#D8B4FE] mb-2 shadow-[0_0_20px_rgba(147,51,234,0.2)]">
            <Sparkles className="w-3.5 h-3.5 text-[#A855F7]" />
            <span>NEXUS Architecture Suite • Milestone 1</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">
            Local Code Architecture Visualizer
          </h1>
          <p className="text-sm text-[#94A3B8] max-w-lg mx-auto leading-relaxed">
            Directly inspect real local source repositories. Desktop-only, client-only architecture running 100% inside your browser. No files, code, or telemetry ever leave your device.
          </p>
        </div>

        {/* Primary Ingestion Drop Zone & Action Card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`p-8 rounded-2xl border-2 transition-all duration-200 text-center space-y-5 bg-[#0F0D17]/80 backdrop-blur-sm ${
            isDragOver
              ? 'border-[#A855F7] bg-[#1E1733] shadow-[0_0_30px_rgba(168,85,247,0.35)] scale-[1.01]'
              : 'border-[#2D2347] hover:border-[#4B3673] shadow-xl'
          }`}
        >
          {isScanning ? (
            <div className="py-6 space-y-3">
              <div className="w-12 h-12 rounded-full border-2 border-[#A855F7] border-t-transparent animate-spin mx-auto" />
              <p className="text-sm font-mono text-white font-medium">Scanning directory structure...</p>
              <p className="text-xs font-mono text-[#94A3B8]">{scanStatus}</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#4C1D95]/40 border border-[#6D28D9]/40 flex items-center justify-center mx-auto text-[#C084FC] shadow-[0_0_20px_rgba(124,58,237,0.3)]">
                <FolderOpen className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-white font-mono">
                  Select a Local Project Folder
                </h3>
                <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                  Drag and drop a project directory here, or choose your local source repository to construct the hierarchy.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={onOpenFolder}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(124,58,237,0.4)] hover:shadow-[0_0_25px_rgba(124,58,237,0.6)] cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Open Folder (File System API)</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#181329] hover:bg-[#251E3D] text-[#D8B4FE] border border-[#38265B] font-mono text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Directory Fallback Picker</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Milestone 1 Feature Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg bg-[#110E1D] border border-[#231A38] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-white">
              <HardDrive className="w-4 h-4 text-[#A855F7]" />
              <span>Direct File System</span>
            </div>
            <p className="text-[11px] text-[#7C7194] leading-relaxed">
              Native Chromium directory handles and universal folder streaming.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#110E1D] border border-[#231A38] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-white">
              <FolderTree className="w-4 h-4 text-[#38BDF8]" />
              <span>Stable Identity</span>
            </div>
            <p className="text-[11px] text-[#7C7194] leading-relaxed">
              Deterministic node addresses and recursive metrics calculated locally.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#110E1D] border border-[#231A38] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Zero-Fake-Data</span>
            </div>
            <p className="text-[11px] text-[#7C7194] leading-relaxed">
              Strictly real code. No telemetry, no simulated mock data, zero cloud leaks.
            </p>
          </div>
        </div>

        {/* Recent Projects Metadata Vault */}
        {recentProjects.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[#A855F7] font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Recently Inspected Projects</span>
              </span>
              <button
                onClick={handleClearRecents}
                className="text-[11px] font-mono text-[#64748B] hover:text-red-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear history</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="p-3 rounded-lg bg-[#110E1C] border border-[#231938] hover:border-[#4B3273] transition-colors flex items-center justify-between group"
                >
                  <div className="space-y-0.5 truncate pr-2">
                    <p className="text-xs font-bold text-white font-mono truncate">{proj.name}</p>
                    <p className="text-[10px] font-mono text-[#64748B]">
                      {proj.fileCount} files • {formatBytes(proj.totalBytes)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveRecent(proj.id)}
                    title="Remove from history"
                    className="p-1 rounded text-[#4B3C68] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
