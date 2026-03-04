import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2, Star, Search, RotateCw } from 'lucide-react';
import { RARITY_STYLES } from '../../constants';
import RarityBadge from '../Shared/RarityBadge';
import IpcImage from '../Shared/IpcImage';

const MultiRewardReveal = ({ results, onClaimAll, onCancel, setLightboxImage }) => {
  const [revealedIndices, setRevealedIndices] = useState([]);
  const [isAllRevealed, setIsAllRevealed] = useState(false);

  const revealOne = (index) => {
    if (revealedIndices.includes(index)) return;
    setRevealedIndices(prev => [...prev, index]);
  };

  const revealAll = () => {
    setRevealedIndices(results.map((_, i) => i));
    setIsAllRevealed(true);
  };

  useEffect(() => {
    if (revealedIndices.length === results.length) {
      setIsAllRevealed(true);
    }
  }, [revealedIndices, results.length]);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center bg-sky-950/95 backdrop-blur-3xl p-4 sm:p-6 overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-6xl mx-auto flex flex-col items-center min-h-full justify-center py-8 sm:py-12 gap-8 sm:gap-12">
        <div className="text-center space-y-3 sm:space-y-4 flex-shrink-0">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-3 px-6 py-2 bg-white/10 rounded-full border border-white/20"
          >
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span className="text-white font-black tracking-widest uppercase text-xs sm:text-sm">十連召喚結果</span>
          </motion.div>
        </div>

        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-6 w-full px-2"
          variants={{
            show: { transition: { staggerChildren: 0.1 } }
          }}
          initial="hidden"
          animate="show"
        >
          {results.map((reward, idx) => {
            const isRevealed = revealedIndices.includes(idx);
            
            return (
              <motion.div
                key={reward.id}
                variants={{
                  hidden: { y: 20, opacity: 0, scale: 0.8 },
                  show: { y: 0, opacity: 1, scale: 1 }
                }}
                className="relative aspect-[2/3] perspective-1000 group w-full max-w-[140px] md:max-w-[180px] mx-auto"
              >
                <div className={`relative w-full h-full transition-all duration-700 preserve-3d ${isRevealed ? 'rotate-y-180' : 'hover:scale-105 cursor-pointer'}`}>
                  {/* Back (Cover) */}
                  <div
                    className="absolute inset-0 backface-hidden rounded-[20px] md:rounded-[40px] bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 border-2 border-white/20 flex flex-col items-center justify-center gap-2 md:gap-4 shadow-2xl overflow-hidden z-20"
                    onClick={() => revealOne(idx)}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
                    <div className="w-10 h-10 md:w-16 md:h-16 rounded-full border-2 border-white/10 flex items-center justify-center bg-white/5 backdrop-blur-sm relative z-10">
                      <Sparkles className="w-5 h-5 md:w-8 md:h-8 text-white/40 animate-pulse" />
                    </div>
                    <div className="text-[8px] md:text-[10px] font-black text-white/20 tracking-[0.2em] md:tracking-[0.3em] uppercase relative z-10">Lifesync</div>
                  </div>

                  {/* Front (Reveal) */}
                  <div
                    className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[20px] md:rounded-[40px] border-2 md:border-4 shadow-2xl flex flex-col overflow-hidden bg-gray-900 group/reveal translate-z-[1px] ${
                      reward.rarity === 'UR' ? 'border-rose-500 shadow-rose-500/30' :
                      reward.rarity === 'SSR' ? 'border-amber-400 shadow-amber-500/30' :
                      reward.rarity === 'SR' ? 'border-purple-400 shadow-purple-500/30' :
                      reward.rarity === 'R' ? 'border-sky-400 shadow-sky-500/30' :
                      'border-slate-400 shadow-slate-500/30'
                    } ${reward.prize.type === 'image' ? 'cursor-zoom-in' : ''}`}
                    onClick={(e) => {
                      if (isRevealed && reward.prize.type === 'image') {
                        e.stopPropagation();
                        setLightboxImage(reward.prize.content);
                      }
                    }}
                  >
                    <div className="absolute top-2 left-2 md:top-4 md:left-4 z-30 scale-75 md:scale-100 origin-top-left">
                      <RarityBadge rarity={reward.rarity} size="xs" />
                    </div>
                    
                    {reward.prize.type === 'image' ? (
                      <div className="relative h-full bg-black flex items-center justify-center overflow-hidden pointer-events-none">
                        <IpcImage
                          src={reward.prize.content}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 z-20 bg-black/20 opacity-0 group-hover/reveal:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="bg-white/20 backdrop-blur-md p-2 rounded-full text-white border border-white/30">
                            <Search className="w-4 h-4 md:w-6 md:h-6" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center p-4 md:p-6 bg-slate-800 relative overflow-hidden">
                        <p className="relative z-10 text-[10px] md:text-sm font-black text-white drop-shadow-lg leading-relaxed break-words whitespace-pre-wrap text-center">
                          "{reward.prize.content}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 md:gap-6 pt-4 md:pt-8 flex-shrink-0 w-full px-6">
          {!isAllRevealed ? (
            <button
              onClick={revealAll}
              className="group relative px-10 py-4 bg-white/10 hover:bg-white/20 text-white text-base md:text-lg font-black rounded-full border border-white/20 transition-all active:scale-95 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
              <span className="relative flex items-center justify-center gap-3">
                <RotateCw className="w-5 h-5 md:w-6 md:h-6 animate-spin-slow" /> 全部翻開
              </span>
            </button>
          ) : (
            <>
              <button
                onClick={onClaimAll}
                className="group relative px-12 md:px-16 py-4 md:py-5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-lg md:text-xl font-black rounded-full shadow-[0_0_50px_rgba(245,158,11,0.3)] hover:shadow-[0_0_60px_rgba(245,158,11,0.5)] md:hover:-translate-y-1 active:scale-95 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
                <span className="relative flex items-center justify-center gap-2 md:gap-3">
                  <CheckCircle2 className="w-6 h-6 md:w-7 md:h-7" /> 全部收下
                </span>
              </button>
              <button
                onClick={onCancel}
                className="px-8 md:px-10 py-4 md:py-5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-base md:text-lg font-bold rounded-full border border-white/10 transition-all"
              >
                稍後領取
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
      `}</style>
    </div>
  );
};

export default MultiRewardReveal;