import React, { useEffect } from 'react';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  type?: 'default' | 'danger' | 'success' | 'warning';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  isConfirmLoading?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  type = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  isConfirmLoading = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getTypeIcon = () => {
    switch (type) {
      case 'danger':
        return (
          <div className="w-8 h-8 rounded-lg bg-[#241215] border border-[#4C1D24] flex items-center justify-center text-[#F87171] shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-8 h-8 rounded-lg bg-[#241A0E] border border-[#4C3415] flex items-center justify-center text-[#FBBF24] shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
        );
      case 'success':
        return (
          <div className="w-8 h-8 rounded-lg bg-[#0D1F17] border border-[#164E35] flex items-center justify-center text-[#34D399] shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-[#181A20] border border-[#27272A] flex items-center justify-center text-[#3B82F6] shrink-0">
            <Info className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg rounded-xl bg-[#111317] border border-[#27272A] shadow-2xl overflow-hidden p-6 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            {getTypeIcon()}
            <div>
              <h3 className="text-sm font-semibold text-[#F4F4F5]">{title}</h3>
              {description && (
                <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717A] hover:text-[#F4F4F5] p-1 rounded-md hover:bg-[#1E2026] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children && <div className="mt-4 pt-3 border-t border-[#27272A]">{children}</div>}

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-[#27272A]">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isConfirmLoading}>
            {cancelLabel}
          </Button>
          {onConfirm && (
            <Button
              variant={type === 'danger' ? 'danger' : 'primary'}
              size="sm"
              isLoading={isConfirmLoading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
