'use client';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react';

export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      icon: <CheckCircle2 className="w-4 h-4 text-success" />,
      className: 'glass-card text-xs font-medium',
    });
  },
  error: (message: string) => {
    toast.error(message, {
      icon: <XCircle className="w-4 h-4 text-danger" />,
      className: 'glass-card text-xs font-medium',
    });
  },
  info: (message: string) => {
    toast.info(message, {
      icon: <Info className="w-4 h-4 text-accent" />,
      className: 'glass-card text-xs font-medium',
    });
  },
  warning: (message: string) => {
    toast.warning(message, {
      icon: <AlertCircle className="w-4 h-4 text-warning" />,
      className: 'glass-card text-xs font-medium',
    });
  }
};
