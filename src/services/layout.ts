import type { ProjectNode } from '../domain/models';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function withDeterministicLayout(nodes: ProjectNode[]): ProjectNode[] {
  const byParent = new Map<string | null, ProjectNode[]>();
  nodes.forEach((node) => {
    const group = byParent.get(node.parentId) ?? [];
    group.push(node);
    byParent.set(node.parentId, group);
  });

  const positioned = new Map<string, [number, number, number]>();
  const roots = byParent.get(null) ?? [];
  roots.forEach((root, index) => positioned.set(root.id, [index * 3, 0, 0]));

  const walk = (parentId: string, depth: number) => {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const parent = positioned.get(parentId) ?? [0, 0, 0];
    const radius = Math.max(2.2, 5.2 - depth * 0.8);
    children.forEach((child, index) => {
      const angle = index * GOLDEN_ANGLE + depth * 0.7;
      const lift = depth * -0.35 + ((index % 3) - 1) * 0.18;
      const next: [number, number, number] = [
        parent[0] + Math.cos(angle) * radius,
        parent[1] + lift,
        parent[2] + Math.sin(angle) * radius,
      ];
      positioned.set(child.id, next);
      walk(child.id, depth + 1);
    });
  };

  roots.forEach((root) => walk(root.id, 1));
  return nodes.map((node) => ({ ...node, position: positioned.get(node.id) ?? [0, 0, 0] }));
}

function ancestorIds(nodes: ProjectNode[], node: ProjectNode): string[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const ids: string[] = [];
  let current: ProjectNode | undefined = node;
  while (current) {
    ids.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return ids;
}

export function visibleGraphNodes(nodes: ProjectNode[], selectedId: string | null, maxNodes = 180): ProjectNode[] {
  const base = nodes.filter((node) => node.depth <= 1);
  const merged = new Map(base.map((node) => [node.id, node]));

  if (selectedId) {
    const selected = nodes.find((node) => node.id === selectedId);
    if (selected) {
      const ids = new Set(ancestorIds(nodes, selected));
      for (const node of nodes) {
        if (ids.has(node.id) || node.parentId === selected.id) merged.set(node.id, node);
      }
      const parent = selected.parentId ? nodes.find((node) => node.id === selected.parentId) : undefined;
      if (parent) {
        for (const sibling of nodes.filter((node) => node.parentId === parent.id)) merged.set(sibling.id, sibling);
      }
    }
  } else {
    for (const node of nodes.filter((item) => item.depth === 2).slice(0, Math.max(0, maxNodes - merged.size))) merged.set(node.id, node);
  }

  const mustKeep = selectedId ? new Set(ancestorIds(nodes, nodes.find((node) => node.id === selectedId) ?? nodes[0])) : new Set<string>();
  const ordered = [...merged.values()].sort((a, b) => {
    const aMust = mustKeep.has(a.id) ? 1 : 0;
    const bMust = mustKeep.has(b.id) ? 1 : 0;
    if (aMust !== bMust) return bMust - aMust;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.name.localeCompare(b.name);
  });
  return ordered.slice(0, maxNodes);
}
