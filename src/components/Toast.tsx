import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  message: string;
  onClose: () => void;
  duration?: number;
}

export function Toast({ type, message, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-900/90 border-green-700 text-green-100';
      case 'error':
        return 'bg-red-900/90 border-red-700 text-red-100';
      case 'warning':
        return 'bg-amber-900/90 border-amber-700 text-amber-100';
      case 'info':
        return 'bg-blue-900/90 border-blue-700 text-blue-100';
    }
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-md w-full animate-slide-in`}>
      <div className={`flex items-start gap-3 p-4 border rounded-lg shadow-lg backdrop-blur-sm ${getStyles()}`}>
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
        <p className="flex-1 text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
