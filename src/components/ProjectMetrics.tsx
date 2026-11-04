import React from 'react';
import {
  PieChart,
  HardDrive,
  FileCode,
  ShieldCheck,
  FolderTree,
  ExternalLink,
  Info
} from 'lucide-react';
import { LanguageStat, NexusNode, NexusProject } from '../types/nexus';
import { formatBytes } from '../lib/fileClassifier';

interface ProjectMetricsProps {
  project: NexusProject;
  languageStats: LanguageStat[];
  onSelectExtension: (ext: string) => void;
  selectedExtension: string;
  onSelectNode: (node: NexusNode) => void;
}

export const ProjectMetrics: React.FC<ProjectMetricsProps> = ({
  project,
  languageStats,
  onSelectExtension,
  selectedExtension,
  onSelectNode,
}) => {
  // Extract top 5 largest files in the project
  const largestFiles = [...project.nodes]
    .filter((n) => n.kind === 'file')
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 5);

  return (
    <aside className="w-80 h-full border-l border-[#251E38] bg-[#0E0C16] flex flex-col shrink-0 select-none overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-[#2F244E]">
      {/* Project Signature Card */}
      <div className="p-3.5 rounded-lg bg-[#141021] border border-[#2B2144] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-[#A855F7] font-semibold flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Project Profile</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#251B40] text-[#D8B4FE] border border-[#4C337D]">
            LOCAL
          </span>
        </div>

        <div>
          <h2 className="text-sm font-bold text-white font-mono truncate" title={project.name}>
            {project.name}
          </h2>
          <p className="text-[10px] font-mono text-[#64748B] truncate mt-0.5" title={project.id}>
            ID: {project.id}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#231A38] text-center font-mono">
          <div className="bg-[#1A142A] p-2 rounded border border-[#2B2046]">
            <span className="text-[10px] text-[#64748B] block">Files</span>
            <span className="text-xs font-bold text-white">{project.fileCount}</span>
          </div>
          <div className="bg-[#1A142A] p-2 rounded border border-[#2B2046]">
            <span className="text-[10px] text-[#64748B] block">Folders</span>
            <span className="text-xs font-bold text-white">{project.directoryCount}</span>
          </div>
          <div className="bg-[#1A142A] p-2 rounded border border-[#2B2046]">
            <span className="text-[10px] text-[#64748B] block">Size</span>
            <span className="text-xs font-bold text-[#A855F7]">
              {formatBytes(project.totalBytes)}
            </span>
          </div>
        </div>
      </div>

      {/* Language Composition */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-[#A855F7] font-semibold flex items-center gap-1.5">
            <PieChart className="w-3.5 h-3.5" />
            <span>Language Breakdown</span>
          </span>
          <span className="text-[10px] font-mono text-[#64748B]">
            {languageStats.length} types
          </span>
        </div>

        {/* Visual Stacked Bar */}
        <div className="h-2.5 w-full rounded-full bg-[#1A152B] overflow-hidden flex">
          {languageStats.map((st) => (
            <div
              key={st.extension}
              style={{
                width: `${Math.max(st.percentage, 1.5)}%`,
                backgroundColor: st.color,
              }}
              title={`${st.language}: ${st.percentage.toFixed(1)}%`}
              className="h-full transition-all hover:opacity-80"
            />
          ))}
        </div>

        {/* Language List */}
        <div className="space-y-1">
          {languageStats.map((st) => {
            const isFilterActive = selectedExtension === st.extension;
            return (
              <button
                key={st.extension}
                onClick={() =>
                  onSelectExtension(isFilterActive ? 'ALL' : st.extension)
                }
                className={`w-full px-2.5 py-1.5 rounded-md flex items-center justify-between text-xs font-mono transition-colors border ${
                  isFilterActive
                    ? 'bg-[#291B47] text-white border-[#7C3AED]'
                    : 'bg-[#120F1F] hover:bg-[#1A152E] text-[#94A3B8] border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: st.color }}
                  />
                  <span className="text-white font-medium">{st.language}</span>
                  <span className="text-[10px] text-[#64748B]">.{st.extension}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span>{st.count} files</span>
                  <span className="text-[#A855F7] font-semibold">
                    {st.percentage.toFixed(0)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Largest Source Files */}
      <div className="space-y-2.5">
        <span className="text-xs font-mono uppercase tracking-wider text-[#A855F7] font-semibold flex items-center gap-1.5">
          <FileCode className="w-3.5 h-3.5" />
          <span>Largest Files</span>
        </span>

        <div className="space-y-1">
          {largestFiles.map((file) => (
            <div
              key={file.id}
              onClick={() => onSelectNode(file)}
              className="p-2 rounded bg-[#120F1F] hover:bg-[#1C1630] border border-[#231A38] hover:border-[#4B3473] cursor-pointer transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#E2E8F0] group-hover:text-[#D8B4FE] truncate max-w-[170px]" title={file.path}>
                  {file.name}
                </span>
                <span className="text-[11px] font-mono text-[#A855F7] shrink-0">
                  {formatBytes(file.sizeBytes)}
                </span>
              </div>
              <p className="text-[10px] font-mono text-[#64748B] truncate mt-0.5" title={file.path}>
                {file.path}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Milestone 1 Architecture Guarantee */}
      <div className="mt-auto p-3 rounded-lg bg-[#120D20] border border-[#2B1B47] text-[11px] font-mono space-y-1.5 text-[#94A3B8]">
        <div className="flex items-center gap-1.5 text-[#A855F7] font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Milestone 1 Architecture</span>
        </div>
        <p className="text-[10px] leading-relaxed text-[#7C7194]">
          • 100% Client-Side Execution<br />
          • Stable Node Identity Schema<br />
          • Zero Fake Data / Zero Cloud Exfiltration
        </p>
      </div>
    </aside>
  );
};
