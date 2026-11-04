import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronsDownUp,
  ChevronsUpDown
} from 'lucide-react';
import { FileFilterState, LanguageStat, NexusNode } from '../types/nexus';
import { formatBytes } from '../lib/fileClassifier';

interface FileTreeProps {
  rootNode: NexusNode;
  selectedNode: NexusNode | null;
  onSelectNode: (node: NexusNode) => void;
  filter: FileFilterState;
  onFilterChange: (updated: Partial<FileFilterState>) => void;
  languageStats: LanguageStat[];
}

export const FileTree: React.FC<FileTreeProps> = ({
  rootNode,
  selectedNode,
  onSelectNode,
  filter,
  onFilterChange,
  languageStats,
}) => {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [showFilterBar, setShowFilterBar] = useState(false);

  const toggleDirectory = (nodeId: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const collapseAll = () => {
    const allDirIds = new Set<string>();
    function collect(n: NexusNode) {
      if (n.kind === 'directory' && n.id !== rootNode.id) {
        allDirIds.add(n.id);
      }
      if (n.children) {
        n.children.forEach(collect);
      }
    }
    collect(rootNode);
    setCollapsedDirs(allDirIds);
  };

  const expandAll = () => {
    setCollapsedDirs(new Set());
  };

  // Render individual tree item recursively
  const renderNode = (node: NexusNode) => {
    const isSelected = selectedNode?.id === node.id;
    const isDir = node.kind === 'directory';
    const isCollapsed = collapsedDirs.has(node.id);

    return (
      <div key={node.id} className="select-none text-xs">
        <div
          onClick={() => {
            if (isDir) {
              toggleDirectory(node.id);
            }
            onSelectNode(node);
          }}
          style={{ paddingLeft: `${Math.max(node.depth * 14, 8)}px` }}
          className={`flex items-center gap-1.5 py-1 pr-2 rounded cursor-pointer transition-colors group ${
            isSelected
              ? 'bg-[#291D47] text-white border-l-2 border-[#A855F7]'
              : 'text-[#94A3B8] hover:bg-[#1A162B] hover:text-[#E2E8F0]'
          }`}
        >
          {isDir ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleDirectory(node.id);
              }}
              className="p-0.5 rounded hover:bg-[#342757] text-[#A855F7]"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          ) : (
            <span className="w-3.5 h-3.5" />
          )}

          {/* Icon */}
          {isDir ? (
            isCollapsed ? (
              <Folder className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5 text-[#C084FC] shrink-0" />
            )
          ) : node.language !== 'Plain Text' && node.language !== 'Other' ? (
            <FileCode className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
          )}

          {/* Name */}
          <span
            className={`truncate font-mono text-[12px] ${
              isSelected ? 'font-semibold text-white' : ''
            }`}
          >
            {node.name}
          </span>

          {/* Metadata pill */}
          <span className="ml-auto text-[10px] text-[#64748B] group-hover:text-[#94A3B8] font-mono shrink-0">
            {isDir
              ? node.recursiveFileCount !== undefined
                ? `${node.recursiveFileCount} files`
                : ''
              : formatBytes(node.sizeBytes)}
          </span>
        </div>

        {/* Children if directory and not collapsed */}
        {isDir && !isCollapsed && node.children && node.children.length > 0 && (
          <div className="relative">
            {node.children.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-80 h-full border-r border-[#251E38] bg-[#0F0D18] flex flex-col shrink-0 select-none">
      {/* Search Bar */}
      <div className="p-3 border-b border-[#251E38] space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#A855F7] absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={filter.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            placeholder="Search files or paths..."
            className="w-full bg-[#171326] text-xs font-mono text-white pl-8 pr-7 py-2 rounded-md border border-[#30264B] focus:border-[#8B5CF6] focus:outline-none transition-colors placeholder:text-[#5E537A]"
          />
          {filter.searchQuery && (
            <button
              onClick={() => onFilterChange({ searchQuery: '' })}
              className="absolute right-2.5 top-2.5 text-[#64748B] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tree Action Buttons */}
        <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              title="Expand all directories"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1E1933] text-[#A855F7] transition-colors"
            >
              <ChevronsUpDown className="w-3 h-3" />
              <span>Expand</span>
            </button>
            <button
              onClick={collapseAll}
              title="Collapse all directories"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1E1933] text-[#A855F7] transition-colors"
            >
              <ChevronsDownUp className="w-3 h-3" />
              <span>Collapse</span>
            </button>
          </div>

          <button
            onClick={() => setShowFilterBar(!showFilterBar)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              showFilterBar || filter.selectedExtension !== 'ALL' || filter.hideDotFiles || !filter.hideNodeModules
                ? 'bg-[#291B47] text-[#C084FC] border-[#6D28D9]'
                : 'bg-[#161226] hover:bg-[#1F1935] text-[#94A3B8] border-[#2D234A]'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Filters</span>
          </button>
        </div>

        {/* Advanced Filters Drawer */}
        {showFilterBar && (
          <div className="p-2.5 rounded-md bg-[#161225] border border-[#2D2248] space-y-2.5 text-[11px]">
            {/* Sort Controls */}
            <div className="flex items-center justify-between">
              <span className="text-[#94A3B8] font-mono">Sort by:</span>
              <div className="flex items-center gap-1">
                {(['name', 'size', 'path'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onFilterChange({ sortBy: mode })}
                    className={`px-1.5 py-0.5 rounded capitalize ${
                      filter.sortBy === mode
                        ? 'bg-[#7C3AED] text-white font-medium'
                        : 'bg-[#1C172E] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
                <button
                  onClick={() =>
                    onFilterChange({
                      sortOrder: filter.sortOrder === 'asc' ? 'desc' : 'asc',
                    })
                  }
                  title={`Direction: ${filter.sortOrder.toUpperCase()}`}
                  className="p-1 rounded bg-[#1C172E] text-[#A855F7] hover:text-white"
                >
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-1.5 pt-1 border-t border-[#251C3D]">
              <label className="flex items-center gap-2 cursor-pointer text-[#CBD5E1]">
                <input
                  type="checkbox"
                  checked={filter.hideDotFiles}
                  onChange={(e) => onFilterChange({ hideDotFiles: e.target.checked })}
                  className="rounded border-[#4C3B70] bg-[#100D1C] text-[#8B5CF6] focus:ring-0"
                />
                <span>Hide dotfiles (.*)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#CBD5E1]">
                <input
                  type="checkbox"
                  checked={filter.hideNodeModules}
                  onChange={(e) => onFilterChange({ hideNodeModules: e.target.checked })}
                  className="rounded border-[#4C3B70] bg-[#100D1C] text-[#8B5CF6] focus:ring-0"
                />
                <span>Hide node_modules</span>
              </label>
            </div>

            {/* Extension filter chips */}
            <div className="pt-1 border-t border-[#251C3D]">
              <span className="text-[#94A3B8] font-mono block mb-1">Extensions:</span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                <button
                  onClick={() => onFilterChange({ selectedExtension: 'ALL' })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    filter.selectedExtension === 'ALL'
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-[#1C172E] text-[#94A3B8] hover:text-white'
                  }`}
                >
                  ALL
                </button>
                {languageStats.slice(0, 8).map((st) => (
                  <button
                    key={st.extension}
                    onClick={() => onFilterChange({ selectedExtension: st.extension })}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      filter.selectedExtension === st.extension
                        ? 'bg-[#7C3AED] text-white'
                        : 'bg-[#1C172E] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    .{st.extension}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin scrollbar-thumb-[#2F244E]">
        {rootNode.children && rootNode.children.length > 0 ? (
          rootNode.children.map(renderNode)
        ) : (
          <div className="p-4 text-center text-xs text-[#64748B] font-mono">
            No files match the active filter.
          </div>
        )}
      </div>
    </aside>
  );
};
