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
    lg: 'px-4.5 py-2.5 text-sm rounded-lg gap-2 font-semibold',
  }[size];

  const variantClasses = {
    // Primary action: Solid engineering accent
    primary: 'bg-[#3B82F6] hover:bg-[#2563EB] text-white active:scale-[0.99] transition-colors',
    // Secondary action: Solid neutral dark surface
    secondary: 'bg-[#16181D] hover:bg-[#20222A] text-[#E4E4E7] border border-[#27272A] hover:border-[#383B46] active:scale-[0.99] transition-colors',
    // Destructive: Restrained dark red
    danger: 'bg-[#241416] hover:bg-[#34181C] text-[#F87171] border border-[#451A1D] hover:border-[#6B2228] active:scale-[0.99] transition-colors',
    // Ghost: Subtle hover
    ghost: 'bg-transparent hover:bg-[#181A20] text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors',
    // Legacy alias mapped to clean primary
    'glow-blue': 'bg-[#3B82F6] hover:bg-[#2563EB] text-white active:scale-[0.99] transition-colors',
    // Dark outline: Clean border button
    'dark-outline': 'bg-transparent border border-[#27272A] hover:bg-[#181A20] text-[#D4D4D8] hover:text-white transition-colors',
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center select-none font-medium disabled:opacity-50 disabled:pointer-events-none ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
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
