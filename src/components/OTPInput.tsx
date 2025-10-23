import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import { Loader, Clock } from 'lucide-react';

interface OTPInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  loading?: boolean;
  error?: string;
  expiryMinutes?: number;
  onExpiry?: () => void;
}

export function OTPInput({
  length = 6,
  onComplete,
  loading = false,
  error,
  expiryMinutes = 10,
  onExpiry
}: OTPInputProps) {
  const [otp, setOtp] = useState<string[]>(new Array(length).fill(''));
  const [timeRemaining, setTimeRemaining] = useState(expiryMinutes * 60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onExpiry) {
            onExpiry();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onExpiry]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpiringSoon = timeRemaining <= 120;

  const handleChange = (index: number, value: string) => {
    if (loading) return;

    const newValue = value.replace(/[^0-9]/g, '');

    if (newValue.length > 1) {
      const digits = newValue.slice(0, length).split('');
      const newOtp = [...otp];

      digits.forEach((digit, i) => {
        if (index + i < length) {
          newOtp[index + i] = digit;
        }
      });

      setOtp(newOtp);

      const nextIndex = Math.min(index + digits.length, length - 1);
      inputRefs.current[nextIndex]?.focus();

      if (newOtp.every(digit => digit !== '')) {
        onComplete(newOtp.join(''));
      }

      return;
    }

    const newOtp = [...otp];
    newOtp[index] = newValue;
    setOtp(newOtp);

    if (newValue && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every(digit => digit !== '')) {
      onComplete(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (loading) return;

    if (e.key === 'Backspace') {
      e.preventDefault();

      const newOtp = [...otp];

      if (otp[index]) {
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (loading) return;

    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '');

    if (pastedData) {
      const digits = pastedData.slice(0, length).split('');
      const newOtp = new Array(length).fill('');

      digits.forEach((digit, i) => {
        newOtp[i] = digit;
      });

      setOtp(newOtp);

      const nextIndex = Math.min(digits.length, length - 1);
      inputRefs.current[nextIndex]?.focus();

      if (newOtp.every(digit => digit !== '')) {
        onComplete(newOtp.join(''));
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-center">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={loading || timeRemaining === 0}
            className={`w-12 h-14 text-center text-2xl font-bold bg-gray-700 border-2 rounded-lg text-white focus:outline-none focus:ring-2 transition-all ${
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-600 focus:ring-amber-500 focus:border-amber-500'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            autoComplete="off"
          />
        ))}
      </div>

      <div className={`flex items-center justify-center gap-2 text-sm ${
        isExpiringSoon ? 'text-red-400' : 'text-gray-400'
      }`}>
        <Clock className="w-4 h-4" />
        <span className="font-medium">
          {timeRemaining === 0 ? 'Code expiré' : `Expire dans ${formatTime(timeRemaining)}`}
        </span>
      </div>

      {isExpiringSoon && timeRemaining > 0 && (
        <div className="text-center text-amber-400 text-xs">
          Attention: Le code expire bientôt
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <Loader className="w-4 h-4 animate-spin" />
          <span className="text-sm">Vérification en cours...</span>
        </div>
      )}

      {error && (
        <div className="text-center text-red-400 text-sm">
          {error}
        </div>
      )}

      {timeRemaining === 0 && (
        <div className="text-center text-red-400 text-sm font-semibold">
          Le code OTP a expiré. Votre compte a été supprimé. Veuillez recommencer.
        </div>
      )}
    </div>
  );
}
