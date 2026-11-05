export type NodeKind = 'project' | 'directory' | 'file';
export type AnalysisStatus = 'analyzed' | 'metadata-only' | 'skipped-large' | 'skipped-sensitive';
export type AnalysisCategory = 'source' | 'configuration' | 'documentation' | 'test';

export type DependencyType = 'static-import' | 'side-effect' | 'export-from' | 'dynamic-import' | 'require';

export interface RawSpecifier {
  specifier: string;
  type: DependencyType;
}

export const SCANNER_ANALYSIS_VERSION = 1;
export const DEPENDENCY_PARSER_VERSION = 2;
export const DEPENDENCY_RESOLVER_VERSION = 2;

export interface ProjectAnalysisConfig {
  selectedCategories: AnalysisCategory[];
  maxTextFileBytes: number;
  maxEntries: number;
  scannerAnalysisVersion: number;
  dependencyParserVersion: number;
  dependencyResolverVersion: number;
}

export interface DependencyEdge {
  id: string;
  sourceId: string;
  sourcePath: string;
  targetId?: string;
  targetPath: string;
  targetResolvedPath?: string;
  specifier: string;
  type: DependencyType;
  isExternal: boolean;
  isResolved: boolean;
}

export interface DependencyGraphData {
  edges: DependencyEdge[];
  circularDependencies: string[][];
  circularCycles?: string[][];
  externalPackages: string[];
}

export interface ProjectNode {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  path: string;
  kind: NodeKind;
  extension?: string;
  language?: string;
  sizeBytes: number;
  loc: number;
  modifiedAt?: number;
  depth: number;
  position?: [number, number, number];
  analysisStatus?: AnalysisStatus;
  descendantFiles?: number;
  descendantFolders?: number;
  outgoingCount?: number;
  incomingCount?: number;
  rawSpecifiers?: RawSpecifier[];
  dependencyParserVersion?: number;
}

export interface LanguageStat {
  language: string;
  files: number;
  loc: number;
  percentage: number;
}

export interface ProjectMetrics {
  files: number;
  folders: number;
  totalLoc: number;
  indexedBytes: number;
  analyzedTextBytes: number;
  analyzedFiles: number;
  metadataOnlyFiles: number;
  skippedLargeFiles: number;
  skippedSensitiveFiles: number;
  languages: LanguageStat[];
  dependencyEdges: number;
  externalPackagesCount?: number;
  circularDependenciesCount?: number;
}

export interface ScanWarning {
  path: string;
  message: string;
}

export interface ProjectIndex {
  schemaVersion: 2 | 3;
  id: string;
  name: string;
  rootPathLabel: string;
  createdAt: number;
  updatedAt: number;
  source: 'demo' | 'local';
  nodes: ProjectNode[];
  metrics: ProjectMetrics;
  warnings: ScanWarning[];
  dependencies?: DependencyGraphData;
  analysisConfig?: ProjectAnalysisConfig;
}

export interface NexusPreferences {
  maxTextFileBytes: number;
  maxEntries: number;
  analyzeSource: boolean;
  analyzeConfiguration: boolean;
  analyzeDocumentation: boolean;
  analyzeTests: boolean;
  reducedEffects: boolean;
}

export const DEFAULT_PREFERENCES: NexusPreferences = {
  maxTextFileBytes: 2 * 1024 * 1024,
  maxEntries: 50_000,
  analyzeSource: true,
  analyzeConfiguration: true,
  analyzeDocumentation: true,
  analyzeTests: true,
  reducedEffects: false,
};

export type AppPage = 'projects' | 'graph' | 'structure' | 'analytics' | 'dependencies' | 'search' | 'settings';
