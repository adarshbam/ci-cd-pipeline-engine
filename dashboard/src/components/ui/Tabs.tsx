import React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number | string;
}

export interface TabsProps {
  items: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pills' | 'segmented';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}) => {
  if (variant === 'segmented') {
    return (
      <div className={`inline-flex p-1 rounded-lg bg-[#141519] border border-[#27272A] ${className}`}>
        {items.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors select-none ${
                isActive
                  ? 'bg-[#22242B] text-[#F4F4F5] border border-[#2F323B]'
                  : 'text-[#71717A] hover:text-[#D4D4D8] hover:bg-[#1A1C22]'
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? 'bg-[#2F323B] text-[#F4F4F5]' : 'bg-[#1D1E24] text-[#71717A]'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`flex border-b border-[#27272A] gap-4 sm:gap-6 text-xs sm:text-sm overflow-x-auto scrollbar-none whitespace-nowrap ${className}`}
    >
      {items.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 py-3 relative font-medium transition-colors select-none shrink-0 ${
              isActive
                ? 'text-[#F4F4F5] font-semibold'
                : 'text-[#71717A] hover:text-[#D4D4D8]'
            }`}
          >
            {tab.icon && (
              <span className={`transition-colors ${isActive ? 'text-[#3B82F6]' : 'text-[#71717A]'}`}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-mono ${
                isActive ? 'bg-[#181A20] text-[#D4D4D8] border border-[#27272A]' : 'bg-[#141519] text-[#71717A]'
              }`}>
                {tab.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
};
