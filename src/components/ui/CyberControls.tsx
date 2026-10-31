import React from 'react';

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const CyberControls: React.FC<Props> = ({ theme, onToggleTheme }) => {
  return (
    <div className="fixed top-4 right-4 z-40 flex items-center gap-2 font-mono text-xs">
      {/* Theme Switcher Toggle */}
      <div className="flex items-center p-1 rounded-full bg-slate-900/90 border border-fuchsia-500/40 shadow-[0_0_15px_rgba(217,70,239,0.25)]">
        <button
          onClick={onToggleTheme}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer font-bold ${
            theme === 'dark'
              ? 'btn-magenta-glow text-slate-950 shadow-[0_0_10px_rgba(217,70,239,0.8)]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          DARK
        </button>
        <button
          onClick={onToggleTheme}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer font-bold ${
            theme === 'light'
              ? 'btn-magenta-glow text-slate-950 shadow-[0_0_10px_rgba(217,70,239,0.8)]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          LIGHT
        </button>
      </div>
    </div>
  );
};