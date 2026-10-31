import React, { useState, useEffect } from 'react';

interface Props {
  onVerified: () => void;
}

export const VerificationCountdown: React.FC<Props> = ({ onVerified }) => {
  const [timeLeft, setTimeLeft] = useState(3);

  useEffect(() => {
    if (timeLeft === 0) {
      onVerified();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, onVerified]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0c0d10] text-[#e0e2e8] font-['USSO','Inter',sans-serif] select-none p-4">
      <div className="p-8 bg-[#13151c] rounded-xl border border-[#d8308f]/40 text-center max-w-sm w-full shadow-[0_0_30px_rgba(216,48,143,0.15)] relative overflow-hidden">
        {/* Accent Top Border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#d8308f] to-transparent" />

        <h1 className="text-xl font-bold font-mono text-[#f48fb1] mb-2 tracking-wider uppercase">
          エサのーForVidz
        </h1>
        <p className="text-xs text-[#8a8f9e] font-mono mb-6 leading-relaxed">
          Verifying browser environment and GPU capabilities...
        </p>
        <div className="text-6xl font-black font-mono text-[#d8308f] mb-4 animate-pulse drop-shadow-[0_0_15px_rgba(216,48,143,0.6)]">
          {timeLeft}
        </div>
        <p className="text-[10px] text-[#6e7382] font-mono uppercase tracking-widest">
          Preparing workspace...
        </p>
      </div>
    </div>
  );
};