import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  useViewport
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  GitBranch,
  ListFilter,
  Minus,
  Plus,
  Maximize2,
  Minimize2,
  RefreshCw,
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
  setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
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
  const { zoom } = useViewport();
  const currentZoomPercent = Math.round(zoom * 100);

  const containerRef = useRef<HTMLDivElement>(null);
  const userInteractedRef = useRef<boolean>(false);
  const prevRunIdRef = useRef<string | undefined>(jobs[0]?.runId);

  // Custom node types registration
  const nodeTypes = useMemo(
    () =>
      ({
        webhook: WebhookNode,
        pipelineJob: PipelineJobNode
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
      if (visited.has(job.id)) return 0;
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
            progress:
              job.progress || (job.status === 'running' ? 65 : undefined),
            stepCount: job.stepCount || 4,
            completedSteps:
              job.completedSteps || (job.status === 'success' ? 4 : 2),
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
        const isSuccess =
          depJob?.status === 'success' && job.status === 'success';
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
            strokeDasharray:
              job.status === 'queued' || job.status === 'skipped'
                ? '4 4'
                : undefined
          }
        });
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [jobs, selectedJobId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Synchronize node data without moving node positions during live polling
  useEffect(() => {
    setNodes((prevNodes) => {
      if (prevNodes.length !== initialNodes.length) {
        return initialNodes;
      }
      return prevNodes.map((prevNode) => {
        const updated = initialNodes.find((n) => n.id === prevNode.id);
        if (!updated) return prevNode;
        return {
          ...prevNode,
          selected: updated.selected,
          data: updated.data
        };
      });
    });
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Intelligent adaptive fitView calculation based on container and screen dimensions
  const fitGraph = useCallback(
    (isFull: boolean, animate = true) => {
      const el = containerRef.current;
      const width = el?.clientWidth || window.innerWidth;

      let padding = 0.14;
      let minZoom = 0.55;
      let maxZoom = 1.25;

      if (width < 480) {
        // Mobile layout (375px - 430px)
        padding = 0.08;
        minZoom = 0.35;
        maxZoom = 0.85;
      } else if (width < 768) {
        // Tablet (768px)
        padding = 0.12;
        minZoom = 0.45;
        maxZoom = 1.05;
      } else if (isFull) {
        // Fullscreen mode: intelligently utilize the expanded space with prominent nodes
        padding = 0.15;
        minZoom = 0.65;
        maxZoom = 1.45;
      } else {
        // Normal desktop layout
        padding = 0.14;
        minZoom = 0.6;
        maxZoom = 1.25;
      }

      fitView({
        padding,
        minZoom,
        maxZoom,
        duration: animate ? 250 : 0
      });
    },
    [fitView]
  );

  // Center/Fit view automatically on initial mount or when switching workflow runs
  useEffect(() => {
    const currentRunId = jobs[0]?.runId;
    if (currentRunId !== prevRunIdRef.current || !prevRunIdRef.current) {
      prevRunIdRef.current = currentRunId;
      userInteractedRef.current = false;
      const timer = setTimeout(() => {
        fitGraph(isFullscreen, false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [jobs, isFullscreen, fitGraph]);

  // Refit adaptively whenever entering or exiting fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      fitGraph(isFullscreen, true);
    }, 120);
    return () => clearTimeout(timer);
  }, [isFullscreen, fitGraph]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, setIsFullscreen]);

  // Handle window / viewport resize gracefully without overriding active user exploration
  useEffect(() => {
    const handleResize = () => {
      if (!userInteractedRef.current) {
        fitGraph(isFullscreen, false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen, fitGraph]);

  const handleFitView = () => {
    userInteractedRef.current = false;
    fitGraph(isFullscreen, true);
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
      ref={containerRef}
      className={`rounded-xl border border-[#192742] overflow-hidden shadow-2xl transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-0 sm:inset-4 z-50 bg-[#080d19] flex flex-col'
          : 'relative bg-[#080d19]'
      }`}
    >
      {/* Top Toolbar matching screenshot & refined for responsive space efficiency */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-[#17243c] bg-[#0b1325]/90 select-none z-10 relative gap-2 shrink-0">
        {/* Graph vs List Toggle */}
        <div className="flex items-center gap-1 bg-[#070b14] p-0.5 sm:p-1 rounded-lg border border-[#1a2742]">
          <button
            onClick={() => onToggleViewMode?.('graph')}
            className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs font-semibold transition-all select-none ${
              viewMode === 'graph'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_10px_rgba(14,165,233,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Graph</span>
          </button>
          <button
            onClick={() => onToggleViewMode?.('list')}
            className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs font-medium transition-all select-none ${
              viewMode === 'list'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_10px_rgba(14,165,233,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>List</span>
          </button>
        </div>

        {/* Center Hint - Hidden on mobile/tablet to give full space to controls */}
        <div className="hidden xl:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span>Click any node to inspect real execution logs & step timeline</span>
        </div>

        {/* Zoom & Fullscreen Controls */}
        {viewMode === 'graph' ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Zoom Stepper */}
            <div className="flex items-center bg-[#070b14] rounded-lg border border-[#1a2742] p-0.5 text-slate-400">
              <button
                onClick={() => zoomOut({ duration: 200 })}
                className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 sm:px-2 text-[11px] sm:text-xs font-mono font-medium text-slate-300 min-w-[36px] sm:min-w-[44px] text-center select-none">
                {currentZoomPercent}%
              </span>
              <button
                onClick={() => zoomIn({ duration: 200 })}
                className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Reset / Center DAG */}
            <button
              onClick={handleFitView}
              className="p-1.5 sm:p-2 rounded-lg bg-[#070b14] border border-[#1a2742] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Reset / Center DAG"
              aria-label="Reset / Center DAG"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 sm:p-2 rounded-lg bg-[#070b14] border border-[#1a2742] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-400 font-mono">
            {jobs.length} jobs declared
          </div>
        )}
      </div>

      {/* Main Canvas Viewport */}
      {viewMode === 'graph' ? (
        <div
          className={`w-full relative ${
            isFullscreen
              ? 'flex-1 min-h-0'
              : 'h-[370px] sm:h-[400px]'
          }`}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onMoveStart={() => {
              userInteractedRef.current = true;
            }}
            fitView
            fitViewOptions={{ padding: 0.14, minZoom: 0.35, maxZoom: 1.45 }}
            minZoom={0.25}
            maxZoom={2.0}
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
        <div
          className={`p-4 sm:p-5 space-y-2 overflow-y-auto ${
            isFullscreen ? 'flex-1 min-h-0' : 'max-h-[380px]'
          }`}
        >
          {jobs.map((job, idx) => (
            <div
              key={job.id}
              onClick={() => onSelectJob(job)}
              className="flex items-center justify-between p-3 sm:p-3.5 rounded-lg bg-[#0d1629] border border-[#1b2b48] hover:border-sky-500/50 hover:bg-[#111e38] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs text-slate-500 w-4 shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-100 truncate">
                    {job.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono flex-wrap">
                    <span>{job.duration || '0s'}</span>
                    {job.dependsOn?.length ? (
                      <span className="truncate">
                        • needs: {job.dependsOn.join(', ')}
                      </span>
                    ) : (
                      <span>• root job</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
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
  const [internalViewMode, setInternalViewMode] = useState<'graph' | 'list'>(
    props.viewMode || 'graph'
  );

  const viewMode = props.viewMode ?? internalViewMode;
  const onToggleViewMode = props.onToggleViewMode ?? setInternalViewMode;

  return (
    <ReactFlowProvider>
      <FlowCanvas
        {...props}
        viewMode={viewMode}
        onToggleViewMode={onToggleViewMode}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
      />
    </ReactFlowProvider>
  );
};
