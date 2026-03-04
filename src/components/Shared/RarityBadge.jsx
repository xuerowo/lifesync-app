import React from 'react';
import { RARITY_STYLES } from '../../constants/index.jsx';

const RarityBadge = ({ rarity, size = 'sm' }) => {
  const isLarge = size === 'lg';
  
  // Glassmorphism variants based on rarity
  const glassConfigs = {
    UR: 'bg-rose-500/15 border-rose-500/40 text-rose-600 shadow-rose-200/50',
    SSR: 'bg-amber-500/15 border-amber-500/40 text-amber-600 shadow-amber-200/50',
    SR: 'bg-purple-500/15 border-purple-500/40 text-purple-600 shadow-purple-200/50',
    R: 'bg-sky-500/15 border-sky-500/40 text-sky-600 shadow-sky-200/50',
    N: 'bg-slate-500/15 border-slate-500/40 text-slate-600 shadow-slate-200/50'
  };

  return (
    <div className={`relative inline-flex items-center justify-center font-black backdrop-blur-md overflow-hidden group transition-all duration-300 hover:scale-110 hover:-translate-y-1 active:scale-95 border ${
      isLarge ? 'px-6 py-2 rounded-2xl text-xl tracking-tighter shadow-xl' : 'px-3 py-1 rounded-full text-[10px] tracking-wider shadow-sm'
    } ${glassConfigs[rarity]}`}>
      {/* Inner Glossy Gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 via-transparent to-transparent opacity-60 pointer-events-none" />
      
      {/* Soft Top Glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />

      {/* High Rarity Sparkle Animation */}
      {(rarity === 'UR' || rarity === 'SSR') && (
        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 -translate-x-full animate-[shine_3s_infinite] pointer-events-none mix-blend-overlay" />
      )}

      {/* Shine Sweep on Hover */}
      <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-700 pointer-events-none" />

      <span className="relative z-10 leading-none select-none drop-shadow-sm -translate-x-[0.5px]">
        {rarity}
      </span>
    </div>
  );
};

export default RarityBadge;