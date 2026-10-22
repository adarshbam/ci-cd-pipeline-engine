import React from 'react';
import { MoreHorizontal, ExternalLink, Check, Loader2, Clock, RotateCcw, Ban } from 'lucide-react';
import { Job, JobStatus } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { renderJobIcon } from '../ui/JobChip';

export interface JobsTableProps {
  jobs: Job[];
  onSelectJob: (job: Job) => void;
  selectedJobId?: string;
}

export const JobsTable: React.FC<JobsTableProps> = ({
  jobs,
  onSelectJob,
  selectedJobId
}) => {
  const getJobStatusIcon = (status: JobStatus) => {
    switch (status) {
      case 'success':
        return (
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Check className="w-2.5 h-2.5 stroke-[3]" />
          </div>
        );
      case 'running':
        return (
          <div className="w-4 h-4 rounded-full bg-sky-500/20 border border-sky-400/50 flex items-center justify-center text-sky-400">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          </div>
        );
      case 'failed':
        return (
          <div className="w-4 h-4 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-[9px]">
            ✕
          </div>
        );
      case 'cancelled':
        return (
          <div className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Ban className="w-2.5 h-2.5 stroke-[2.5]" />
          </div>
        );
      case 'skipped':
        return (
          <div className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
            <RotateCcw className="w-2.5 h-2.5" />
          </div>
        );
      case 'queued':
      default:
        return (
          <div className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
            <Clock className="w-2.5 h-2.5" />
          </div>
        );
    }
  };

  const displayJobs = jobs.filter((j) => j.name.toLowerCase() !== 'rollback');

  return (
    <div className="rounded-2xl bg-[#090f1e] border border-[#192742] overflow-hidden shadow-xl">
      <div className="px-5 py-3.5 border-b border-[#17243c] flex items-center justify-between bg-[#0b1325]/70">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          Jobs <span className="text-slate-400 text-xs font-normal">({displayJobs.length})</span>
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#16233b] text-slate-400 font-medium">
              <th className="py-2.5 px-3 pl-5 text-[11px] font-medium text-slate-400">#</th>
              <th className="py-2.5 px-3 text-[11px] font-medium text-slate-400">Job</th>
              <th className="py-2.5 px-3 text-[11px] font-medium text-slate-400">Status</th>
              <th className="py-2.5 px-3 text-[11px] font-medium text-slate-400">Duration</th>
              <th className="py-2.5 px-3 text-[11px] font-medium text-slate-400">Started</th>
              <th className="py-2.5 px-3 pr-5 text-right text-[11px] font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#142036]">
            {displayJobs.map((job, idx) => {
              const isSelected = selectedJobId === job.id;
              return (
                <tr
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  className={`group transition-colors duration-150 cursor-pointer ${
                    isSelected ? 'bg-sky-500/10' : 'hover:bg-[#0f192d]/70'
                  }`}
                >
                  <td className="py-3 px-3 pl-5 text-slate-500 font-mono text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-3 text-slate-200">
                    <div className="flex items-center gap-2.5">
                      {getJobStatusIcon(job.status)}
                      <span className="font-semibold text-slate-100 font-mono text-xs">
                        {job.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={job.status} size="xs" />
                  </td>
                  <td className="py-3 px-3 text-slate-400 font-mono text-xs">
                    {job.duration}
                  </td>
                  <td className="py-3 px-3 text-slate-400 font-mono text-xs">
                    {job.startedAt || '—'}
                  </td>
                  <td className="py-3 px-3 pr-5 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectJob(job)}
                        className="text-sky-400 hover:text-sky-300 font-medium text-xs hover:underline"
                      >
                        Inspect
                      </button>
                      <button className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
