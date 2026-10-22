import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { WebhookNodeData } from '../dagTypes';

export const WebhookNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as WebhookNodeData;

  return (
    <div
      className={`relative w-[140px] h-[72px] rounded-2xl bg-[#0c1628]/95 border border-[#1e2f4f] p-2.5 flex items-center gap-3 shadow-xl select-none transition-all duration-200 ${
        selected ? 'ring-2 ring-sky-400 border-sky-400' : 'hover:border-slate-500'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-100 shadow-md">
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      </div>

      <div className="flex flex-col overflow-hidden text-left">
        <span className="text-xs font-bold text-slate-100">{nodeData.label || 'Webhook'}</span>
        <span className="text-[10px] text-slate-400 truncate">{nodeData.subtitle || 'push to main'}</span>
        <span className="text-[9px] text-slate-500 font-mono">{nodeData.time || '10:24 AM'}</span>
      </div>

      {/* Output source handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-1.5 !h-1.5 !opacity-0 !border-0"
      />
    </div>
  );
};
