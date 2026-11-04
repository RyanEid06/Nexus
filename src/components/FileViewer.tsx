import React, { useEffect, useState } from 'react';
import {
  FileCode,
  Folder,
  Copy,
  Check,
  HardDrive,
  FileText,
  AlertCircle,
  FileQuestion,
  Layers,
  ChevronRight
} from 'lucide-react';
import { NexusNode } from '../types/nexus';
import { formatBytes } from '../lib/fileClassifier';
import { readFileText } from '../lib/fileSystem';

interface FileViewerProps {
  selectedNode: NexusNode | null;
  onSelectNode: (node: NexusNode) => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({ selectedNode, onSelectNode }) => {
  const [content, setContent] = useState<string | null>(null);
  const [isBinary, setIsBinary] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (!selectedNode || selectedNode.kind === 'directory') {
      setContent(null);
      setIsBinary(false);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setContent(null);

    readFileText(selectedNode.fileHandle, selectedNode.rawFile)
      .then((res) => {
        if (isCancelled) return;
        setIsLoading(false);
        if (res.error) {
          setErrorMessage(res.error);
        } else if (res.isBinary) {
          setIsBinary(true);
        } else {
          setContent(res.text);
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        setIsLoading(false);
        setErrorMessage(err instanceof Error ? err.message : 'Error loading file content');
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedNode]);

  const handleCopyPath = () => {
    if (!selectedNode) return;
    navigator.clipboard.writeText(selectedNode.path || selectedNode.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!selectedNode) {
    return (
      <main className="flex-1 h-full bg-[#0B0913] flex flex-col items-center justify-center text-[#64748B] select-none p-6">
        <div className="w-14 h-14 rounded-2xl bg-[#141021] border border-[#2B2144] flex items-center justify-center mb-4 text-[#8B5CF6]">
          <Layers className="w-7 h-7" />
        </div>
        <p className="text-sm font-mono text-[#CBD5E1] mb-1">No file or directory selected</p>
        <p className="text-xs text-[#64748B] max-w-sm text-center">
          Click any file in the explorer tree to preview its source code, or click a directory to view its structural aggregates.
        </p>
      </main>
    );
  }

  const breadcrumbs = selectedNode.path ? selectedNode.path.split('/') : [selectedNode.name];

  return (
    <main className="flex-1 h-full bg-[#0A0912] flex flex-col overflow-hidden">
      {/* File / Directory Header Bar */}
      <div className="h-12 border-b border-[#251E38] bg-[#0E0C17] px-4 flex items-center justify-between shrink-0 select-none">
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-mono py-1">
          {selectedNode.kind === 'directory' ? (
            <Folder className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
          ) : (
            <FileCode className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
          )}

          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-[#4B3D6B] shrink-0" />}
              <span
                className={`whitespace-nowrap ${
                  idx === breadcrumbs.length - 1
                    ? 'text-white font-medium'
                    : 'text-[#94A3B8]'
                }`}
              >
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Right Details & Copy Action */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1D172E] text-[#C084FC] border border-[#3E2D64]">
            {selectedNode.language}
          </span>
          <span className="text-[11px] font-mono text-[#94A3B8]">
            {selectedNode.kind === 'file'
              ? formatBytes(selectedNode.sizeBytes)
              : `${selectedNode.recursiveFileCount ?? 0} files • ${formatBytes(selectedNode.recursiveBytes ?? 0)}`}
          </span>

          <button
            onClick={handleCopyPath}
            title="Copy relative path"
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded bg-[#181329] hover:bg-[#251D42] text-[#A855F7] border border-[#322552] transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy Path'}</span>
          </button>
        </div>
      </div>

      {/* Center Body: Code Viewer or Directory Overview */}
      <div className="flex-1 overflow-auto bg-[#07060B]">
        {selectedNode.kind === 'directory' ? (
          /* Directory Overview */
          <div className="p-6 max-w-4xl space-y-6">
            <div className="p-4 rounded-lg bg-[#110E1D] border border-[#271E3D] flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white font-mono flex items-center gap-2">
                  <Folder className="w-4 h-4 text-[#A855F7]" />
                  <span>{selectedNode.name || 'Root Directory'}</span>
                </h3>
                <p className="text-xs font-mono text-[#94A3B8] mt-1">
                  Canonical Path: {selectedNode.path || '/'}
                </p>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <span className="text-xs text-[#64748B] block font-mono">Files</span>
                  <span className="text-sm font-bold text-[#E2E8F0] font-mono">
                    {selectedNode.recursiveFileCount ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#64748B] block font-mono">Size</span>
                  <span className="text-sm font-bold text-[#A855F7] font-mono">
                    {formatBytes(selectedNode.recursiveBytes ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Children List */}
            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider text-[#A855F7] mb-2 font-semibold">
                Direct Children ({selectedNode.children?.length ?? 0})
              </h4>
              <div className="rounded-lg border border-[#251C3D] bg-[#0E0C18] divide-y divide-[#1D172E] overflow-hidden">
                {selectedNode.children && selectedNode.children.length > 0 ? (
                  selectedNode.children.map((child) => (
                    <div
                      key={child.id}
                      onClick={() => onSelectNode(child)}
                      className="px-3.5 py-2 flex items-center justify-between hover:bg-[#1A152E] cursor-pointer transition-colors text-xs font-mono group"
                    >
                      <div className="flex items-center gap-2">
                        {child.kind === 'directory' ? (
                          <Folder className="w-3.5 h-3.5 text-[#A855F7]" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5 text-[#38BDF8]" />
                        )}
                        <span className="text-[#E2E8F0] group-hover:text-purple-300">
                          {child.name}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#64748B]">
                        {child.kind === 'directory'
                          ? `${child.recursiveFileCount ?? 0} files`
                          : formatBytes(child.sizeBytes)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-xs text-[#64748B] text-center font-mono">
                    Empty directory
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : isLoading ? (
          /* Loading State */
          <div className="h-full flex items-center justify-center text-[#A855F7] font-mono text-xs gap-2">
            <span className="w-2 h-2 rounded-full bg-[#A855F7] animate-ping" />
            <span>Reading local file...</span>
          </div>
        ) : errorMessage ? (
          /* Error State */
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
            <p className="text-xs font-mono text-amber-300 mb-1">Cannot Preview File</p>
            <p className="text-xs text-[#94A3B8] max-w-md">{errorMessage}</p>
          </div>
        ) : isBinary ? (
          /* Binary file warning */
          <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
            <FileQuestion className="w-10 h-10 text-[#8B5CF6] mb-3" />
            <p className="text-sm font-mono text-white mb-1">Binary File Detected</p>
            <p className="text-xs text-[#94A3B8] max-w-sm mb-3">
              This file contains compiled bytecode, image data, or non-text formatting.
            </p>
            <span className="text-xs font-mono px-3 py-1 rounded bg-[#1A142C] text-[#C084FC] border border-[#3A2A5E]">
              File size: {formatBytes(selectedNode.sizeBytes)}
            </span>
          </div>
        ) : content !== null ? (
          /* Live Code Preview */
          <div className="p-4 font-mono text-[12px] leading-relaxed text-[#E2E8F0] select-text">
            <div className="table w-full">
              {content.split('\n').map((line, index) => (
                <div key={index} className="table-row hover:bg-[#151124] transition-colors">
                  <span className="table-cell pr-4 py-0.5 text-right text-[#4A3D66] select-none text-[11px] w-12 font-mono">
                    {index + 1}
                  </span>
                  <span className="table-cell py-0.5 whitespace-pre font-mono">
                    {line || '\n'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
};
