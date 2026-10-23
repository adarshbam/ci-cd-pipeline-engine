import React from 'react';
import { MoreHorizontal, Check, Loader2, Clock, RotateCcw, Ban } from 'lucide-react';
import { Job, JobStatus } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

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
          <div className="w-4 h-4 rounded-full bg-[#0D1F17] border border-[#164E35] flex items-center justify-center text-[#34D399]">
            <Check className="w-2.5 h-2.5 stroke-[3]" />
          </div>
        );
      case 'running':
        return (
          <div className="w-4 h-4 rounded-full bg-[#0E1B2E] border border-[#1D3557] flex items-center justify-center text-[#60A5FA]">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          </div>
        );
      case 'failed':
        return (
          <div className="w-4 h-4 rounded-full bg-[#241215] border border-[#4C1D24] flex items-center justify-center text-[#F87171] font-bold text-[9px]">
            ✕
          </div>
        );
      case 'cancelled':
        return (
          <div className="w-4 h-4 rounded-full bg-[#241A0E] border border-[#4C3415] flex items-center justify-center text-[#FBBF24]">
            <Ban className="w-2.5 h-2.5 stroke-[2.5]" />
          </div>
        );
      case 'skipped':
        return (
          <div className="w-4 h-4 rounded-full bg-[#18191E] border border-[#27272A] flex items-center justify-center text-[#71717A]">
            <RotateCcw className="w-2.5 h-2.5" />
          </div>
        );
      case 'idle':
        return (
          <div className="w-4 h-4 rounded-full bg-[#18191E] border border-[#27272A] flex items-center justify-center text-[#71717A] text-[10px]">
            -
          </div>
        );
      case 'queued':
      default:
        return (
          <div className="w-4 h-4 rounded-full bg-[#18191E] border border-[#27272A] flex items-center justify-center text-[#A1A1AA]">
            <Clock className="w-2.5 h-2.5" />
          </div>
        );
    }
  };

  const displayJobs = jobs.filter((j) => j.name.toLowerCase() !== 'rollback');

  return (
    <div className="rounded-xl bg-[#111317] border border-[#27272A] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#27272A] flex items-center justify-between bg-[#141519]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-2">
          Jobs <span className="text-[#71717A] font-mono font-normal">({displayJobs.length})</span>
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#27272A] text-[#71717A]">
              <th className="py-2.5 px-3 pl-4 text-[11px] font-medium">#</th>
              <th className="py-2.5 px-3 text-[11px] font-medium">Job</th>
              <th className="py-2.5 px-3 text-[11px] font-medium">Status</th>
              <th className="py-2.5 px-3 text-[11px] font-medium">Duration</th>
              <th className="py-2.5 px-3 text-[11px] font-medium">Started</th>
              <th className="py-2.5 px-3 pr-4 text-right text-[11px] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2026]">
            {displayJobs.map((job, idx) => {
              const isSelected = selectedJobId === job.id;
              return (
                <tr
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  className={`group transition-colors duration-150 cursor-pointer ${
                    isSelected ? 'bg-[#181A22]' : 'hover:bg-[#16181F]'
                  }`}
                >
                  <td className="py-2.5 px-3 pl-4 text-[#71717A] font-mono text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 text-[#D4D4D8]">
                    <div className="flex items-center gap-2">
                      {getJobStatusIcon(job.status)}
                      <span className="font-semibold text-[#F4F4F5] font-mono text-xs">
                        {job.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={job.status} size="xs" />
                  </td>
                  <td className="py-2.5 px-3 text-[#A1A1AA] font-mono text-xs">
                    {job.duration}
                  </td>
                  <td className="py-2.5 px-3 text-[#71717A] font-mono text-xs">
                    {job.startedAt || '—'}
                  </td>
                  <td className="py-2.5 px-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectJob(job)}
                        className="text-[#3B82F6] hover:text-[#60A5FA] font-medium text-xs hover:underline"
                      >
                        Inspect
                      </button>
                      <button className="text-[#71717A] hover:text-[#F4F4F5] p-1 rounded hover:bg-[#1E2026]">
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
