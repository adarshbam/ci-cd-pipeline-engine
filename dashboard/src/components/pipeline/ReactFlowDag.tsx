import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Edge,
  Node,
  ReactFlowProvider,
  useReactFlow,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  GitBranch,
  ListFilter,
  Minus,
  Plus,
  Maximize2,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Ban,
  ChevronRight
} from 'lucide-react';
import { WebhookNode } from './nodes/WebhookNode';
import { PipelineJobNode } from './nodes/PipelineJobNode';
import { Job } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

export interface ReactFlowDagProps {
  jobs: Job[];
  onSelectJob: (job: Job) => void;
  selectedJobId?: string;
  viewMode?: 'graph' | 'list';
  onToggleViewMode?: (mode: 'graph' | 'list') => void;
}

// Inner Flow Canvas component with React Flow hooks
const FlowCanvas: React.FC<{
  jobs: Job[];
  onSelectJob: (job: Job) => void;
  selectedJobId?: string;
  viewMode: 'graph' | 'list';
  onToggleViewMode?: (mode: 'graph' | 'list') => void;
  isFullscreen: boolean;
  setIsFullscreen: (fn: (prev: boolean) => boolean) => void;
}> = ({
  jobs,
  onSelectJob,
  selectedJobId,
  viewMode,
  onToggleViewMode,
  isFullscreen,
  setIsFullscreen
}) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [zoomLevel, setZoomLevel] = useState(100);

  // Custom node types registration
  const nodeTypes = useMemo(
    () => ({
      webhook: WebhookNode,
      pipelineJob: PipelineJobNode,
    } as any),
    []
  );

  // Dynamically compute node and edge topology from real jobs
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!jobs || jobs.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }

    // 1. Calculate topological rank / depth for each job
    const rankMap = new Map<string, number>();
    const jobById = new Map<string, Job>();
    jobs.forEach((j) => jobById.set(j.id, j));

    const getRank = (job: Job, visited = new Set<string>()): number => {
      if (rankMap.has(job.id)) return rankMap.get(job.id)!;
      if (visited.has(job.id)) return 0; // Avoid cyclic loop
      visited.add(job.id);

      const deps = job.dependsOn || [];
      if (deps.length === 0) {
        rankMap.set(job.id, 0);
        return 0;
      }

      let maxDepRank = 0;
      for (const depId of deps) {
        const depJob = jobById.get(depId);
        if (depJob) {
          maxDepRank = Math.max(maxDepRank, getRank(depJob, visited) + 1);
        }
      }
      rankMap.set(job.id, maxDepRank);
      return maxDepRank;
    };

    jobs.forEach((j) => getRank(j));

    // Group jobs by rank column
    const columns = new Map<number, Job[]>();
    jobs.forEach((j) => {
      const r = rankMap.get(j.id) || 0;
      if (!columns.has(r)) columns.set(r, []);
      columns.get(r)!.push(j);
    });

    const maxRank = Math.max(...Array.from(columns.keys()), 0);

    // 2. Build React Flow Nodes
    const nodes: Node[] = [];

    // Root Webhook Node
    const centerY = 160;
    nodes.push({
      id: 'node-webhook',
      type: 'webhook',
      position: { x: 30, y: centerY - 45 },
      data: {
        label: 'Webhook',
        subtitle: 'Push Event',
        time: jobs[0]?.startedAt || '10:24 AM',
        commitSha: jobs[0]?.runId?.slice(0, 7) || 'main'
      }
    });

    // Job Nodes positioned by column & row
    const COLUMN_WIDTH = 260;
    const ROW_HEIGHT = 125;

    for (let r = 0; r <= maxRank; r++) {
      const colJobs = columns.get(r) || [];
      const colX = 260 + r * COLUMN_WIDTH;
      const count = colJobs.length;

      colJobs.forEach((job, idx) => {
        const offsetY = (idx - (count - 1) / 2) * ROW_HEIGHT;
        const colY = centerY + offsetY - 40;

        nodes.push({
          id: `node-${job.id}`,
          type: 'pipelineJob',
          position: { x: colX, y: colY },
          selected: selectedJobId === job.id,
          data: {
            id: job.id,
            name: job.name,
            status: job.status,
            duration: job.duration,
            iconType: job.iconType,
            progress: job.progress || (job.status === 'running' ? 65 : undefined),
            stepCount: job.stepCount || 4,
            completedSteps: job.completedSteps || (job.status === 'success' ? 4 : 2),
            subBadge:
              job.status === 'failed'
                ? 'Alert / Failed'
                : job.status === 'cancelled'
                ? 'Cancelled'
                : job.status === 'skipped'
                ? 'Dependency Skipped'
                : undefined
          }
        });
      });
    }

    // 3. Build React Flow Edges
    const edges: Edge[] = [];

    // Root jobs connect from Webhook node
    const rootJobs = columns.get(0) || [];
    rootJobs.forEach((rj) => {
      const isRunning = rj.status === 'running';
      const isSuccess = rj.status === 'success';
      const isFailed = rj.status === 'failed';
      const isCancelled = rj.status === 'cancelled';

      edges.push({
        id: `e-webhook-${rj.id}`,
        source: 'node-webhook',
        target: `node-${rj.id}`,
        type: 'default',
        animated: isRunning,
        style: {
          stroke: isRunning
            ? '#38bdf8'
            : isSuccess
            ? '#10b981'
            : isFailed
            ? '#ef4444'
            : isCancelled
            ? '#f59e0b'
            : '#475569',
          strokeWidth: isRunning || isSuccess ? 2.5 : 2
        }
      });
    });

    // Downstream dependency edges
    jobs.forEach((job) => {
      const deps = job.dependsOn || [];
      deps.forEach((depId) => {
        const depJob = jobById.get(depId);
        const isRunning = job.status === 'running';
        const isSuccess = depJob?.status === 'success' && job.status === 'success';
        const isFailed = job.status === 'failed';
        const isCancelled = job.status === 'cancelled';

        edges.push({
          id: `e-${depId}-${job.id}`,
          source: `node-${depId}`,
          target: `node-${job.id}`,
          type: 'default',
          animated: isRunning,
          style: {
            stroke: isRunning
              ? '#38bdf8'
              : isSuccess
              ? '#10b981'
              : isFailed
              ? '#ef4444'
              : isCancelled
              ? '#f59e0b'
              : '#475569',
            strokeWidth: isRunning || isSuccess ? 2.5 : 2,
            strokeDasharray: job.status === 'queued' || job.status === 'skipped' ? '4 4' : undefined
          }
        });
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [jobs, selectedJobId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Fit view automatically on load / node change
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.18, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitView, jobs.length]);

  const handleZoomChange = (delta: number) => {
    if (delta > 0) {
      zoomIn({ duration: 200 });
      setZoomLevel((prev) => Math.min(140, prev + 10));
    } else {
      zoomOut({ duration: 200 });
      setZoomLevel((prev) => Math.max(60, prev - 10));
    }
  };

  const handleFitView = () => {
    fitView({ padding: 0.18, duration: 300 });
    setZoomLevel(100);
  };

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'webhook') {
        if (jobs.length > 0) onSelectJob(jobs[0]!);
      } else {
        const jobId = (node.data as any)?.id;
        const matchingJob = jobs.find((j) => j.id === jobId) || jobs[0];
        if (matchingJob) onSelectJob(matchingJob);
      }
    },
    [jobs, onSelectJob]
  );

  return (
    <div
      className={`relative rounded-2xl bg-[#080d19] border border-[#192742] overflow-hidden shadow-2xl transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-50 bg-[#080d19]' : ''
      }`}
    >
      {/* Top Toolbar matching screenshot */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#17243c] bg-[#0b1325]/90 select-none z-10 relative">
        {/* Graph vs List Toggle */}
        <div className="flex items-center gap-1 bg-[#070b14] p-1 rounded-xl border border-[#1a2742]">
          <button
            onClick={() => onToggleViewMode?.('graph')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none ${
              viewMode === 'graph'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Graph
          </button>
          <button
            onClick={() => onToggleViewMode?.('list')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none ${
              viewMode === 'list'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            List
          </button>
        </div>

        {/* Center Hint */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span>Click any node to inspect real execution logs & step timeline</span>
        </div>

        {/* Zoom & Fullscreen Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#070b14] rounded-xl border border-[#1a2742] p-1 text-slate-400">
            <button
              onClick={() => handleZoomChange(-10)}
              className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono font-medium text-slate-300 min-w-12 text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => handleZoomChange(10)}
              className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Zoom In"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleFitView}
            className="p-2 rounded-xl bg-[#070b14] border border-[#1a2742] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reset / Center DAG"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-2 rounded-xl bg-[#070b14] border border-[#1a2742] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      {viewMode === 'graph' ? (
        <div className={`w-full relative ${isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[370px]'}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            minZoom={0.4}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            className="bg-[#080d19]"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.5}
              color="#162238"
            />
          </ReactFlow>

          {/* Subdued ambient glow for SaaS aesthetic */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[220px] bg-sky-500/5 blur-[90px] rounded-full pointer-events-none" />
        </div>
      ) : (
        /* Alternative Linear List View */
        <div className="p-5 space-y-2 max-h-[370px] overflow-y-auto">
          {jobs.map((job, idx) => (
            <div
              key={job.id}
              onClick={() => onSelectJob(job)}
              className="flex items-center justify-between p-3.5 rounded-xl bg-[#0d1629] border border-[#1b2b48] hover:border-sky-500/50 hover:bg-[#111e38] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-500 w-4">{idx + 1}</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">{job.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                    <span>{job.duration || '0s'}</span>
                    {job.dependsOn?.length ? (
                      <span>• needs: {job.dependsOn.join(', ')}</span>
                    ) : (
                      <span>• root job</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={job.status} size="xs" />
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ReactFlowDag: React.FC<ReactFlowDagProps> = (props) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>(props.viewMode || 'graph');

  return (
    <ReactFlowProvider>
      <FlowCanvas
        {...props}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
      />
    </ReactFlowProvider>
  );
};
