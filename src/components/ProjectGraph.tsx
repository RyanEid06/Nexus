import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AlertTriangle, Layers, MapPin } from 'lucide-react';
import {
  buildGraphIndex,
  computeGraphViewport,
  resolveBoundedHoverDependencies,
} from '../services/graphViewport';
import { computeMultiProjectConstellation } from '../services/constellation';
import { loadPreferences } from '../storage/db';
import { DEFAULT_PREFERENCES, type ProjectNode } from '../domain/models';
import { useAppStore, type RelationshipFilterMode } from '../store/useAppStore';
import { CLUSTER_COLORS, getDirectoryColor } from '../utils/fileTypes';

interface ProjectedLabel {
  id: string;
  text: string;
  subtext: string;
  x: number;
  y: number;
  selected: boolean;
  kind: 'project' | 'directory' | 'file' | 'bridge' | 'overflow';
  accent?: string;
}

function hashString(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  }
  return result >>> 0;
}

function topLevelAncestor(node: ProjectNode, byId: Map<string, ProjectNode>): ProjectNode {
  let current = node;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || parent.kind === 'project') break;
    current = parent;
  }
  return current;
}

function detectSoftwareGl(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const rendererName = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
      if (/SwiftShader|llvmpipe|Softpipe|Mesa/i.test(rendererName)) return true;
    }
    const vendorStr = String(gl.getParameter(gl.RENDERER) ?? '');
    if (/SwiftShader|llvmpipe|Softpipe|Mesa/i.test(vendorStr)) return true;
  } catch {
    return false;
  }
  return false;
}

function afterDrawSync(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  if ('fenceSync' in gl && typeof gl.fenceSync === 'function') {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (sync) {
      gl.flush();
      gl.deleteSync(sync);
    }
  }
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
}

function createDatumPlaneGroup(radius: number, floorY: number, accentHex: string): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, floorY, 0);

  const grid = new THREE.GridHelper(radius * 2.4, 28, '#1E293B', '#111827');
  const gridMat = grid.material as THREE.Material | THREE.Material[];
  if (Array.isArray(gridMat)) {
    gridMat.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.55;
      m.depthWrite = false;
    });
  } else {
    gridMat.transparent = true;
    gridMat.opacity = 0.55;
    gridMat.depthWrite = false;
  }
  group.add(grid);

  // Subtle concentric CAD telemetry rings
  const ringRadii = [radius * 0.35, radius * 0.68, radius];
  for (let i = 0; i < ringRadii.length; i += 1) {
    const r = ringRadii[i];
    const geo = new THREE.RingGeometry(r - 0.025, r + 0.025, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: i === 0 ? accentHex : '#334155',
      transparent: true,
      opacity: i === 0 ? 0.32 : 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02 + i * 0.002;
    group.add(ring);
  }

  return group;
}

function createProjectCoreGroup(
  accentHex: string,
  selected: boolean,
  hovered: boolean
): THREE.Group {
  const group = new THREE.Group();
  const s = selected ? 1.15 : hovered ? 1.07 : 1;
  group.scale.setScalar(s);

  // 1. Machined dark obsidian stepped plinth
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.92, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: '#0F172A', metalness: 0.85, roughness: 0.3 })
  );
  plinth.position.y = -0.58;
  group.add(plinth);

  // 2. Faceted dark octahedron chassis
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.62, 0),
    new THREE.MeshStandardMaterial({
      color: '#0F172A',
      emissive: accentHex,
      emissiveIntensity: selected ? 0.65 : 0.28,
      metalness: 0.78,
      roughness: 0.22,
    })
  );
  group.add(core);

  // 3. Inner luminous energy heart
  const heart = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.32, 0),
    new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: selected ? 1.5 : 0.9,
      roughness: 0.15,
      metalness: 0.2,
    })
  );
  group.add(heart);

  // 4. Tilted machined orbital gimbal ring
  const gimbal = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.035, 12, 64),
    new THREE.MeshStandardMaterial({
      color: selected ? '#E0F2FE' : accentHex,
      emissive: accentHex,
      emissiveIntensity: selected ? 0.95 : 0.45,
      metalness: 0.85,
      roughness: 0.2,
    })
  );
  gimbal.rotation.set(Math.PI / 2.6, 0.35, 0);
  group.add(gimbal);

  return group;
}

function createDirectoryHubGroup(
  accentHex: string,
  descendantFiles: number,
  selected: boolean,
  hovered: boolean
): THREE.Group {
  const group = new THREE.Group();
  const s = selected ? 1.18 : hovered ? 1.09 : 1;
  group.scale.setScalar(s);

  const height = Math.min(0.46, 0.22 + Math.log10(Math.max(1, descendantFiles) + 1) * 0.12);

  // 1. Hexagonal metallic pedestal
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.56, height, 6),
    new THREE.MeshStandardMaterial({
      color: '#161F30',
      emissive: accentHex,
      emissiveIntensity: selected ? 0.45 : 0.14,
      metalness: 0.75,
      roughness: 0.32,
    })
  );
  group.add(base);

  // 2. Top illuminated recessed collar ring
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.43, 0.03, 10, 6),
    new THREE.MeshStandardMaterial({
      color: selected ? '#FFFFFF' : accentHex,
      emissive: selected ? '#22D3EE' : accentHex,
      emissiveIntensity: selected ? 1.2 : 0.55,
      metalness: 0.6,
      roughness: 0.25,
    })
  );
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = Math.PI / 6;
  collar.position.y = height / 2 + 0.01;
  group.add(collar);

  // 3. Central obsidian optical core disc
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.04, 6),
    new THREE.MeshStandardMaterial({ color: '#090D16', metalness: 0.9, roughness: 0.2 })
  );
  cap.position.y = height / 2 + 0.015;
  group.add(cap);

  return group;
}

function createFileModuleGroup(
  accentHex: string,
  loc: number,
  selected: boolean,
  hovered: boolean
): THREE.Group {
  const group = new THREE.Group();
  const sizeScale = Math.min(1.45, 0.85 + Math.log10(Math.max(10, loc)) * 0.22);
  const s = sizeScale * (selected ? 1.32 : hovered ? 1.15 : 1);
  group.scale.setScalar(s);

  // 1. Machined base wafer
  const wafer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.28, 0.08, 4),
    new THREE.MeshStandardMaterial({ color: '#0F172A', metalness: 0.8, roughness: 0.3 })
  );
  wafer.position.y = -0.14;
  group.add(wafer);

  // 2. Crystalline octahedron module
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 0),
    new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: selected ? 1.35 : hovered ? 0.75 : 0.35,
      metalness: 0.45,
      roughness: 0.22,
    })
  );
  crystal.position.y = 0.06;
  group.add(crystal);

  return group;
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('WebGL rendering error caught by boundary:', error, errorInfo);
    this.props.onFallback();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export function ProjectGraph({
  active = true,
  relationshipMode = 'hierarchy',
}: {
  active?: boolean;
  relationshipMode?: RelationshipFilterMode;
}) {
  const project = useAppStore((s) => s.project);
  const workspaceProjects = useAppStore((s) => s.workspaceProjects);
  const constellationProjectIds = useAppStore((s) => s.constellationProjectIds);
  const constellationMode = useAppStore((s) => s.constellationMode);

  const selectedId = useAppStore((s) => s.selectedNodeId);
  const expandedNodeIds = useAppStore((s) => s.expandedNodeIds);
  const mapFocusNodeId = useAppStore((s) => s.mapFocusNodeId);
  const setPage = useAppStore((s) => s.setPage);
  const setMapMode = useAppStore((s) => s.setMapMode);

  const [reducedEffects, setReducedEffects] = useState(DEFAULT_PREFERENCES.reducedEffects);
  const [hasWebGLError, setHasWebGLError] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);

  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isActive = true;
    void loadPreferences().then((preferences) => {
      if (isActive) setReducedEffects(preferences.reducedEffects);
    });
    return () => {
      isActive = false;
    };
  }, []);

  const constellationProjects = useMemo(() => {
    if (!constellationMode) return [];
    const selectedSet = new Set(constellationProjectIds);
    const list = workspaceProjects.filter((p) => selectedSet.has(p.id));
    return list.length >= 2 ? list : workspaceProjects;
  }, [constellationMode, workspaceProjects, constellationProjectIds]);

  const constellation = useMemo(() => {
    if (!constellationMode || constellationProjects.length < 2) return null;
    return computeMultiProjectConstellation(constellationProjects);
  }, [constellationMode, constellationProjects]);

  const graphIndex = useMemo(() => (project ? buildGraphIndex(project) : null), [project]);

  const viewport = useMemo(() => {
    if (!project || constellationMode) return null;
    return computeGraphViewport({
      project,
      graphIndex: graphIndex ?? undefined,
      mapFocusNodeId,
      selectedNodeId: selectedId,
      expandedNodeIds,
      relationshipMode,
    });
  }, [project, graphIndex, constellationMode, mapFocusNodeId, selectedId, expandedNodeIds, relationshipMode]);

  const allById = useMemo(
    () => graphIndex?.byId ?? new Map((project?.nodes ?? []).map((node) => [node.id, node])),
    [graphIndex, project]
  );

  const { visibleDependencyEdges, visibleOutgoingByNodeId, visibleIncomingByNodeId } = useMemo(() => {
    if (!viewport || !project) {
      return {
        visibleDependencyEdges: [],
        visibleOutgoingByNodeId: new Map(),
        visibleIncomingByNodeId: new Map(),
      };
    }
    if (!hoveredId) {
      return {
        visibleDependencyEdges: viewport.visibleDependencyEdges,
        visibleOutgoingByNodeId: viewport.visibleOutgoingByNodeId,
        visibleIncomingByNodeId: viewport.visibleIncomingByNodeId,
      };
    }
    return resolveBoundedHoverDependencies(viewport, {
      hoveredNodeId: hoveredId,
      selectedNodeId: selectedId,
      focusNodeId: viewport.focusNode.id,
    });
  }, [viewport, project, hoveredId, selectedId]);

  const activeHighlightedIds = useMemo(() => {
    const targetId = hoveredId ?? selectedId;
    if (!targetId || !viewport || !project) return null;

    const set = new Set<string>();
    set.add(targetId);

    const node = viewport.visibleNodesMap.get(targetId);
    if (node?.parentId) set.add(node.parentId);

    for (const item of viewport.visibleNodes) {
      if (item.parentId === targetId) set.add(item.id);
    }

    const outgoing = visibleOutgoingByNodeId.get(targetId) ?? [];
    for (const item of outgoing) set.add(item.targetId);

    const incoming = visibleIncomingByNodeId.get(targetId) ?? [];
    for (const item of incoming) set.add(item.sourceId);

    return set;
  }, [hoveredId, selectedId, viewport, project, visibleOutgoingByNodeId, visibleIncomingByNodeId]);

  // Persistent Three.js engine refs
  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    contentGroup: THREE.Group;
    pickables: THREE.Object3D[];
    labelTargets: Array<{
      id: string;
      text: string;
      subtext: string;
      position: THREE.Vector3;
      selected: boolean;
      kind: ProjectedLabel['kind'];
      accent?: string;
    }>;
    positionsMap: Map<string, [number, number, number]>;
    targetCamPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    isTransitioning: boolean;
    isSoftwareGl: boolean;
    dirtyRender: boolean;
    rafId: number | null;
    requestRender: () => void;
    projectLabels: () => void;
  } | null>(null);

  // Initialize Three.js WebGLRenderer once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || hasWebGLError) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !reducedEffects,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch (err) {
      console.warn('Unable to initialize WebGLRenderer:', err);
      setHasWebGLError(true);
      return;
    }

    const isSwGl = detectSoftwareGl(renderer);
    const effectiveReduced = reducedEffects || isSwGl;

    renderer.setPixelRatio(effectiveReduced ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;

    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090F');
    scene.fog = new THREE.Fog('#07090F', 28, 82);

    // PMREM IBL Environment reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    // Crisp Studio Lighting Rig
    scene.add(new THREE.AmbientLight('#1E293B', 0.9));
    const keyLight = new THREE.DirectionalLight('#F8FAFC', 1.55);
    keyLight.position.set(14, 24, 16);
    scene.add(keyLight);

    const cyanRim = new THREE.DirectionalLight('#22D3EE', 1.1);
    cyanRim.position.set(-16, 10, -14);
    scene.add(cyanRim);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 160);
    camera.position.set(0, 9.5, 16.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !effectiveReduced;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.5;
    controls.maxDistance = 68;
    controls.maxPolarAngle = Math.PI * 0.485; // Prevent camera clipping below datum plane

    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const tempVec = new THREE.Vector3();

    let lastLabelSyncTime = 0;

    const projectLabels = () => {
      const eng = engineRef.current;
      if (!eng || !mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nextLabels: ProjectedLabel[] = [];
      for (const target of eng.labelTargets) {
        tempVec.copy(target.position).project(eng.camera);
        if (tempVec.z > 1 || tempVec.z < -1) continue;
        const sx = (tempVec.x * 0.5 + 0.5) * rect.width;
        const sy = (-tempVec.y * 0.5 + 0.5) * rect.height;
        if (sx < -60 || sx > rect.width + 60 || sy < -30 || sy > rect.height + 30) continue;

        nextLabels.push({
          id: target.id,
          text: target.text,
          subtext: target.subtext,
          x: sx,
          y: sy,
          selected: target.selected,
          kind: target.kind,
          accent: target.accent,
        });
      }
      setProjectedLabels(nextLabels);
    };

    const engState = {
      renderer,
      scene,
      camera,
      controls,
      contentGroup,
      pickables: [] as THREE.Object3D[],
      labelTargets: [] as Array<{
        id: string;
        text: string;
        subtext: string;
        position: THREE.Vector3;
        selected: boolean;
        kind: ProjectedLabel['kind'];
        accent?: string;
      }>,
      positionsMap: new Map<string, [number, number, number]>(),
      targetCamPos: new THREE.Vector3(0, 9.5, 16.5),
      targetLookAt: new THREE.Vector3(0, 0, 0),
      isTransitioning: false,
      isSoftwareGl: effectiveReduced,
      dirtyRender: true,
      rafId: null as number | null,
      requestRender: () => {},
      projectLabels,
    };

    let prevTime = performance.now();

    const tick = (now: number) => {
      engState.rafId = null;
      const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
      prevTime = now;

      let needsMoreFrames = false;

      if (engState.isTransitioning) {
        if (engState.isSoftwareGl) {
          camera.position.copy(engState.targetCamPos);
          controls.target.copy(engState.targetLookAt);
          engState.isTransitioning = false;
        } else {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, engState.targetCamPos.x, 7.5, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, engState.targetCamPos.y, 7.5, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, engState.targetCamPos.z, 7.5, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, engState.targetLookAt.x, 7.5, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, engState.targetLookAt.y, 7.5, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, engState.targetLookAt.z, 7.5, dt);

          const distCam = camera.position.distanceTo(engState.targetCamPos);
          const distTarget = controls.target.distanceTo(engState.targetLookAt);
          if (distCam < 0.04 && distTarget < 0.02) {
            engState.isTransitioning = false;
          } else {
            needsMoreFrames = true;
          }
        }
        engState.dirtyRender = true;
      }

      if (controls.update()) {
        engState.dirtyRender = true;
        if (!engState.isSoftwareGl) needsMoreFrames = true;
      }

      if (engState.dirtyRender) {
        engState.dirtyRender = false;
        renderer.render(scene, camera);
        if (isSwGl) {
          afterDrawSync(renderer.getContext());
        }
        if (now - lastLabelSyncTime > 32) {
          lastLabelSyncTime = now;
          projectLabels();
        }
      }

      if (needsMoreFrames) {
        engState.requestRender();
      }
    };

    engState.requestRender = () => {
      engState.dirtyRender = true;
      if (engState.rafId === null) {
        prevTime = performance.now();
        engState.rafId = requestAnimationFrame(tick);
      }
    };

    engineRef.current = engState;

    const onControlStart = () => {
      engState.isTransitioning = false;
      engState.requestRender();
    };
    const onControlChange = () => {
      engState.requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    // ResizeObserver for crisp viewport sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, entry.contentRect.width);
        const h = Math.max(1, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        engState.requestRender();
      }
    });
    resizeObserver.observe(mount);

    // Pointer interaction (Hover, Click, Double-Click)
    let pointerDown = { x: 0, y: 0 };
    const pickAtPointer = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(engState.pickables, true);
      for (const hit of hits) {
        let curr: THREE.Object3D | null = hit.object;
        while (curr && !curr.userData?.nodeId) {
          curr = curr.parent;
        }
        if (curr?.userData?.nodeId) {
          return curr.userData as {
            nodeId: string;
            sourceNodeId?: string;
            projectId?: string;
            kind: 'project' | 'directory' | 'file' | 'overflow' | 'bridge';
          };
        }
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const hit = pickAtPointer(e.clientX, e.clientY);
      const nextHover = hit?.nodeId ?? null;
      renderer.domElement.style.cursor = nextHover ? 'pointer' : 'grab';
      setHoveredId((prev) => (prev === nextHover ? prev : nextHover));
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
      if (moved > 5) return; // Dragging camera, do not trigger click
      const hit = pickAtPointer(e.clientX, e.clientY);
      const store = useAppStore.getState();

      if (!hit) {
        if (!store.constellationMode) {
          store.selectNode(null);
        }
        return;
      }

      if (hit.kind === 'overflow') {
        store.selectNode(hit.sourceNodeId ?? hit.nodeId);
        store.setPage('structure');
        return;
      }

      if (hit.kind === 'bridge') return;

      if (store.constellationMode && hit.projectId) {
        if (hit.projectId !== store.project?.id) {
          store.switchProject(hit.projectId, 'graph');
          store.setConstellationMode(true);
        }
        store.selectNode(hit.sourceNodeId ?? hit.nodeId);
      } else {
        store.selectNode(hit.nodeId);
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      const hit = pickAtPointer(e.clientX, e.clientY);
      if (!hit) return;
      const store = useAppStore.getState();

      if (store.constellationMode && hit.projectId) {
        store.switchProject(hit.projectId, 'graph');
        if (hit.kind === 'directory' && hit.sourceNodeId) {
          store.drillDownNode(hit.sourceNodeId);
        } else if (hit.kind === 'file' && hit.sourceNodeId) {
          store.openFileViewer(hit.sourceNodeId);
        }
        return;
      }

      if (hit.kind === 'directory') {
        store.drillDownNode(hit.nodeId);
      } else if (hit.kind === 'file') {
        store.openFileViewer(hit.nodeId);
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setHasWebGLError(true);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    engState.requestRender();

    return () => {
      if (engState.rafId !== null) cancelAnimationFrame(engState.rafId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      disposeObject3D(contentGroup);
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      engineRef.current = null;
    };
  }, [reducedEffects, hasWebGLError]);

  // Synchronize scene geometry whenever graph state / hover / selection / constellation changes
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !active) return;

    disposeObject3D(eng.contentGroup);
    eng.contentGroup.clear();
    eng.pickables = [];
    eng.labelTargets = [];
    eng.positionsMap.clear();

    // ==================== MULTI-PROJECT CONSTELLATION 3D ====================
    if (constellation) {
      const floorY = -2.2;
      eng.contentGroup.add(createDatumPlaneGroup(16, floorY, '#22D3EE'));

      // Project Orbital Rings on Datum Floor
      for (const proj of constellation.projects) {
        const ringGeo = new THREE.RingGeometry(proj.radius3D - 0.04, proj.radius3D + 0.04, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: proj.projectId === project?.id ? proj.accentColor : '#475569',
          transparent: true,
          opacity: proj.projectId === project?.id ? 0.65 : 0.3,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(proj.center3D[0], floorY + 0.025, proj.center3D[2]);
        eng.contentGroup.add(ringMesh);
      }

      // Render Constellation Nodes + Vertical Ground Stems
      for (const cNode of constellation.nodes) {
        const [x, y, z] = cNode.pos3D;
        eng.positionsMap.set(cNode.id, [x, y, z]);
        const isActiveProj = cNode.projectId === project?.id;
        const isSelected = isActiveProj && cNode.sourceNode.id === selectedId;
        const isHov = cNode.id === hoveredId;

        let group: THREE.Group;
        if (cNode.kind === 'project') {
          group = createProjectCoreGroup(cNode.color, isSelected || isActiveProj, isHov);
          eng.labelTargets.push({
            id: cNode.id,
            text: cNode.label,
            subtext: cNode.subtitle,
            position: new THREE.Vector3(x, y + 1.25, z),
            selected: isActiveProj,
            kind: 'project',
            accent: cNode.color,
          });
        } else if (cNode.kind === 'directory') {
          group = createDirectoryHubGroup(cNode.color, cNode.sourceNode.descendantFiles ?? 0, isSelected, isHov);
          if (isSelected || isHov) {
            eng.labelTargets.push({
              id: cNode.id,
              text: cNode.label,
              subtext: cNode.subtitle,
              position: new THREE.Vector3(x, y + 0.72, z),
              selected: isSelected,
              kind: 'directory',
              accent: cNode.color,
            });
          }
        } else {
          group = createFileModuleGroup(cNode.color, cNode.sourceNode.loc, isSelected, isHov);
          if (isSelected || isHov) {
            eng.labelTargets.push({
              id: cNode.id,
              text: cNode.label,
              subtext: cNode.subtitle,
              position: new THREE.Vector3(x, y + 0.55, z),
              selected: isSelected,
              kind: 'file',
              accent: cNode.color,
            });
          }
        }

        group.position.set(x, y, z);
        group.userData = {
          nodeId: cNode.id,
          sourceNodeId: cNode.sourceNode.id,
          projectId: cNode.projectId,
          kind: cNode.kind,
        };
        eng.contentGroup.add(group);
        eng.pickables.push(group);

        // Ground stem
        const stemGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, y - 0.15, z),
          new THREE.Vector3(x, floorY + 0.02, z),
        ]);
        const stemMat = new THREE.LineBasicMaterial({
          color: cNode.color,
          transparent: true,
          opacity: cNode.kind === 'project' ? 0.35 : 0.16,
        });
        eng.contentGroup.add(new THREE.Line(stemGeo, stemMat));
      }

      // Shared External Package Bridges
      for (const bridge of constellation.bridges) {
        const [bx, by, bz] = bridge.pos3D;
        const bridgeGroup = new THREE.Group();
        bridgeGroup.position.set(bx, by, bz);

        const core = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32, 0),
          new THREE.MeshStandardMaterial({
            color: '#22D3EE',
            emissive: '#0EA5E9',
            emissiveIntensity: 0.9,
            metalness: 0.7,
            roughness: 0.2,
          })
        );
        bridgeGroup.add(core);
        bridgeGroup.userData = { nodeId: `pkg::${bridge.packageName}`, kind: 'bridge' };
        eng.contentGroup.add(bridgeGroup);
        eng.pickables.push(bridgeGroup);

        eng.labelTargets.push({
          id: `pkg::${bridge.packageName}`,
          text: bridge.packageName,
          subtext: `${bridge.usageCount}x shared`,
          position: new THREE.Vector3(bx, by + 0.55, bz),
          selected: false,
          kind: 'bridge',
          accent: '#22D3EE',
        });
      }

      // Edges
      for (const edge of constellation.edges) {
        const sNode = constellation.nodeById.get(edge.sourceId);
        if (!sNode) continue;

        if (edge.kind === 'bridge') {
          const pkgName = edge.targetId.replace('pkg::', '');
          const bridge = constellation.bridges.find((b) => b.packageName === pkgName);
          if (!bridge) continue;
          const p1 = new THREE.Vector3(...sNode.pos3D);
          const p2 = new THREE.Vector3(...bridge.pos3D);
          const mid = p1.clone().add(p2).multiplyScalar(0.5);
          mid.y += 1.0;
          const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
          const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(18));
          const lineMat = new THREE.LineBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0.65 });
          eng.contentGroup.add(new THREE.Line(lineGeo, lineMat));
        } else {
          const tNode = constellation.nodeById.get(edge.targetId);
          if (!tNode) continue;
          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...sNode.pos3D),
            new THREE.Vector3(...tNode.pos3D),
          ]);
          const lineMat = new THREE.LineBasicMaterial({ color: edge.color, transparent: true, opacity: 0.42 });
          eng.contentGroup.add(new THREE.Line(lineGeo, lineMat));
        }
      }

      eng.requestRender();
      eng.projectLabels();
      return;
    }

    // ==================== SINGLE PROJECT 3D SCENE ====================
    if (!project || !viewport) return;

    let minY = -2.0;
    for (const pos of viewport.positions3D.values()) {
      minY = Math.min(minY, pos[1]);
    }
    const floorY = minY - 1.35;
    eng.contentGroup.add(createDatumPlaneGroup(12, floorY, '#22D3EE'));

    const showHierarchy = relationshipMode === 'hierarchy' || relationshipMode === 'both';
    const showDependencies = relationshipMode === 'dependencies' || relationshipMode === 'both';

    // 1. Structural Hierarchy Edges
    if (showHierarchy) {
      for (const edge of viewport.hierarchyEdges) {
        const p1 = viewport.positions3D.get(edge.sourceId);
        const p2 = viewport.positions3D.get(edge.targetId);
        if (!p1 || !p2) continue;

        const isHighlighted = Boolean(
          activeHighlightedIds && activeHighlightedIds.has(edge.sourceId) && activeHighlightedIds.has(edge.targetId)
        );
        const isDimmed = Boolean(activeHighlightedIds && !isHighlighted);

        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...p1),
          new THREE.Vector3(...p2),
        ]);
        const mat = new THREE.LineBasicMaterial({
          color: isHighlighted ? '#22D3EE' : edge.isOverflow ? '#64748B' : '#334155',
          transparent: true,
          opacity: isDimmed ? 0.14 : isHighlighted ? 0.95 : 0.65,
        });
        eng.contentGroup.add(new THREE.Line(geo, mat));
      }
    }

    // 2. Curved Dependency Arcs with Directional Cones
    if (showDependencies) {
      const focusTargetId = hoveredId ?? selectedId;
      for (const dep of visibleDependencyEdges) {
        const p1 = viewport.positions3D.get(dep.sourceId);
        const p2 = viewport.positions3D.get(dep.targetId);
        if (!p1 || !p2) continue;

        const v1 = new THREE.Vector3(...p1);
        const v2 = new THREE.Vector3(...p2);
        const dist = v1.distanceTo(v2);
        const mid = v1.clone().add(v2).multiplyScalar(0.5);
        mid.y += Math.min(Math.max(0.85, dist * 0.36), 3.6);

        const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);
        const points = curve.getPoints(20);
        const isHighlighted = Boolean(
          activeHighlightedIds && activeHighlightedIds.has(dep.sourceId) && activeHighlightedIds.has(dep.targetId)
        );
        const isDimmed = Boolean(activeHighlightedIds && !isHighlighted);
        const isIncoming = focusTargetId && dep.targetId === focusTargetId;
        const arcColor = isIncoming ? '#F59E0B' : '#22D3EE';

        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
          color: arcColor,
          transparent: true,
          opacity: isDimmed ? 0.14 : isHighlighted ? 0.98 : 0.72,
        });
        eng.contentGroup.add(new THREE.Line(geo, mat));

        // Directional Arrowhead Cone near t=0.86 along curve
        const tipPos = curve.getPoint(0.86);
        const tangent = curve.getTangent(0.86).normalize();
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(isHighlighted ? 0.09 : 0.065, 0.24, 8),
          new THREE.MeshBasicMaterial({
            color: arcColor,
            transparent: true,
            opacity: isDimmed ? 0.2 : 0.92,
          })
        );
        cone.position.copy(tipPos);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        eng.contentGroup.add(cone);
      }
    }

    // 3. Visible Nodes + Ground Elevation Stems
    for (const node of viewport.visibleNodes) {
      const pos = viewport.positions3D.get(node.id);
      if (!pos) continue;
      eng.positionsMap.set(node.id, pos);

      const cluster = topLevelAncestor(node, allById);
      const color =
        node.kind === 'project'
          ? '#22D3EE'
          : node.kind === 'directory'
          ? getDirectoryColor(node.name)
          : CLUSTER_COLORS[hashString(cluster.path) % CLUSTER_COLORS.length];

      const isSelected = node.id === selectedId;
      const isHov = node.id === hoveredId;
      const isFocusRoot = node.id === viewport.focusNode.id;

      let group: THREE.Group;
      let labelHeightOffset = 0.7;

      if (node.kind === 'project' || isFocusRoot) {
        group = createProjectCoreGroup(color, isSelected, isHov);
        labelHeightOffset = 1.25;
      } else if (node.kind === 'directory') {
        group = createDirectoryHubGroup(color, node.descendantFiles ?? 0, isSelected, isHov);
        labelHeightOffset = 0.72;
      } else {
        group = createFileModuleGroup(color, node.loc, isSelected, isHov);
        labelHeightOffset = 0.55;
      }

      group.position.set(pos[0], pos[1], pos[2]);
      group.userData = {
        nodeId: node.id,
        kind: node.kind,
      };
      eng.contentGroup.add(group);
      eng.pickables.push(group);

      // Vertical grounding stem & datum contact pad
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pos[0], pos[1] - 0.22, pos[2]),
        new THREE.Vector3(pos[0], floorY + 0.02, pos[2]),
      ]);
      const stemMat = new THREE.LineBasicMaterial({
        color: isSelected ? '#22D3EE' : color,
        transparent: true,
        opacity: isFocusRoot || isSelected ? 0.35 : 0.14,
      });
      eng.contentGroup.add(new THREE.Line(stemGeo, stemMat));

      const showAmbientLabel =
        node.kind === 'directory'
          ? eng.labelTargets.length < 14
          : viewport.visibleNodes.length <= 16 && eng.labelTargets.length < 14;

      if (isFocusRoot || isSelected || isHov || showAmbientLabel) {
        eng.labelTargets.push({
          id: node.id,
          text: node.kind === 'directory' ? `${node.name}/` : node.name,
          subtext:
            node.kind === 'project'
              ? `${project.metrics.files} files`
              : node.kind === 'directory'
              ? `${node.descendantFiles ?? 0} files`
              : `${node.loc} loc`,
          position: new THREE.Vector3(pos[0], pos[1] + labelHeightOffset, pos[2]),
          selected: isSelected,
          kind: node.kind,
          accent: color,
        });
      }
    }

    // 4. Overflow Nodes
    for (const overflow of viewport.overflowNodes) {
      const pos = viewport.positions3D.get(overflow.id);
      if (!pos) continue;
      eng.positionsMap.set(overflow.id, pos);

      const ovGroup = new THREE.Group();
      const sphere = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.26, 1),
        new THREE.MeshStandardMaterial({
          color: '#38BDF8',
          emissive: '#0EA5E9',
          emissiveIntensity: 0.75,
          roughness: 0.25,
        })
      );
      ovGroup.add(sphere);
      ovGroup.position.set(pos[0], pos[1], pos[2]);
      ovGroup.userData = {
        nodeId: overflow.id,
        sourceNodeId: overflow.parentId,
        kind: 'overflow',
      };
      eng.contentGroup.add(ovGroup);
      eng.pickables.push(ovGroup);

      eng.labelTargets.push({
        id: overflow.id,
        text: overflow.label,
        subtext: 'Open Structure',
        position: new THREE.Vector3(pos[0], pos[1] + 0.55, pos[2]),
        selected: false,
        kind: 'overflow',
        accent: '#38BDF8',
      });
    }

    eng.requestRender();
    eng.projectLabels();
  }, [
    active,
    project,
    viewport,
    constellation,
    selectedId,
    hoveredId,
    relationshipMode,
    visibleDependencyEdges,
    activeHighlightedIds,
    allById,
  ]);

  // Camera toolbar action listener (fit / focus / reset) and auto-fit on project or mode switch
  const lastCamFitKeyRef = useRef<string>('');
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !active) return;

    const fitScene = () => {
      if (eng.positionsMap.size === 0) return;
      const box = new THREE.Box3();
      for (const pos of eng.positionsMap.values()) {
        box.expandByPoint(new THREE.Vector3(...pos));
      }
      if (box.isEmpty()) return;
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 7);
      const dist = Math.max(10, (maxDim / 2) / Math.tan((eng.camera.fov * Math.PI) / 360) * 1.45);
      eng.targetLookAt.copy(center);
      eng.targetCamPos.set(center.x + dist * 0.28, center.y + dist * 0.52, center.z + dist * 0.85);
      eng.isTransitioning = true;
      eng.requestRender();
    };

    const sig = constellation
      ? `constellation:${constellation.projects.map((p) => p.projectId).join(',')}`
      : `single:${project?.id ?? ''}:${viewport?.focusNode.id ?? ''}`;

    if (sig !== lastCamFitKeyRef.current) {
      lastCamFitKeyRef.current = sig;
      fitScene();
    }

    const handle3DAction = (e: CustomEvent<{ action: string; nodeId?: string; targetMode?: string }>) => {
      if (!active || !engineRef.current) return;
      if (e.detail.targetMode && e.detail.targetMode !== '3d') return;

      if (e.detail.action === 'reset') {
        eng.targetLookAt.set(0, 0, 0);
        eng.targetCamPos.set(0, 9.5, 16.5);
        eng.isTransitioning = true;
        eng.requestRender();
      } else if (e.detail.action === 'fit') {
        fitScene();
      } else if (e.detail.action === 'focus' && e.detail.nodeId) {
        const pos = eng.positionsMap.get(e.detail.nodeId) ??
          Array.from(eng.positionsMap.entries()).find(([k]) => k.endsWith(`::${e.detail.nodeId}`))?.[1];
        if (pos) {
          eng.targetLookAt.set(pos[0], pos[1], pos[2]);
          eng.targetCamPos.set(pos[0] + 3.2, pos[1] + 3.8, pos[2] + 5.2);
          eng.isTransitioning = true;
          eng.requestRender();
        }
      }
    };

    window.addEventListener('nexus:map-action' as any, handle3DAction as any);
    return () => window.removeEventListener('nexus:map-action' as any, handle3DAction as any);
  }, [active, project?.id, viewport?.focusNode.id, constellation]);

  if (hasWebGLError) {
    return (
      <div className="webgl-fallback">
        <AlertTriangle size={34} className="icon-warning" />
        <h2>3D Acceleration Unavailable</h2>
        <p>Hardware WebGL rendering could not be initialized or lost context in this browser environment.</p>
        <div className="fallback-actions">
          <button className="primary" onClick={() => setMapMode('2d')}>
            <MapPin size={15} /> Switch to 2D Map
          </button>
          <button className="ghost" onClick={() => setPage('structure')}>
            <Layers size={15} /> Switch to Structure View
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-canvas">
      <WebGLErrorBoundary onFallback={() => setHasWebGLError(true)}>
        <div ref={mountRef} className="webgl-mount" />
        <div className="webgl-labels-overlay" aria-hidden="true">
          {projectedLabels.map((lbl) => (
            <div
              key={lbl.id}
              className={`graph-3d-tag ${lbl.selected ? 'selected' : ''} kind-${lbl.kind}`}
              style={{
                transform: `translate3d(${lbl.x}px, ${lbl.y}px, 0) translate(-50%, -100%)`,
                borderColor: lbl.selected ? '#22D3EE' : lbl.accent ? `${lbl.accent}66` : undefined,
              }}
            >
              <b>{lbl.text}</b>
              <span>{lbl.subtext}</span>
            </div>
          ))}
        </div>
      </WebGLErrorBoundary>
    </div>
  );
}
