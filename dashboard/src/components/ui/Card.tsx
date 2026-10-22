import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'surface' | 'glow-blue' | 'glow-emerald' | 'gradient';
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  noPadding = false,
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-[#0b1220]/90 border border-[#1b2842] shadow-[0_4px_24px_rgba(0,0,0,0.4)]',
    surface: 'bg-[#0e172a]/95 border border-[#1e2e4a] shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
    'glow-blue': 'bg-[#0c162d]/90 border border-sky-500/40 shadow-[0_0_25px_rgba(14,165,233,0.2)]',
    'glow-emerald': 'bg-[#0a1e1b]/90 border border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.2)]',
    gradient: 'bg-gradient-to-b from-[#101b33] to-[#09101e] border border-[#233555] shadow-lg',
  }[variant];

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all duration-200 ${variantStyles} ${noPadding ? '' : 'p-4 sm:p-5'} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className = '' }) => (
  <div className={`flex items-center justify-between gap-3 mb-3.5 ${className}`}>
    <div>
      <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
        {title}
      </div>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
