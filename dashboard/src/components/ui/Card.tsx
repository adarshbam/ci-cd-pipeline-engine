import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'surface' | 'elevated' | 'glow-blue' | 'glow-emerald' | 'gradient';
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
    default: 'bg-[#111317] border border-[#27272A]',
    surface: 'bg-[#111317] border border-[#27272A]',
    elevated: 'bg-[#181A1F] border border-[#27272A]',
    'glow-blue': 'bg-[#111317] border border-[#27272A]',
    'glow-emerald': 'bg-[#111317] border border-[#27272A]',
    gradient: 'bg-[#111317] border border-[#27272A]',
  }[variant];

  return (
    <div
      className={`rounded-xl overflow-hidden transition-colors ${variantStyles} ${noPadding ? '' : 'p-4 sm:p-5'} ${className}`}
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
      <div className="text-sm font-semibold text-[#F4F4F5] flex items-center gap-2">
        {title}
      </div>
      {subtitle && <p className="text-xs text-[#A1A1AA] mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
