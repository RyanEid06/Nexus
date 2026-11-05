import { GitBranch } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { WorkspaceTabs } from './WorkspaceTabs';

export function DependenciesPage() {
  const project = useAppStore((s) => s.project);
  if (!project) return null;
  return <main className="project-page"><WorkspaceTabs/><div className="page"><div className="page-title"><div><p>RELATIONSHIPS</p><h1>Dependencies</h1><span>No dependency edges are shown until they are parsed from real source relationships.</span></div></div><section className="panel dependency-placeholder"><GitBranch size={42}/><h2>Dependency parser not implemented yet</h2><p>This is an intentional milestone boundary, not a fake visualization. Milestone 4 must resolve TypeScript/JavaScript import, export-from, dynamic import, and CommonJS require relationships without traversing node_modules.</p></section></div></main>;
}
