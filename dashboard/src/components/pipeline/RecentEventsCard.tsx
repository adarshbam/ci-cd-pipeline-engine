import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Play, Loader2, GitCommit } from 'lucide-react';
import { RecentEvent } from '../../types';

export interface RecentEventsCardProps {
  events: RecentEvent[];
  onViewAll?: () => void;
}

export const RecentEventsCard: React.FC<RecentEventsCardProps> = ({
  events,
  onViewAll,
}) => {
  const navigate = useNavigate();

  const getEventIcon = (event: RecentEvent) => {
    if (event.type === 'webhook') {
      return (
        <div className="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </div>
      );
    }

    if (event.status === 'running') {
      return (
        <div className="w-6 h-6 rounded-full bg-sky-950/80 border border-sky-400 flex items-center justify-center text-sky-400 shrink-0 shadow-[0_0_8px_rgba(56,189,248,0.5)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </div>
      );
    }

    if (event.type === 'system') {
      return (
        <div className="w-6 h-6 rounded-full bg-emerald-950/70 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
          <Play className="w-3 h-3 fill-emerald-400/30" />
        </div>
      );
    }

    return (
      <div className="w-6 h-6 rounded-full bg-emerald-950/70 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
        <Check className="w-3.5 h-3.5 stroke-[3]" />
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-[#090f1e] border border-[#192742] overflow-hidden shadow-xl p-5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-100">Recent Events</h3>
        <button
          onClick={onViewAll || (() => navigate('/runs'))}
          className="text-xs font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
        >
          View all
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Events Stream matching screenshot */}
      <div className="space-y-3.5">
        {events.map((evt) => (
          <div key={evt.id} className="flex items-start gap-3">
            {getEventIcon(evt)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {evt.title}
                </span>
                <span className="text-[10px] text-slate-500 font-mono shrink-0">
                  {evt.timestamp}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate leading-relaxed">
                {evt.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
