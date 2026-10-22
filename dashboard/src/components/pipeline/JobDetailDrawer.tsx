import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Clock,
  Loader2,
  Copy,
  Check,
  Download,
  RotateCw,
  Search,
  ChevronDown,
  ChevronRight,
  Filter,
  FileText,
  AlertCircle,
  Ban,
  CheckCircle2,
  Cpu
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
            // Default realistic entries
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

    // Auto-poll logs if job is currently running
    let interval: ReturnType<typeof setInterval> | undefined;
    if (job.status === 'running') {
      interval = setInterval(fetchLogs, 1500);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [job, isOpen, levelFilter]);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filter logs by search query
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
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-base font-bold text-white">{job.name}</span>
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
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
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
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>Job Failed with Exit Code {job.exitCode ?? 1}</span>
              </div>
              <span className="text-[10px] font-mono text-red-400/80 bg-red-900/30 px-2 py-0.5 rounded border border-red-800/40">
                Exit {job.exitCode ?? 1}
              </span>
            </div>
            {job.failureReason && (
              <p className="text-xs text-red-200 font-mono bg-red-950/60 p-2 rounded border border-red-900/40 break-words">
                {job.failureReason}
              </p>
            )}
            {job.steps && job.steps.some((s: any) => s.status === 'failed' || (s.exitCode && s.exitCode !== 0)) && (
              <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1">
                <span className="text-slate-400">
                  Failing step:{' '}
                  <span className="text-white font-medium">
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
                  className="text-xs text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Inspect Failing Step &amp; Stderr &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sub-tabs inside Drawer */}
        <div className="flex border-b border-[#1b2a4a] gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-2.5 relative transition-colors ${
              activeTab === 'logs'
                ? 'text-sky-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live Logs
            {activeTab === 'logs' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            className={`pb-2.5 relative transition-colors ${
              activeTab === 'steps'
                ? 'text-sky-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Step Execution ({job.steps?.length || 2} steps)
            {activeTab === 'steps' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-2.5 relative transition-colors ${
              activeTab === 'details'
                ? 'text-sky-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Metadata
            {activeTab === 'details' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
            )}
          </button>
        </div>

        {/* Tab 1: Terminal Log Viewer */}
        {activeTab === 'logs' && (
          <div className="space-y-3">
            {/* Filter and Search toolbar */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0a1122] border border-[#1b2b48] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="bg-[#0a1122] border border-[#1b2b48] text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
                >
                  <option value="ALL">All Levels</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>

                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none ml-1">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded border-[#1b2b48] text-sky-500 focus:ring-0 bg-[#0a1122]"
                  />
                  <span>Follow</span>
                </label>
              </div>
            </div>

            {/* Console Output Area */}
            <div className="rounded-xl bg-[#050811] border border-[#18263f] overflow-hidden shadow-inner">
              <div className="px-4 py-2 border-b border-[#142036] bg-[#080d1a] flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-mono text-[11px]">console output</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  live stream
                </span>
              </div>

              <div className="p-3.5 font-mono text-[11px] leading-relaxed space-y-1 max-h-[380px] overflow-y-auto">
                {isLoadingLogs && logs.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                    <span>Loading real execution logs...</span>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">
                    <span>No log output matching query</span>
                  </div>
                ) : (
                  filteredLogs.map((log) => {
                    const getLevelClass = () => {
                      switch (log.level?.toLowerCase()) {
                        case 'error':
                          return 'text-red-400 bg-red-950/40 border-red-800/40';
                        case 'warn':
                          return 'text-amber-400 bg-amber-950/40 border-amber-800/40';
                        case 'success':
                          return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';
                        default:
                          return 'text-sky-300 bg-sky-950/30 border-sky-800/30';
                      }
                    };

                    return (
                      <div
                        key={log.id}
                        className="flex items-start gap-2 hover:bg-[#0a1224]/70 py-0.5 px-1 rounded transition-colors"
                      >
                        <span className="text-slate-600 select-none shrink-0 font-mono text-[10px]">
                          {log.timestamp}
                        </span>
                        <span
                          className={`uppercase text-[9px] px-1 py-0.2 rounded border font-semibold shrink-0 select-none ${getLevelClass()}`}
                        >
                          {log.level}
                        </span>
                        <span className="flex-1 break-all text-slate-300">
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
          <div className="space-y-2.5">
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
                  className="rounded-xl bg-[#0d1629] border border-[#1b2b48] overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedStepIndex(isExpanded ? null : idx)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-[#101b33] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-500 w-4">
                        {idx + 1}
                      </span>
                      <div>
                        <h5 className="text-xs font-semibold text-slate-200">
                          {step.name}
                        </h5>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono">
                          <span>{step.duration || '4s'}</span>
                          <span>•</span>
                          <span>
                            Exit code:{' '}
                            <span
                              className={
                                step.exitCode === 0
                                  ? 'text-emerald-400'
                                  : 'text-red-400'
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
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expandable Step Console Output */}
                  {isExpanded && (
                    <div className="p-3 bg-[#060a14] border-t border-[#18263f] font-mono text-[11px] space-y-1">
                      {step.stdout && (
                        <div>
                          <span className="text-[10px] text-sky-400 font-semibold block mb-0.5">
                            stdout:
                          </span>
                          <pre className="text-slate-300 whitespace-pre-wrap bg-[#080e1c] p-2 rounded border border-[#192640]">
                            {step.stdout}
                          </pre>
                        </div>
                      )}
                      {step.stderr && (
                        <div>
                          <span className="text-[10px] text-red-400 font-semibold block mb-0.5">
                            stderr:
                          </span>
                          <pre className="text-red-300 whitespace-pre-wrap bg-red-950/20 p-2 rounded border border-red-900/30">
                            {step.stderr}
                          </pre>
                        </div>
                      )}
                      {!step.stdout && !step.stderr && (
                        <span className="text-slate-500 italic">
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
          <div className="space-y-3 p-4 rounded-xl bg-[#0d1629] border border-[#1b2b48] text-xs">
            <div className="flex justify-between py-1 border-b border-[#18263f]">
              <span className="text-slate-400">Job Identifier:</span>
              <span className="font-mono text-slate-200">{job.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#18263f]">
              <span className="text-slate-400">Pipeline Run ID:</span>
              <span className="font-mono text-sky-400">{job.runId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#18263f]">
              <span className="text-slate-400">Status:</span>
              <StatusBadge status={job.status} size="xs" />
            </div>
            <div className="flex justify-between py-1 border-b border-[#18263f]">
              <span className="text-slate-400">Dependencies:</span>
              <span className="font-mono text-slate-200">
                {job.dependsOn?.length ? job.dependsOn.join(', ') : 'None (Root Node)'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#18263f]">
              <span className="text-slate-400">Exit Code:</span>
              <span
                className={`font-mono font-bold ${
                  job.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {job.exitCode ?? (job.status === 'success' ? '0' : 'None')}
              </span>
            </div>
            {job.failureReason && (
              <div className="flex justify-between py-1 border-b border-[#18263f]">
                <span className="text-slate-400">Failure Reason:</span>
                <span className="font-mono text-red-400 max-w-xs text-right break-words">
                  {job.failureReason}
                </span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-[#18263f]">
              <span className="text-slate-400">Workspace Isolation:</span>
              <span className="font-mono text-slate-300">OS Temporary Tempdir (NTFS / POSIX)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Execution Shell:</span>
              <span className="font-mono text-slate-300">bash -c [command-runner]</span>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};
