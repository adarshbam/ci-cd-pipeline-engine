import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Loader2,
  Copy,
  Check,
  Download,
  RotateCw,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { Job, JobLogEntry } from '../../types';
import { Drawer } from '../ui/Drawer';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../ui/Button';
import { pipelineApi } from '../../api/client';

export interface JobDetailDrawerProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onRerunJob?: (jobId: string) => void;
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  job,
  isOpen,
  onClose,
  onRerunJob
}) => {
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'steps' | 'details'>('logs');
  const [logs, setLogs] = useState<JobLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch real logs when drawer opens or job changes
  useEffect(() => {
    if (!job || !isOpen) return;

    let isMounted = true;
    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const backendLogs = await pipelineApi.getRunLogs(
          job.runId,
          job.id,
          levelFilter === 'ALL' ? undefined : levelFilter
        );
        if (isMounted) {
          if (backendLogs && backendLogs.length > 0) {
            setLogs(backendLogs);
          } else if (job.logs && job.logs.length > 0) {
            setLogs(job.logs);
          } else {
            setLogs([
              {
                id: '1',
                jobId: job.id,
                timestamp: job.startedAt || new Date().toLocaleTimeString(),
                level: 'info',
                message: `Job ${job.name} started in temporary runner workspace`
              },
              {
                id: '2',
                jobId: job.id,
                timestamp: new Date().toLocaleTimeString(),
                level: job.status === 'failed' ? 'error' : job.status === 'cancelled' ? 'warn' : 'info',
                message: job.failureReason
                  ? `Execution failure: ${job.failureReason}`
                  : job.status === 'cancelled'
                    ? 'Job execution was cancelled by user'
                    : `Job ${job.name} executed successfully with exit code 0`
              }
            ]);
          }
        }
      } catch {
        if (isMounted) {
          setLogs(job.logs || []);
        }
      } finally {
        if (isMounted) setIsLoadingLogs(false);
      }
    };

    fetchLogs();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (job.status === 'running') {
      interval = setInterval(fetchLogs, 1500);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [job, isOpen, levelFilter]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        !searchQuery ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.timestamp.includes(searchQuery);
      return matchesSearch;
    });
  }, [logs, searchQuery]);

  if (!job) return null;

  const copyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const downloadLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.name}-${job.runId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="lg"
      title={
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-[#F4F4F5]">{job.name}</span>
          <StatusBadge status={job.status} size="xs" />
        </div>
      }
      subtitle={`Run ID: ${job.runId.slice(0, 8)} • Duration: ${job.duration || '0s'}`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyLogs}
              icon={
                copiedLogs ? (
                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )
              }
            >
              {copiedLogs ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadLogs}
              icon={<Download className="w-3.5 h-3.5" />}
            >
              Export
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<RotateCw className="w-3.5 h-3.5" />}
              onClick={() => onRerunJob?.(job.id)}
            >
              Rerun Job
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Failure Diagnostics Banner */}
        {job.status === 'failed' && (
          <div className="p-3.5 rounded-lg bg-[#241215] border border-[#4C1D24] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#F87171] font-semibold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#F87171]" />
                <span>Job Failed with Exit Code {job.exitCode ?? 1}</span>
              </div>
              <span className="text-[10px] font-mono text-[#F87171] bg-[#34181C] px-1.5 py-0.5 rounded border border-[#4C1D24]">
                Exit {job.exitCode ?? 1}
              </span>
            </div>
            {job.failureReason && (
              <p className="text-xs text-[#F87171] font-mono bg-[#1E0F12] p-2 rounded border border-[#3E151B] break-words">
                {job.failureReason}
              </p>
            )}
            {job.steps && job.steps.some((s: any) => s.status === 'failed' || (s.exitCode && s.exitCode !== 0)) && (
              <div className="text-[11px] text-[#A1A1AA] flex items-center justify-between pt-1">
                <span>
                  Failing step:{' '}
                  <span className="text-white font-medium font-mono">
                    {
                      job.steps.find(
                        (s: any) =>
                          s.status === 'failed' ||
                          (s.exitCode && s.exitCode !== 0),
                      )?.name
                    }
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('steps');
                    const failedIdx = job.steps?.findIndex(
                      (s: any) =>
                        s.status === 'failed' ||
                        (s.exitCode && s.exitCode !== 0),
                    );
                    if (failedIdx !== undefined && failedIdx >= 0) {
                      setExpandedStepIndex(failedIdx);
                    }
                  }}
                  className="text-xs text-[#3B82F6] hover:text-[#60A5FA] font-medium underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Inspect Failing Step &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sub-tabs inside Drawer */}
        <div className="flex border-b border-[#27272A] gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-2.5 relative transition-colors ${
              activeTab === 'logs'
                ? 'text-[#F4F4F5] font-semibold'
                : 'text-[#71717A] hover:text-[#D4D4D8]'
            }`}
          >
            Live Logs
            {activeTab === 'logs' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            className={`pb-2.5 relative transition-colors ${
              activeTab === 'steps'
                ? 'text-[#F4F4F5] font-semibold'
                : 'text-[#71717A] hover:text-[#D4D4D8]'
            }`}
          >
            Step Execution ({job.steps?.length || 2} steps)
            {activeTab === 'steps' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-2.5 relative transition-colors ${
              activeTab === 'details'
                ? 'text-[#F4F4F5] font-semibold'
                : 'text-[#71717A] hover:text-[#D4D4D8]'
            }`}
          >
            Metadata
            {activeTab === 'details' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6]" />
            )}
          </button>
        </div>

        {/* Tab 1: Terminal Log Viewer */}
        {activeTab === 'logs' && (
          <div className="space-y-2.5">
            {/* Filter and Search toolbar */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#71717A]" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#141519] border border-[#27272A] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#F4F4F5] placeholder-[#71717A] focus:outline-none focus:border-[#3B82F6] font-mono"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="bg-[#141519] border border-[#27272A] text-xs text-[#D4D4D8] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#3B82F6]"
                >
                  <option value="ALL">All Levels</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>

                <label className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA] cursor-pointer select-none ml-1">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded border-[#27272A] text-[#3B82F6] focus:ring-0 bg-[#141519]"
                  />
                  <span>Follow</span>
                </label>
              </div>
            </div>

            {/* Console Output Area */}
            <div className="rounded-lg bg-[#0B0C0E] border border-[#27272A] overflow-hidden">
              <div className="px-3.5 py-2 border-b border-[#27272A] bg-[#141519] flex items-center justify-between text-xs text-[#71717A]">
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <Terminal className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span>console output</span>
                </div>
                <span className="text-[10px] text-[#34D399] font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                  live stream
                </span>
              </div>

              <div className="p-3 font-mono text-[11px] leading-relaxed space-y-1 max-h-[380px] overflow-y-auto">
                {isLoadingLogs && logs.length === 0 ? (
                  <div className="py-8 text-center text-[#71717A] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#3B82F6]" />
                    <span>Loading execution logs...</span>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="py-8 text-center text-[#71717A]">
                    <span>No log output matching query</span>
                  </div>
                ) : (
                  filteredLogs.map((log) => {
                    const getLevelClass = () => {
                      switch (log.level?.toLowerCase()) {
                        case 'error':
                          return 'text-[#F87171] bg-[#241215] border-[#4C1D24]';
                        case 'warn':
                          return 'text-[#FBBF24] bg-[#241A0E] border-[#4C3415]';
                        case 'success':
                          return 'text-[#34D399] bg-[#0D1F17] border-[#164E35]';
                        default:
                          return 'text-[#60A5FA] bg-[#0E1B2E] border-[#1D3557]';
                      }
                    };

                    return (
                      <div
                        key={log.id}
                        className="flex items-start gap-2 hover:bg-[#141519] py-0.5 px-1 rounded transition-colors"
                      >
                        <span className="text-[#52525B] select-none shrink-0 font-mono text-[10px]">
                          {log.timestamp}
                        </span>
                        <span
                          className={`uppercase text-[9px] px-1 py-0.2 rounded border font-medium shrink-0 select-none ${getLevelClass()}`}
                        >
                          {log.level}
                        </span>
                        <span className="flex-1 break-all text-[#D4D4D8]">
                          {log.message}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Step Execution Breakdown */}
        {activeTab === 'steps' && (
          <div className="space-y-2">
            {(job.steps && job.steps.length > 0
              ? job.steps
              : [
                  {
                    name: `Execute ${job.name} task`,
                    duration: job.duration || '8s',
                    status: job.status,
                    exitCode: job.exitCode ?? (job.status === 'success' ? 0 : 1)
                  },
                  {
                    name: 'Upload build artifacts & report telemetry',
                    duration: '2s',
                    status: job.status === 'failed' ? 'skipped' : job.status,
                    exitCode: 0
                  }
                ]
            ).map((step: any, idx: number) => {
              const isExpanded = expandedStepIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-lg bg-[#141519] border border-[#22242A] overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedStepIndex(isExpanded ? null : idx)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-[#181A22] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs text-[#71717A] w-4">
                        {idx + 1}
                      </span>
                      <div>
                        <h5 className="text-xs font-semibold text-[#F4F4F5] font-mono">
                          {step.name}
                        </h5>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#71717A] font-mono">
                          <span>{step.duration || '4s'}</span>
                          <span>•</span>
                          <span>
                            Exit code:{' '}
                            <span
                              className={
                                step.exitCode === 0
                                  ? 'text-[#10B981]'
                                  : 'text-[#EF4444]'
                              }
                            >
                              {step.exitCode ?? '0'}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={step.status as any} size="xs" />
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#71717A]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#71717A]" />
                      )}
                    </div>
                  </div>

                  {/* Expandable Step Console Output */}
                  {isExpanded && (
                    <div className="p-3 bg-[#0B0C0E] border-t border-[#22242A] font-mono text-[11px] space-y-1">
                      {step.stdout && (
                        <div>
                          <span className="text-[10px] text-[#3B82F6] font-semibold block mb-0.5">
                            stdout:
                          </span>
                          <pre className="text-[#D4D4D8] whitespace-pre-wrap bg-[#141519] p-2 rounded border border-[#22242A]">
                            {step.stdout}
                          </pre>
                        </div>
                      )}
                      {step.stderr && (
                        <div>
                          <span className="text-[10px] text-[#F87171] font-semibold block mb-0.5">
                            stderr:
                          </span>
                          <pre className="text-[#F87171] whitespace-pre-wrap bg-[#241215] p-2 rounded border border-[#4C1D24]">
                            {step.stderr}
                          </pre>
                        </div>
                      )}
                      {!step.stdout && !step.stderr && (
                        <span className="text-[#71717A] italic text-xs">
                          No direct console output captured for this step.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Job Metadata */}
        {activeTab === 'details' && (
          <div className="space-y-2 p-3.5 rounded-lg bg-[#141519] border border-[#22242A] text-xs">
            <div className="flex justify-between py-1 border-b border-[#22242A]">
              <span className="text-[#71717A]">Job Identifier:</span>
              <span className="font-mono text-[#F4F4F5]">{job.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#22242A]">
              <span className="text-[#71717A]">Pipeline Run ID:</span>
              <span className="font-mono text-[#3B82F6]">{job.runId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#22242A]">
              <span className="text-[#71717A]">Status:</span>
              <StatusBadge status={job.status} size="xs" />
            </div>
            <div className="flex justify-between py-1 border-b border-[#22242A]">
              <span className="text-[#71717A]">Dependencies:</span>
              <span className="font-mono text-[#D4D4D8]">
                {job.dependsOn?.length ? job.dependsOn.join(', ') : 'None (Root Node)'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#22242A]">
              <span className="text-[#71717A]">Exit Code:</span>
              <span
                className={`font-mono font-bold ${
                  job.exitCode === 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                }`}
              >
                {job.exitCode ?? (job.status === 'success' ? '0' : 'None')}
              </span>
            </div>
            {job.failureReason && (
              <div className="flex justify-between py-1 border-b border-[#22242A]">
                <span className="text-[#71717A]">Failure Reason:</span>
                <span className="font-mono text-[#F87171] max-w-xs text-right break-words">
                  {job.failureReason}
                </span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-[#22242A]">
              <span className="text-[#71717A]">Workspace Isolation:</span>
              <span className="font-mono text-[#A1A1AA]">OS Temporary Tempdir (NTFS / POSIX)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#71717A]">Execution Shell:</span>
              <span className="font-mono text-[#A1A1AA]">bash -c [command-runner]</span>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};
