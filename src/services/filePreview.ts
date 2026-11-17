import { isSensitiveTextFile, isAnalyzableText } from '../utils/fileTypes';
import { getProjectHandle } from '../storage/db';
import type { LocalDirectoryHandle, LocalFileHandle } from './projectScanner';
import type { ProjectIndex, ProjectNode } from '../domain/models';

export class FilePreviewError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_NODE'
      | 'INVALID_PATH'
      | 'SENSITIVE_BLOCKED'
      | 'BINARY_BLOCKED'
      | 'PERMISSION_REQUIRED'
      | 'FILE_NOT_FOUND'
      | 'FILE_TOO_LARGE'
      | 'HANDLE_UNAVAILABLE'
  ) {
    super(message);
    this.name = 'FilePreviewError';
  }
}

export interface FilePreviewResult {
  content: string;
  path: string;
  name: string;
  sizeBytes: number;
  language?: string;
  isTruncated: boolean;
}

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024; // 2 MB safety cap for previewer

/**
 * Realistic demo file contents for the offline demo project
 */
const DEMO_FILE_CONTENTS: Record<string, string> = {
  'docs/README.md': `# Atlas — Architectural Visualizer

Atlas is a high-performance local visualization tool for understanding complex codebase topologies in 2D and 3D.

## Features
- **Spatial 3D Hierarchy**: Circular staircase expansion driven by deterministic golden-angle placement.
- **Topological 2D Map**: Radial architectural overview matching high-density systems engineering designs.
- **Dependency Tracing**: Tarjan SCC circular dependency cycles, BFS shortest-path finder, and module in/out-degree.
- **Zero Remote Storage**: Pure client-side processing using Chromium File System Access.

## Quick Start
1. Open or import a local directory.
2. Select **Map** to explore the project structure.
3. Switch between **2D** and **3D** views in the bottom-right control panel.
4. Double-click any file to view its source or formatted markdown.
`,

  'docs/architecture.md': `# Architecture & Design Decisions

## High-Level System Layers
\`\`\`
+-------------------------------------------------------+
|                    Presentation Shell                 |
|  WorkspaceTabs · Map (2D/3D) · Structure · Inspector  |
+-------------------------------------------------------+
                           |
+-------------------------------------------------------+
|                 State Management (Zustand)            |
|       Navigation History · Active Modes · Filters     |
+-------------------------------------------------------+
                           |
+-------------------------------------------------------+
|               Incremental Analysis Engine             |
|   Lexical Parser · TsConfig Resolver · Graph Model    |
+-------------------------------------------------------+
                           |
+-------------------------------------------------------+
|               Storage & Safe File Access              |
|        Dexie IndexedDB · Local File System Handle     |
+-------------------------------------------------------+
\`\`\`

### Invariants
1. **Local-First Privacy**: Source contents are never transmitted across the network.
2. **Deterministic Layouts**: Given identical project graphs, identical spatial coordinates are produced.
3. **Graceful Degradation**: If WebGL context is lost, the system falls back directly to the interactive 2D Map.
`,

  'src/app/App.tsx': `import React, { useEffect } from 'react';
import { Router } from './Router';
import { Sidebar } from '../components/Sidebar';

export function App() {
  useEffect(() => {
    console.info('Atlas client initialized successfully.');
  }, []);

  return (
    <div className="app-container">
      <Sidebar />
      <main className="content">
        <Router />
      </main>
    </div>
  );
}
`,

  'src/app/Router.tsx': `import React, { useState } from 'react';
import { Dashboard } from '../components/Dashboard';
import { GraphView } from '../components/GraphView';

export type Route = 'dashboard' | 'graph';

export function Router() {
  const [route, setRoute] = useState<Route>('graph');

  return (
    <div className="router-view">
      {route === 'dashboard' && <Dashboard onNavigate={setRoute} />}
      {route === 'graph' && <GraphView />}
    </div>
  );
}
`,

  'src/components/Dashboard.tsx': `import React, { useEffect, useState } from 'react';
import { fetchSystemMetrics } from '../services/api';

export function Dashboard({ onNavigate }: { onNavigate: (route: 'graph') => void }) {
  const [metrics, setMetrics] = useState({ nodes: 22, edges: 10 });

  useEffect(() => {
    fetchSystemMetrics().then(setMetrics).catch(console.error);
  }, []);

  return (
    <div className="dashboard-card">
      <h2>Project Overview</h2>
      <p>Indexed {metrics.nodes} modules with {metrics.edges} resolved relationships.</p>
      <button onClick={() => onNavigate('graph')}>Open Graph Visualizer</button>
    </div>
  );
}
`,

  'src/components/Sidebar.tsx': `import React from 'react';

export function Sidebar() {
  return (
    <aside className="app-sidebar">
      <div className="brand">Atlas</div>
      <nav>
        <button className="active">Overview</button>
        <button>Structure</button>
        <button>Dependencies</button>
      </nav>
    </aside>
  );
}
`,

  'src/components/GraphView.tsx': `import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { fetchSystemMetrics } from '../services/api';

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="graph-stage">
      <Canvas camera={{ position: [0, 8, 18], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} />
      </Canvas>
    </div>
  );
}
`,

  'src/services/api.ts': `import { AuthService } from './AuthService';

export async function fetchSystemMetrics() {
  const user = AuthService.getCurrentUser();
  if (!user) throw new Error('Unauthenticated');
  return { nodes: 22, edges: 10, health: 'optimal' };
}
`,

  'src/services/AuthService.ts': `export interface UserProfile {
  id: string;
  name: string;
  role: 'admin' | 'viewer';
}

export class AuthService {
  private static currentUser: UserProfile | null = {
    id: 'user_01',
    name: 'Atlas Explorer',
    role: 'admin',
  };

  static getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }
}
`,

  'database/schema.sql': `-- Atlas Schema Definition
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metrics JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS module_cache (
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
  module_path TEXT NOT NULL,
  fingerprint VARCHAR(128) NOT NULL,
  PRIMARY KEY (project_id, module_path)
);
`,

  'tests/graph.test.ts': `import { describe, it, expect } from 'vitest';

describe('Graph Topology', () => {
  it('computes golden angle layout without overlapping coordinates', () => {
    const angle = Math.PI * (3 - Math.sqrt(5));
    expect(angle).toBeGreaterThan(2.39);
    expect(angle).toBeLessThan(2.41);
  });
});
`,

  'config/vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
});
`,
};

const MULTI_DEMO_FILE_CONTENTS: Record<string, string> = {
  'demo-helios:core/Engine.ts': `import { FrameScheduler } from './FrameScheduler';
import { ScenePipeline } from '../renderer/ScenePipeline';
import { BroadphaseGrid } from '../physics/BroadphaseGrid';

export class Engine {
  private readonly scheduler = new FrameScheduler();
  private readonly renderer = new ScenePipeline();
  private readonly physics = new BroadphaseGrid(4.0);
  private running = false;

  start(): void {
    this.running = true;
    this.scheduler.schedule('render', (dt) => {
      if (!this.running) return;
      this.physics.step(dt);
      this.renderer.renderFrame(dt);
    });
  }

  stop(): void {
    this.running = false;
  }
}
`,
  'demo-helios:core/FrameScheduler.ts': `import { EntityRegistry } from './EntityRegistry';

export type FrameTask = (deltaSeconds: number) => void;

export class FrameScheduler {
  private readonly tasks = new Map<string, FrameTask>();
  private readonly registry = new EntityRegistry();

  schedule(name: string, task: FrameTask): void {
    this.tasks.set(name, task);
  }

  tick(deltaSeconds: number): void {
    this.registry.flushPending();
    for (const task of this.tasks.values()) {
      task(deltaSeconds);
    }
  }
}
`,
  'demo-helios:core/EntityRegistry.ts': `import type { FrameScheduler } from './FrameScheduler';

export interface EntityRecord {
  id: number;
  archetype: string;
  active: boolean;
}

export class EntityRegistry {
  private entities = new Map<number, EntityRecord>();
  private nextId = 1;
  private linkedScheduler?: FrameScheduler;

  attachScheduler(scheduler: FrameScheduler): void {
    this.linkedScheduler = scheduler;
  }

  spawn(archetype: string): number {
    const id = this.nextId++;
    this.entities.set(id, { id, archetype, active: true });
    return id;
  }

  flushPending(): void {
    void this.linkedScheduler;
  }
}
`,
  'demo-helios:renderer/ScenePipeline.ts': `import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { InstanceBatch } from './InstanceBatch';

export class ScenePipeline {
  private readonly scene = new THREE.Scene();
  private readonly camera = new CameraRig();
  private readonly instances = new InstanceBatch(1024);

  renderFrame(dt: number): void {
    this.camera.update(dt);
    this.instances.syncMatrices();
    void this.scene;
  }
}
`,
  'demo-vortex:api/gateway.ts': `import React from 'react';
import { RouteTable } from './routeTable';
import { RateLimiter } from './rateLimiter';
import { TraceCollector } from '../telemetry/traceCollector';

export class VortexGateway {
  private readonly routes = new RouteTable();
  private readonly limiter = new RateLimiter({ rpm: 1200 });
  private readonly telemetry = new TraceCollector('vortex-edge');

  async handle(path: string, token: string): Promise<number> {
    if (!this.limiter.allow(token)) return 429;
    this.telemetry.recordHit(path);
    return this.routes.dispatch(path, token);
  }
}

void React;
`,
  'demo-vortex:auth/tokenVerifier.ts': `import { z } from 'zod';

const ClaimsSchema = z.object({
  sub: z.string().min(1),
  scope: z.array(z.string()),
  exp: z.number(),
});

export type VerifiedClaims = z.infer<typeof ClaimsSchema>;

export function verifyAccessToken(raw: unknown): VerifiedClaims {
  return ClaimsSchema.parse(raw);
}
`,
  'demo-vortex:config/routes.yaml': `gateway:
  name: vortex-edge
  port: 8443
routes:
  - path: /v1/telemetry
    auth: required
    rate_limit_rpm: 1200
  - path: /v1/topology
    auth: required
    rate_limit_rpm: 600
`,
};

/**
 * Safely reads a local or demo file for preview
 */
export async function readProjectFile(
  project: ProjectIndex,
  node: ProjectNode,
  userGestureHandle?: LocalDirectoryHandle
): Promise<FilePreviewResult> {
  // 1. Validate node
  if (node.kind !== 'file') {
    throw new FilePreviewError(`Cannot preview non-file node "${node.name}" (${node.kind}).`, 'INVALID_NODE');
  }

  // 2. Validate path against traversal
  const normalizedPath = node.path.replace(/\\/g, '/');
  if (
    normalizedPath.startsWith('/') ||
    normalizedPath.startsWith('../') ||
    normalizedPath.includes('/../') ||
    normalizedPath.endsWith('/..')
  ) {
    throw new FilePreviewError(`Refusing to access path with directory traversal: "${node.path}".`, 'INVALID_PATH');
  }

  // 3. Sensitive file protection
  if (isSensitiveTextFile(node.name)) {
    throw new FilePreviewError(
      `File "${node.name}" matches sensitive file safety rules (.env, private keys, certificates, or credentials) and its contents cannot be displayed.`,
      'SENSITIVE_BLOCKED'
    );
  }

  // 4. Binary file protection
  if (!isAnalyzableText(node.name)) {
    throw new FilePreviewError(
      `File "${node.name}" is an unsupported binary file or asset. Only text source and document files are previewable.`,
      'BINARY_BLOCKED'
    );
  }

  // 5. Size check against project configuration
  const maxBytes = project.analysisConfig?.maxTextFileBytes ?? MAX_PREVIEW_BYTES;
  if (node.sizeBytes > maxBytes) {
    throw new FilePreviewError(
      `File size (${(node.sizeBytes / 1024).toFixed(0)} KB) exceeds safe preview threshold (${(maxBytes / 1024).toFixed(0)} KB).`,
      'FILE_TOO_LARGE'
    );
  }

  // 6. Handle Demo project
  if (project.source === 'demo') {
    const scopedContent = MULTI_DEMO_FILE_CONTENTS[`${project.id}:${normalizedPath}`];
    const demoContent = scopedContent ?? (project.id === 'demo-atlas' ? DEMO_FILE_CONTENTS[normalizedPath] : undefined);
    if (demoContent !== undefined) {
      return {
        content: demoContent,
        path: normalizedPath,
        name: node.name,
        sizeBytes: demoContent.length,
        language: node.language,
        isTruncated: false,
      };
    }
    // Never fabricate synthetic source code for uncurated demo files
    throw new FilePreviewError(
      `Demo source content is not available for "${node.name}". Only curated demo files are previewable in offline demo mode.`,
      'FILE_NOT_FOUND'
    );
  }

  // 7. Local Project File Access
  const rootHandle = userGestureHandle ?? (await getProjectHandle(project.id));
  if (!rootHandle) {
    throw new FilePreviewError(
      `Local folder handle is not connected for project "${project.name}". Reconnect the folder to preview file contents.`,
      'HANDLE_UNAVAILABLE'
    );
  }

  // Verify permission
  if (rootHandle.queryPermission) {
    const perm = await rootHandle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      if (rootHandle.requestPermission) {
        const req = await rootHandle.requestPermission({ mode: 'read' });
        if (req !== 'granted') {
          throw new FilePreviewError(
            `Read permission for folder "${rootHandle.name}" was not granted by user.`,
            'PERMISSION_REQUIRED'
          );
        }
      } else {
        throw new FilePreviewError(
          `Permission required to read files from "${rootHandle.name}".`,
          'PERMISSION_REQUIRED'
        );
      }
    }
  }

  // Traverse path segments down to target file
  const segments = normalizedPath.split('/').filter(Boolean);
  if (!segments.length) {
    throw new FilePreviewError(`Invalid path "${node.path}".`, 'INVALID_PATH');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentDir: any = rootHandle;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const part = segments[i];
    if (currentDir.getDirectoryHandle) {
      try {
        currentDir = await currentDir.getDirectoryHandle(part, { create: false });
      } catch {
        throw new FilePreviewError(`Folder "${part}" not found along path "${node.path}".`, 'FILE_NOT_FOUND');
      }
    } else if (currentDir.values) {
      let found: LocalDirectoryHandle | null = null;
      for await (const entry of currentDir.values()) {
        if (entry.kind === 'directory' && entry.name === part) {
          found = entry as LocalDirectoryHandle;
          break;
        }
      }
      if (!found) {
        throw new FilePreviewError(`Folder "${part}" not found along path "${node.path}".`, 'FILE_NOT_FOUND');
      }
      currentDir = found;
    } else {
      throw new FilePreviewError(`Directory handle does not support traversal.`, 'HANDLE_UNAVAILABLE');
    }
  }

  const fileName = segments[segments.length - 1];
  let fileHandle: LocalFileHandle | null = null;

  if (currentDir.getFileHandle) {
    try {
      fileHandle = await currentDir.getFileHandle(fileName, { create: false });
    } catch {
      throw new FilePreviewError(`File "${fileName}" not found on disk.`, 'FILE_NOT_FOUND');
    }
  } else if (currentDir.values) {
    for await (const entry of currentDir.values()) {
      if (entry.kind === 'file' && entry.name === fileName) {
        fileHandle = entry as LocalFileHandle;
        break;
      }
    }
  }

  if (!fileHandle) {
    throw new FilePreviewError(`File "${fileName}" not found in folder.`, 'FILE_NOT_FOUND');
  }

  const file = await fileHandle.getFile();
  if (file.size > maxBytes) {
    throw new FilePreviewError(
      `File size (${(file.size / 1024).toFixed(0)} KB) exceeds safe preview threshold (${(maxBytes / 1024).toFixed(0)} KB).`,
      'FILE_TOO_LARGE'
    );
  }

  const content = await file.text();

  return {
    content,
    path: normalizedPath,
    name: node.name,
    sizeBytes: file.size,
    language: node.language,
    isTruncated: false,
  };
}
