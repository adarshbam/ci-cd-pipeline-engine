import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glow-blue' | 'dark-outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  icon,
  iconRight,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    xs: 'px-2 py-1 text-xs rounded-md gap-1',
    sm: 'px-2.5 py-1.5 text-xs rounded-lg gap-1.5 font-medium',
    md: 'px-3.5 py-2 text-sm rounded-lg gap-2 font-medium',
    lg: 'px-5 py-2.5 text-base rounded-xl gap-2.5 font-semibold',
  }[size];

  const variantClasses = {
    // Green Rerun button from screenshot
    primary: 'bg-[#10b981] hover:bg-[#059669] text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98]',
    // Dark slate button from screenshot
    secondary: 'bg-[#121c2d] hover:bg-[#1a2842] text-slate-200 border border-[#233554] shadow-sm hover:border-slate-600 active:scale-[0.98]',
    // Red Cancel Run button from screenshot
    danger: 'bg-[#2a131b] hover:bg-[#3d1825] text-red-400 border border-red-900/60 hover:border-red-500/50 shadow-sm active:scale-[0.98]',
    // Ghost
    ghost: 'bg-transparent hover:bg-slate-800/50 text-slate-300 hover:text-white',
    // Neon blue button (Upgrade to Pro CTA)
    'glow-blue': 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 active:scale-[0.98]',
    // Dark outline
    'dark-outline': 'bg-transparent border border-slate-700/80 hover:bg-slate-800/40 text-slate-300 hover:text-white',
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
      {!isLoading && iconRight && <span className="inline-flex shrink-0">{iconRight}</span>}
    </button>
  );
};
