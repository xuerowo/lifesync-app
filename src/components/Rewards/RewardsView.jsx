import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import IpcImage from '../Shared/IpcImage';
import { Gift, Percent, CheckCircle2, Zap, ImageIcon, Search, ChevronDown, Plus, BarChart3, Edit3, Trash2, ChevronLeft, ChevronRight, BookOpen, Heart, Smile, Trophy, RotateCw, Star, ArrowUp, ArrowDown, Sparkles, History, Tag, Layers } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { useLottery } from '../../hooks/useLottery';
import { RARITY_STYLES, ITEMS_PER_PAGE } from '../../constants/index.jsx';
import RarityBadge from '../Shared/RarityBadge';

const EditableContent = ({ initialValue, onSave, className, placeholder }) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const textareaRef = useRef(null);

  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localValue]);

  return (
    <textarea
      ref={textareaRef}
      value={localValue}
      placeholder={placeholder}
      rows={1}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        if (localValue !== initialValue) {
          onSave(localValue);
        }
      }}
      className={className}
    />
  );
};

const RewardsView = ({
  rewardSubTab,
  setRewardSubTab,
  setEditingHistory,
  setRewardToShow,
  setRewardStage,
  isScanning,
  setIsScanning,
  blurImages,
  setBlurImages
}) => {
  const { data, updateData, getIndicatorStats, consumeLotteryTickets } = useAppData();
  const { performLottery, performLotteryForRarity } = useLottery();
  
  const [expandedImagePools, setExpandedImagePools] = useState({});
  const [rewardHistoryPage, setRewardHistoryPage] = useState(1);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState([]);

  const scanRewardFolder = async (folderPath, targetRarity = 'R') => {
    if (!folderPath || !folderPath.trim()) { alert('請輸入資料夾路徑'); return; }
    setIsScanning(true);
    try {
      let result;
      if (window.electronAPI) {
        result = await window.electronAPI.scanFolder(folderPath.trim());
      } else {
        const response = await fetch('/api/rewards/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath: folderPath.trim() }) });
        result = await response.json();
        if (!response.ok) throw new Error(result.error);
      }

      if (result.success) {
        let finalImages = result.images.map(img => img.path);
        
        // 如果在 Electron 環境，進行同步下載到 app 資料夾
        if (window.electronAPI) {
          const syncResult = await window.electronAPI.syncImages(finalImages);
          if (syncResult.success) {
            finalImages = syncResult.images.map(img => img.path);
          } else {
            console.error('同步圖片失敗:', syncResult.error);
            // 失敗時仍保留原始路徑作為備援，或視情況報錯
          }
        }

        const imagePoolPrize = { id: crypto.randomUUID(), type: 'image-pool', content: finalImages, folderPath: folderPath.trim() };
        updateData(prev => ({ ...prev, rewardFolderPath: folderPath.trim(), lotteryPrizes: { ...prev.lotteryPrizes, [targetRarity]: [...prev.lotteryPrizes[targetRarity], imagePoolPrize] } }));
        alert(`成功載入並同步圖片池 (${result.count} 張) 到 ${targetRarity} 級卡池！`);
      } else { alert(`掃描失敗：${result.error}`); }
    } catch (error) { alert(`掃描失敗: ${error.message}`); } finally { setIsScanning(false); }
  };

  const claimAchievementReward = (achievement) => {
    if (achievement.claimed) return;
    const currentCount = getIndicatorStats(achievement.type);
    if (currentCount < achievement.condition) {
      alert(`尚未達成條件！目前進度：${currentCount}/${achievement.condition}`);
      return;
    }
    updateData(prev => ({
      ...prev,
      achievements: prev.achievements.map(a => a.id === achievement.id ? { ...a, claimed: true, claimedAt: new Date().toISOString() } : a)
    }));
  };

  const handleDraw = (count) => {
    const cost = count === 10 ? 9 : count;
    if (consumeLotteryTickets(cost)) {
      const results = [];
      for (let i = 0; i < count; i++) {
        const result = performLottery();
        if (result) {
          results.push({
            id: crypto.randomUUID(),
            ...result,
            timestamp: new Date().toISOString(),
            claimed: false
          });
        }
      }
      if (results.length > 0) {
        updateData(prev => ({ ...prev, rewardHistory: [...results, ...prev.rewardHistory] }));
        if (count === 1) {
          setRewardToShow(results[0]);
          setRewardStage('pack');
        } else {
          // 觸發十連抽專屬動畫狀態
          setRewardToShow({ results, isMulti: true });
          setRewardStage('multi-pack');
        }
      }
    } else {
      alert('抽卡券不足！');
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
        <div className="flex items-center gap-4 md:gap-5">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[2rem] bg-white/40 backdrop-blur-2xl border border-white/60 flex items-center justify-center shadow-xl shadow-sky-100/50 text-sky-500 shrink-0">
            <Gift className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl md:text-4xl font-black text-sky-900 tracking-tight">獎勵寶庫</h2>
            <nav className="flex gap-4 mt-1 overflow-x-auto no-scrollbar pb-1">
              {[
                { id: 'lottery', name: '抽卡大廳' },
                { id: 'config', name: '卡池配置' },
                { id: 'pending', name: '待領取', count: data.rewardHistory.filter(h => !h.claimed).length },
                { id: 'history', name: '中獎紀錄' },
                { id: 'achievements', name: '成就區', count: data.achievements.filter(a => {
                  const currentCount = getIndicatorStats(a.type);
                  return currentCount >= a.condition && !a.claimed;
                }).length }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setRewardSubTab(tab.id)}
                  className={`text-xs md:text-sm font-black transition-all flex items-center gap-2 group relative py-1 whitespace-nowrap ${rewardSubTab === tab.id ? 'text-sky-700' : 'text-sky-500 hover:text-sky-600'}`}
                >
                  <span className={`relative ${rewardSubTab === tab.id ? 'after:absolute after:-bottom-1 after:left-0 after:w-full after:h-1 after:bg-sky-500 after:rounded-full' : ''}`}>
                    {tab.name}
                  </span>
                  {tab.count > 0 && (
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0, x: 10 }}
                      animate={{ scale: 1, opacity: 1, x: 0 }}
                      className="flex items-center justify-center min-w-[16px] h-[16px] md:min-w-[18px] md:h-[18px] px-1 bg-gradient-to-tr from-rose-500 to-rose-400 text-white text-[8px] md:text-[9px] font-black rounded-full shadow-[0_4px_12px_rgba(244,63,94,0.4)] border border-white/20 -ml-1"
                    >
                      {tab.count}
                    </motion.span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['UR', 'SSR', 'SR', 'R', 'N'].map(r => (
            <div key={r} className={`px-2 py-1 md:px-3 md:py-1.5 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm border-2 ${RARITY_STYLES[r].border} flex items-center gap-1.5 md:gap-2 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 md:hover:-translate-y-1.5 hover:scale-105`}>
              <RarityBadge rarity={r} size="xs" />
              <span className={`text-[10px] md:text-xs font-black ${RARITY_STYLES[r].color}`}>{data.lotteryPrizes[r].length}</span>
            </div>
          ))}
        </div>
      </div>

      {rewardSubTab === 'lottery' && (
        <div className="space-y-6 md:space-y-8 animate-in slide-up">
          <div className="bg-white/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-12 border border-white shadow-xl text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-sky-400/10 to-purple-400/10 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-6 md:mb-8">
                <div className="inline-flex items-center gap-3 px-4 py-2 md:px-6 md:py-3 bg-white/60 backdrop-blur-md rounded-full border border-white/60 shadow-sm mb-4 md:mb-6">
                  <Tag className="w-4 h-4 md:w-5 md:h-5 text-amber-500 fill-current" />
                  <div className="flex items-center gap-1">
                    <span className="text-sm md:text-lg font-black text-sky-900">持有抽卡券：</span>
                    <input
                      type="number"
                      value={data.lotteryTickets || 0}
                      onChange={(e) => updateData(prev => ({ ...prev, lotteryTickets: parseInt(e.target.value) || 0 }))}
                      style={{ width: `${(data.lotteryTickets || 0).toString().length + 1.5}ch`, minWidth: '3ch' }}
                      className="bg-sky-50/50 hover:bg-white focus:bg-white text-amber-500 text-xl md:text-2xl font-black px-2 rounded-xl outline-none border-2 border-transparent focus:border-amber-300 transition-all text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      title="點擊編輯數量"
                    />
                    <span className="text-sm md:text-lg font-black text-sky-900">張</span>
                  </div>
                </div>
                <h3 className="text-3xl md:text-4xl font-black text-sky-900 tracking-tight mb-1 md:mb-2">幸運抽卡</h3>
                <p className="text-xs md:text-sm text-sky-500 font-bold">消耗抽卡券，獲取隨機獎勵</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 md:gap-6 w-full max-w-2xl justify-center">
                <button
                  onClick={() => handleDraw(1)}
                  disabled={(data.lotteryTickets || 0) < 1}
                  className="group relative flex-1 aspect-[4/5] sm:aspect-auto sm:w-64 sm:h-80 bg-white/60 hover:bg-white rounded-[32px] border-2 border-white shadow-xl transition-all hover:-translate-y-2 hover:shadow-2xl flex flex-col items-center justify-center gap-4 md:gap-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-xl p-6"
                >
                  <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-500">
                    <Sparkles className="w-8 h-8 md:w-12 md:h-12" />
                  </div>
                  <div className="text-center">
                    <h4 className="text-xl md:text-2xl font-black text-sky-900 mb-0.5 md:mb-1">單次召喚</h4>
                    <p className="text-sky-500 font-bold text-xs md:text-sm">消耗 1 張抽卡券</p>
                  </div>
                </button>

                <button
                  onClick={() => handleDraw(10)}
                  disabled={(data.lotteryTickets || 0) < 9}
                  className="group relative flex-1 aspect-[4/5] sm:aspect-auto sm:w-64 sm:h-80 bg-gradient-to-br from-amber-50 to-orange-50 hover:from-white hover:to-white rounded-[32px] border-2 border-amber-200 hover:border-amber-300 shadow-xl transition-all hover:-translate-y-2 hover:shadow-2xl flex flex-col items-center justify-center gap-4 md:gap-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-xl p-6"
                >
                  <div className="absolute top-3 right-3 md:top-4 md:right-4 px-2 md:px-3 py-1 bg-rose-500 text-white text-[8px] md:text-[10px] font-black rounded-full shadow-md">九折優惠</div>
                  <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-500">
                    <div className="relative">
                      <Sparkles className="w-8 h-8 md:w-12 md:h-12" />
                      <Sparkles className="w-4 h-4 md:w-6 md:h-6 absolute -top-1 -right-3 md:-top-2 md:-right-4 text-yellow-200 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center">
                    <h4 className="text-xl md:text-2xl font-black text-amber-800 mb-0.5 md:mb-1">十連召喚</h4>
                    <p className="text-amber-600 font-bold text-xs md:text-sm">消耗 <span className="line-through opacity-50 mr-1">10</span> <span className="text-rose-500 font-black">9</span> 張抽卡券</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rewardSubTab === 'config' && (
        <div className="space-y-8 animate-in slide-up">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white/60 backdrop-blur-xl rounded-[40px] p-8 border border-white shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-100 rounded-xl text-sky-500"><Percent className="w-5 h-5" /></div>
                  <h3 className="text-xl font-black text-sky-900">機率分布</h3>
                </div>
                {(() => {
                  const total = Object.values(data.lotteryProbability).reduce((a, b) => a + b, 0);
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-[10px] border transition-colors duration-500 ${
                        total === 100 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        total > 100 ? 'bg-rose-50 text-rose-500 border-rose-100' :
                        'bg-amber-50 text-amber-600 border-amber-100'
                      }`}
                    >
                      {total === 100 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5 animate-pulse" />}
                      目前總和：{total}%
                      {total !== 100 && <span className="opacity-60 ml-1">(需等於 100%)</span>}
                    </motion.div>
                  );
                })()}
              </div>
              <div className="h-16 w-full bg-gray-900/5 rounded-[2rem] p-1.5 mb-10 shadow-inner border border-white/60 flex overflow-hidden">
                <div className="flex-grow flex rounded-[1.6rem] overflow-hidden shadow-2xl relative">
                  <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-white/30 via-white/5 to-black/10" />
                  {['UR', 'SSR', 'SR', 'R', 'N'].map(r => {
                    const style = RARITY_STYLES[r];
                    const prob = data.lotteryProbability[r];
                    if (prob <= 0) return null;
                    return (<div key={r} className={`h-full transition-all duration-1000 flex items-center justify-center relative group bg-gradient-to-r ${style.gradient} border-r border-white/30 last:border-r-0`} style={{ width: `${prob}%` }}>{(r === 'UR' || r === 'SSR') && (<div className="absolute inset-0 animate-pulse bg-white/20 mix-blend-overlay" />)}<div className="relative z-20 flex flex-col items-center -gap-1 pointer-events-none"><span className="text-[10px] font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">{r}</span><span className="text-[7px] font-black text-white/90 drop-shadow-sm">{prob}%</span></div><div className="absolute inset-0 bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity z-30" /></div>);
                  })}
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                {['UR', 'SSR', 'SR', 'R', 'N'].map(r => (
                  <div key={r} className={`relative group p-4 rounded-3xl border-2 transition-all ${RARITY_STYLES[r].lightBg} ${RARITY_STYLES[r].border} hover:bg-white`}><div className="flex justify-between items-start mb-2"><span className={`text-xs font-black ${RARITY_STYLES[r].color}`}>{r}</span>{RARITY_STYLES[r].icon}</div><div className="flex items-baseline gap-1"><input type="number" value={data.lotteryProbability[r]} onChange={(e) => updateData(prev => ({ ...prev, lotteryProbability: { ...prev.lotteryProbability, [r]: Number(e.target.value) } }))} className={`w-full bg-transparent text-2xl font-black ${RARITY_STYLES[r].color} outline-none`} /><span className="text-xs font-bold text-gray-400">%</span></div></div>
                ))}
              </div>
            </div>
            <div className="bg-sky-900/5 backdrop-blur-xl rounded-[40px] p-8 border border-white/50 shadow-xl flex flex-col justify-between">
              <div><div className="flex items-center gap-3 mb-6"><div className="p-2 bg-sky-100 rounded-xl text-sky-500"><ImageIcon className="w-5 h-5" /></div><h3 className="text-xl font-black text-sky-900">圖庫同步</h3></div><div className="space-y-4"><div className="relative"><input type="text" value={data.rewardFolderPath} onChange={(e) => updateData(prev => ({ ...prev, rewardFolderPath: e.target.value }))} placeholder="資料夾路徑..." className="w-full bg-white p-4 pl-10 rounded-2xl text-sm font-bold text-sky-800 outline-none border-2 border-transparent focus:border-sky-300 shadow-sm" /><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /></div><div className="relative flex-grow"><select id="targetRarity" className="w-full appearance-none bg-white p-4 rounded-2xl text-sm font-black text-sky-800 outline-none border-2 border-transparent focus:border-sky-300 cursor-pointer"><option value="N">N 級卡池</option><option value="R">R 級卡池</option><option value="SR">SR 級卡池</option><option value="SSR">SSR 級卡池</option><option value="UR">UR 級卡池</option></select><ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400 pointer-events-none" /></div></div></div>
              <button onClick={() => { const targetRarity = document.getElementById('targetRarity').value; scanRewardFolder(data.rewardFolderPath, targetRarity); }} disabled={isScanning} className={`group relative w-full mt-6 py-4 rounded-[1.5rem] font-black transition-all hover:-translate-y-2 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 overflow-hidden shadow-xl ${isScanning ? 'bg-slate-400/20 text-slate-400 cursor-wait' : 'bg-slate-900/10 backdrop-blur-md border border-slate-900/20 text-slate-900 hover:bg-slate-900/20'}`}>{!isScanning && (<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />)}{isScanning ? <RotateCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />}{isScanning ? '掃描中...' : '加入卡池'}</button>
            </div>
          </div>
          <div className="space-y-8">
            {['UR', 'SSR', 'SR', 'R', 'N'].map((rarity, idx) => {
              const prizes = data.lotteryPrizes[rarity];
              const style = RARITY_STYLES[rarity];
              return (
                <div key={rarity} className={`bg-white/40 backdrop-blur-md rounded-[40px] border-2 ${style.border} shadow-xl relative`} style={{ zIndex: 10 - idx }}>
                  <div className={`p-6 bg-gradient-to-r ${style.gradient} relative overflow-hidden flex justify-between items-center rounded-t-[38px]`}><div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" /><div className="relative z-10 flex items-center gap-4"><div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl text-white">{style.icon}</div><h3 className="text-3xl font-black text-white italic tracking-tighter">{rarity}</h3><span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold text-white backdrop-blur-sm border border-white/30">{prizes.length} 個獎品</span></div><button onClick={() => { updateData(prev => ({ ...prev, lotteryPrizes: { ...prev.lotteryPrizes, [rarity]: [...prev.lotteryPrizes[rarity], { id: crypto.randomUUID(), type: 'text', content: '' }] } })); }} className="group relative z-10 p-3 bg-white/20 hover:bg-white text-white hover:text-sky-600 rounded-2xl transition-all backdrop-blur-sm shadow-xl border border-white/30 hover:scale-110 active:scale-90" title="新增文字獎品"><Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" /></button></div>
                  <div className="p-6">
                    {prizes.length === 0 ? (<div className={`py-12 text-center border-2 border-dashed ${style.border} rounded-3xl bg-white/30`}><p className={`${style.color} font-bold text-sm opacity-60`}>暫無獎品</p></div>) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {prizes.map((prize, pIdx) => (
                          <div key={prize.id} className="group bg-white hover:bg-sky-50 p-4 rounded-3xl border border-sky-100 shadow-sm hover:shadow-md transition-all duration-200 relative hover:z-20 flex flex-col h-auto">
                            <div className="flex items-start gap-4"><span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-2xl text-xs font-black ${style.lightBg} ${style.color}`}>{pIdx + 1}</span><div className="flex-grow min-w-0 pt-1">
                              {prize.type === 'text' ? (
                                <EditableContent
                                  initialValue={prize.content}
                                  onSave={(newVal) => {
                                    updateData(prev => ({
                                      ...prev,
                                      lotteryPrizes: {
                                        ...prev.lotteryPrizes,
                                        [rarity]: prev.lotteryPrizes[rarity].map(p => p.id === prize.id ? { ...p, content: newVal } : p)
                                      }
                                    }));
                                  }}
                                  className="w-full bg-transparent font-bold text-gray-700 outline-none focus:text-sky-600 transition-colors border-b border-transparent focus:border-sky-200 pb-1 resize-none overflow-hidden block break-words whitespace-pre-wrap min-h-[1.5em]"
                                  placeholder="請輸入獎勵內容..."
                                />
                              ) : (
                                <div className="flex items-center gap-3">{prize.type === 'image-pool' ? (<div className="flex items-center gap-3 w-full"><div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-500"><ImageIcon className="w-5 h-5" /></div><div className="min-w-0"><div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-black">圖庫</span><p className="font-bold text-gray-700 break-all text-sm">{prize.folderPath?.split('\\').pop()}</p></div><p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{prize.content.length} 張圖片</p></div></div>) : (<div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-500"><ImageIcon className="w-5 h-5" /></div><span className="font-bold text-gray-700 break-all text-sm">{prize.content.split('\\').pop()}</span></div>)}</div>
                              )}
                            </div></div>
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm p-1 rounded-xl shadow-sm z-30 pointer-events-none group-hover:pointer-events-auto">
                              {prize.type === 'image-pool' && (<button onClick={() => setExpandedImagePools(prev => ({ ...prev, [prize.id]: !prev[prize.id] }))} className="p-2 text-sky-400 hover:bg-sky-50 rounded-lg">{expandedImagePools[prize.id] ? <ChevronDown className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}</button>)}
                              <div className="relative group/move"><button className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><ArrowUp className="w-4 h-4 rotate-45" /></button><div className="absolute right-0 top-full w-32 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden hidden group-hover/move:block z-50 pt-1">{['UR', 'SSR', 'SR', 'R', 'N'].filter(r => r !== rarity).map(r => (<button key={r} onClick={() => { updateData(prev => ({ ...prev, lotteryPrizes: { ...prev.lotteryPrizes, [rarity]: prev.lotteryPrizes[rarity].filter(p => p.id !== prize.id), [r]: [...prev.lotteryPrizes[r], prize] } })); }} className="w-full text-left px-4 py-2 text-xs font-bold text-gray-600 hover:bg-sky-50 hover:text-sky-600">移至 {r}</button>))}</div></div>
                              <button onClick={() => { if(confirm('確定要刪除？')) updateData(prev => ({ ...prev, lotteryPrizes: { ...prev.lotteryPrizes, [rarity]: prev.lotteryPrizes[rarity].filter(p => p.id !== prize.id) } })) }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </div>
                            {prize.type === 'image-pool' && expandedImagePools[prize.id] && (
                              <div className="mt-4 p-4 bg-gray-50/80 rounded-2xl border border-gray-100 animate-in slide-down">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="text-xs font-black text-gray-400 uppercase">預覽</span>
                                  <button onClick={() => setBlurImages(!blurImages)} className="text-xs font-bold text-sky-500">{blurImages ? '顯示' : '隱藏'}</button>
                                </div>
                                <div className="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                  {prize.content.map((imgPath, imgIdx) => (
                                    <div key={imgIdx} className="aspect-square rounded-xl overflow-hidden bg-white border border-gray-200 relative group/img">
                                      <IpcImage
                                        src={imgPath}
                                        className={`w-full h-full object-cover transition-all duration-500 ${blurImages ? 'blur-md scale-110' : 'blur-0 scale-100'}`}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rewardSubTab === 'achievements' && (
        <div className="space-y-10 animate-in slide-up">
          {[
            { id: 'total', name: '總成就', icon: <Trophy className="w-6 h-6" />, color: 'from-slate-400 to-slate-600' },
            { id: 'learning', name: '學習成就', icon: <BookOpen className="w-6 h-6" />, color: 'from-blue-400 to-indigo-400' },
            { id: 'health', name: '健康成就', icon: <Heart className="w-6 h-6" />, color: 'from-cyan-400 to-teal-400' },
            { id: 'happiness', name: '幸福成就', icon: <Smile className="w-6 h-6" />, color: 'from-amber-300 to-orange-400' }
          ].map(category => {
            const categoryAchievements = data.achievements
              .filter(a => a.type === category.id)
              .sort((a, b) => {
                if (a.condition !== b.condition) return a.condition - b.condition;
                return new Date(a.createdAt) - new Date(b.createdAt);
              });
            const currentCount = getIndicatorStats(category.id);
            
            return (
              <div key={category.id} className="bg-white/40 backdrop-blur-xl rounded-[40px] p-8 border border-white shadow-xl">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${category.color} flex items-center justify-center text-white shadow-lg`}>{category.icon}</div>
                    <div>
                      <h3 className="text-2xl font-black text-sky-900">{category.name}</h3>
                      <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">目前累計：{currentCount} 次</p>
                    </div>
                  </div>
                  <button onClick={() => {
                    const existingAchievements = data.achievements.filter(a => a.type === category.id);
                    const maxCondition = existingAchievements.length > 0 ? Math.max(...existingAchievements.map(a => a.condition || 0)) : 0;
                    const newAchievement = { id: crypto.randomUUID(), type: category.id, title: '', condition: maxCondition + 10, rewardText: '', claimed: false, createdAt: new Date().toISOString() };
                    updateData(prev => ({ ...prev, achievements: [...prev.achievements, newAchievement] }));
                  }} className="group relative px-5 py-3 bg-white/40 backdrop-blur-md border border-white/60 text-sky-600 rounded-2xl hover:bg-white/60 hover:-translate-y-1.5 hover:scale-[1.05] active:scale-95 transition-all duration-300 flex items-center gap-2 font-black text-xs shadow-sm overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
                    <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
                    <span className="relative">新增成就</span>
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryAchievements.map(achievement => {
                    const isAchieved = currentCount >= achievement.condition;
                    const progress = Math.min(100, (currentCount / achievement.condition) * 100);
                    
                    return (
                      <div key={achievement.id} className={`relative group p-6 rounded-[32px] border-2 transition-all ${achievement.claimed ? 'bg-emerald-50/50 border-emerald-100 opacity-80' : isAchieved ? 'bg-amber-50/50 border-amber-200 shadow-amber-100 shadow-lg' : 'bg-white/60 border-white hover:border-sky-200'}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-grow min-w-0">
                            <input
                              className="w-full bg-transparent font-black text-sky-900 outline-none focus:text-sky-500 text-lg mb-1"
                              placeholder="輸入成就名稱..."
                              value={achievement.title}
                              onChange={e => updateData(prev => ({ ...prev, achievements: prev.achievements.map(a => a.id === achievement.id ? { ...a, title: e.target.value } : a) }))}
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-sky-300 uppercase tracking-widest">條件：</span>
                              <input
                                type="number"
                                className="w-16 bg-sky-50/50 rounded-lg px-2 py-0.5 text-xs font-black text-sky-600 outline-none"
                                value={achievement.condition}
                                onChange={e => updateData(prev => ({ ...prev, achievements: prev.achievements.map(a => a.id === achievement.id ? { ...a, condition: parseInt(e.target.value) || 0 } : a) }))}
                              />
                              <span className="text-[10px] font-black text-sky-300 uppercase tracking-widest">次</span>
                            </div>
                          </div>
                          <button onClick={() => updateData(prev => ({ ...prev, achievements: prev.achievements.filter(a => a.id !== achievement.id) }))} className="p-2 text-sky-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-grow h-2 bg-sky-100 rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-1000 ${isAchieved ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-[10px] font-black text-sky-400 whitespace-nowrap">{currentCount} / {achievement.condition}</span>
                          </div>
                          <div className="flex flex-col gap-2 pt-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-sky-300 uppercase tracking-widest shrink-0">獎勵：</span>
                              <EditableContent
                                initialValue={achievement.rewardText || ''}
                                onSave={(newVal) => {
                                  updateData(prev => ({
                                    ...prev,
                                    achievements: prev.achievements.map(a => a.id === achievement.id ? { ...a, rewardText: newVal } : a)
                                  }));
                                }}
                                className="flex-grow bg-sky-50/50 rounded-lg px-2 py-1 text-[10px] font-black text-sky-600 outline-none border border-transparent focus:border-sky-200 resize-none overflow-hidden min-h-[24px]"
                                placeholder="輸入獎勵內容..."
                              />
                            </div>
                            <div className="flex justify-end">
                            {achievement.claimed ? (
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                                  <CheckCircle2 className="w-3 h-3" /> 已領取
                                </div>
                                <button
                                  onClick={() => updateData(prev => ({ ...prev, achievements: prev.achievements.map(a => a.id === achievement.id ? { ...a, claimed: false, claimedAt: null } : a) }))}
                                  className="p-1.5 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-all"
                                  title="退回領取狀態"
                                >
                                  <RotateCw className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : isAchieved ? (
                              <button onClick={() => claimAchievementReward(achievement)} className="px-4 py-2 bg-amber-400 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-500 transition-all shadow-md shadow-amber-200">領取獎勵</button>
                            ) : (
                              <div className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest cursor-not-allowed">未達成</div>
                            )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  {categoryAchievements.length === 0 && (
                    <div className="col-span-full py-10 text-center border-2 border-dashed border-sky-100 rounded-[32px]">
                      <p className="text-sky-300 font-bold text-sm">點擊右上角新增成就</p>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
        </div>
      )}

      {rewardSubTab === 'pending' && (
        <div className="space-y-6 animate-in slide-up">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
            {(() => {
              const pendingRewards = data.rewardHistory.filter(h => !h.claimed);
              if (pendingRewards.length === 0) {
                return (
                  <div className="col-span-full bg-white/20 border-4 border-dashed border-white/60 rounded-[40px] p-16 flex flex-col items-center justify-center gap-6 min-h-[400px] animate-in fade-in">
                    <div className="w-20 h-20 rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 flex items-center justify-center shadow-xl shadow-sky-100/50 text-sky-200">
                      <Gift className="w-10 h-10" />
                    </div>
                    <div className="text-center">
                      <p className="font-black text-xs text-sky-400 uppercase tracking-[0.2em] mb-2">暫無待領獎勵</p>
                      <p className="text-[10px] text-sky-300 italic">快去抽卡大廳試試手氣吧！</p>
                    </div>
                  </div>
                );
              }

              // 根據內容進行分組
              const grouped = pendingRewards.reduce((acc, reward) => {
                const key = reward.prize.type === 'image' ? reward.prize.content : `text:${reward.prize.content}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(reward);
                return acc;
              }, {});

              // 排序邏輯：稀有度等級 (UR > SSR > SR > R > N) > 名稱
              const sortedGroups = Object.values(grouped).sort((a, b) => {
                const rarityOrder = { 'UR': 0, 'SSR': 1, 'SR': 2, 'R': 3, 'N': 4 };
                const rewardA = a[0];
                const rewardB = b[0];
                
                if (rarityOrder[rewardA.rarity] !== rarityOrder[rewardB.rarity]) {
                  return rarityOrder[rewardA.rarity] - rarityOrder[rewardB.rarity];
                }
                
                const nameA = rewardA.prize.type === 'image' ? rewardA.prize.content.split('\\').pop() : rewardA.prize.content;
                const nameB = rewardB.prize.type === 'image' ? rewardB.prize.content.split('\\').pop() : rewardB.prize.content;
                return nameA.localeCompare(nameB);
              });

              return sortedGroups.map((group) => {
                const reward = group[0];
                const count = group.length;
                
                return (
                  <div key={reward.id} className="relative group">
                    {/* 堆疊陰影效果 */}
                    {count > 1 && (
                      <>
                        <div className="absolute inset-0 translate-x-2 translate-y-2 bg-gray-800/40 rounded-2xl border-2 border-white/10 -z-10" />
                        <div className="absolute inset-0 translate-x-1 translate-y-1 bg-gray-800/60 rounded-2xl border-2 border-white/20 -z-10" />
                      </>
                    )}
                    
                    <div
                      className={`aspect-[2/3] rounded-2xl bg-gray-900 overflow-hidden flex items-center justify-center relative border-4 group/img cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-3 hover:scale-[1.05] ${
                        reward.rarity === 'UR' ? 'border-rose-500 shadow-rose-500/30' :
                        reward.rarity === 'SSR' ? 'border-amber-400 shadow-amber-500/30' :
                        reward.rarity === 'SR' ? 'border-purple-400 shadow-purple-500/30' :
                        reward.rarity === 'R' ? 'border-sky-400 shadow-sky-500/30' :
                        'border-slate-400 shadow-slate-500/30'
                      }`}
                      onClick={() => { setRewardToShow({ ...reward, groupIds: group.map(r => r.id), totalInStack: count }); setRewardStage('revealed'); }}
                    >
                      <div className="absolute top-3 left-3 z-20">
                        <RarityBadge rarity={reward.rarity} size="xs" />
                      </div>
                      
                      {/* 數量標籤 */}
                      {count > 1 && (
                        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-tr from-rose-600 to-rose-400 text-white rounded-2xl shadow-[0_8px_20px_-4px_rgba(225,29,72,0.6)] border border-white/30 animate-in zoom-in duration-500 group-hover:scale-110 transition-transform">
                          <Layers className="w-3 h-3" />
                          <span className="text-[11px] font-black tracking-tighter leading-none">×{count}</span>
                        </div>
                      )}

                      {reward.prize.type === 'image' ? (
                        <IpcImage
                          src={reward.prize.content}
                          className="w-full h-full object-cover relative z-10 transition-transform duration-700 group-hover/img:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-4 bg-slate-800 transition-colors group-hover/img:bg-slate-700">
                          <p className="text-white font-black text-[10px] text-center break-words line-clamp-6 leading-relaxed transition-transform duration-500 group-hover/img:scale-110">"{reward.prize.content}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {rewardSubTab === 'history' && (
        <div className="space-y-8 animate-in slide-up">
          <div className="bg-white/60 backdrop-blur-md rounded-[40px] p-8 border border-white shadow-xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-sky-100 rounded-xl text-sky-500"><BarChart3 className="w-5 h-5" /></div>
              <h3 className="text-xl font-black text-sky-900">機率統計</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {['UR', 'SSR', 'SR', 'R', 'N'].map(r => {
                const total = data.rewardHistory.length;
                const count = data.rewardHistory.filter(h => h.rarity === r).length;
                const actualProb = total > 0 ? (count / total) * 100 : 0;
                const targetProb = data.lotteryProbability[r];
                const diff = actualProb - targetProb;
                const isLucky = diff > 0;
                return (
                  <div key={r} className="relative group bg-white/40 backdrop-blur-md rounded-3xl p-5 border border-white/60 shadow-sm transition-all hover:shadow-md hover:-translate-y-2 hover:scale-[1.02]">
                    <div className="flex flex-col items-center gap-3">
                      <RarityBadge rarity={r} size="sm" />
                      <div className="text-center">
                        <p className="text-3xl font-black text-sky-900 leading-none mb-1">{count}</p>
                        <p className="text-[9px] font-black text-sky-300 uppercase tracking-widest">次數</p>
                      </div>
                      <div className="w-full space-y-2 mt-2">
                        <div className="flex justify-between items-end">
                          <span className="text-[10px] font-black text-sky-400">實際頻率</span>
                          <span className={`text-xs font-black ${isLucky ? 'text-emerald-500' : 'text-sky-600'}`}>{actualProb.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center text-[9px] font-bold">
                          <span className="text-gray-400">預計: {targetProb}%</span>
                          {count > 0 && (<span className={isLucky ? 'text-emerald-500' : 'text-amber-500'}>{isLucky ? '偏高' : '偏低'}</span>)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white/40 backdrop-blur-md rounded-[40px] border border-white shadow-xl overflow-hidden flex flex-col">
            <div className="p-8 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-100 rounded-xl text-sky-500">
                  <History className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-black text-sky-900">抽卡歷史</h3>
              </div>
              <button onClick={() => setEditingHistory({ rarity: 'R', prize: { type: 'text', content: '' }, timestamp: new Date().toISOString(), claimed: true })} className="group relative px-6 py-3 bg-sky-500/5 backdrop-blur-md text-sky-600 text-[11px] font-black rounded-2xl transition-all shadow-sm hover:bg-sky-500/10 hover:!translate-y-[-6px] hover:scale-105 active:scale-95 flex items-center gap-2 border border-sky-500/20 overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" /><span className="relative flex items-center gap-2"><Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" /> 手動補登紀錄</span></button>
            </div>
            {selectedHistoryIds.length > 0 && (
              <div className="bg-rose-50/80 p-4 flex justify-between items-center border-b border-rose-100 animate-in slide-down">
                <span className="text-xs font-black text-rose-600 ml-4">已選擇 {selectedHistoryIds.length} 筆紀錄</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedHistoryIds([])} className="px-4 py-2 text-[10px] font-black text-rose-400 hover:bg-rose-100 rounded-xl transition-colors">取消選擇</button>
                  <button onClick={() => { if (confirm(`確定要刪除選中的 ${selectedHistoryIds.length} 筆紀錄嗎？`)) { updateData(prev => ({ ...prev, rewardHistory: prev.rewardHistory.filter(h => !selectedHistoryIds.includes(h.id)) })); setSelectedHistoryIds([]); } }} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black rounded-xl shadow-sm transition-colors flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> 批量刪除</button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-separate border-spacing-y-2 px-8">
                <thead>
                  <tr className="text-sky-400">
                    <th className="px-4 py-2 w-10">
                      <label className="relative flex items-center justify-center cursor-pointer group">
                        <input type="checkbox" className="peer sr-only" checked={selectedHistoryIds.length > 0 && selectedHistoryIds.length === data.rewardHistory.slice((rewardHistoryPage - 1) * ITEMS_PER_PAGE, rewardHistoryPage * ITEMS_PER_PAGE).length} onChange={(e) => { if (e.target.checked) { const currentIds = data.rewardHistory.slice((rewardHistoryPage - 1) * ITEMS_PER_PAGE, rewardHistoryPage * ITEMS_PER_PAGE).map(h => h.id); setSelectedHistoryIds(currentIds); } else { setSelectedHistoryIds([]); } }} />
                        <div className="w-5 h-5 rounded-lg border-2 border-sky-100 bg-white peer-checked:bg-sky-500 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm group-hover:border-sky-300"><CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" /></div>
                      </label>
                    </th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest">獲取時間</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest">獎勵內容</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-center">稀有度</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest">領取時間</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rewardHistory.slice((rewardHistoryPage - 1) * ITEMS_PER_PAGE, rewardHistoryPage * ITEMS_PER_PAGE).map(h => (
                    <tr key={h.id} className={`group/row transition-all duration-300 ${selectedHistoryIds.includes(h.id) ? 'translate-x-1' : ''}`}>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm rounded-l-3xl border-y border-l transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedHistoryIds.includes(h.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <label className="relative flex items-center justify-center cursor-pointer group">
                          <input type="checkbox" className="peer sr-only" checked={selectedHistoryIds.includes(h.id)} onChange={(e) => { if (e.target.checked) { setSelectedHistoryIds(prev => [...prev, h.id]); } else { setSelectedHistoryIds(prev => prev.filter(id => id !== h.id)); } }} />
                          <div className="w-5 h-5 rounded-lg border-2 border-sky-100 bg-white peer-checked:bg-sky-500 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm group-hover:border-sky-300"><CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" /></div>
                        </label>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedHistoryIds.includes(h.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-sky-800">{new Date(h.timestamp).toLocaleDateString()}</span>
                          <span className="text-[10px] font-bold text-sky-400">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedHistoryIds.includes(h.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex items-center gap-4">
                          {h.prize.type === 'image' ? (
                            <div className="w-14 h-14 rounded-xl bg-black overflow-hidden border border-sky-100 flex-shrink-0 shadow-sm group-hover/row:scale-110 transition-transform duration-500">
                              <IpcImage
                                src={h.prize.content}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-sky-50 flex items-center justify-center text-sky-400 flex-shrink-0 border border-sky-100 group-hover/row:bg-sky-100 transition-colors">
                              <Sparkles className="w-6 h-6" />
                            </div>
                          )}
                          <p className="text-sm font-bold text-sky-900 line-clamp-2 group-hover/row:text-sky-600 transition-colors max-w-[200px]">
                            {h.prize.type === 'image' ? h.prize.content.split('\\').pop() : h.prize.content}
                          </p>
                        </div>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedHistoryIds.includes(h.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex flex-col items-center">
                          <RarityBadge rarity={h.rarity} size="sm" />
                        </div>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedHistoryIds.includes(h.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        {h.claimed ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              {h.claimedAt ? (
                                <>
                                  <span className="text-xs font-black text-emerald-600">{new Date(h.claimedAt).toLocaleDateString()}</span>
                                  <button
                                    onClick={() => { if (confirm('確定要撤銷此獎勵的領取狀態嗎？')) updateData(prev => ({ ...prev, rewardHistory: prev.rewardHistory.map(item => item.id === h.id ? { ...item, claimed: false, claimedAt: null } : item) })); }}
                                    className="p-1 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-all"
                                    title="撤銷領取"
                                  >
                                    <RotateCw className="w-3 h-3" />
                                  </button>
                                </>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-500 rounded-full text-[8px] font-black border border-emerald-100/50">已領取</span>
                                  <button
                                    onClick={() => { if (confirm('確定要撤銷此獎勵的領取狀態嗎？')) updateData(prev => ({ ...prev, rewardHistory: prev.rewardHistory.map(item => item.id === h.id ? { ...item, claimed: false, claimedAt: null } : item) })); }}
                                    className="p-1 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-all"
                                    title="撤銷領取"
                                  >
                                    <RotateCw className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {h.claimedAt && (
                              <span className="text-[10px] font-bold text-emerald-400">{new Date(h.claimedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-300 italic">尚未領取</span>
                        )}
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm rounded-r-3xl border-y border-r transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedHistoryIds.includes(h.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-all duration-300 translate-x-2 group-hover/row:translate-x-0">
                          <button onClick={() => setEditingHistory(h)} className="p-2 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-all"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => { if (confirm('確定要刪除此筆紀錄嗎？')) updateData(prev => ({ ...prev, rewardHistory: prev.rewardHistory.filter(item => item.id !== h.id) })); }} className="p-2 text-sky-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.rewardHistory.length > ITEMS_PER_PAGE && (
              <div className="px-8 py-6 flex justify-between items-center bg-sky-50/30 backdrop-blur-md border-t border-white/60">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                  <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">
                    顯示 {(rewardHistoryPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(rewardHistoryPage * ITEMS_PER_PAGE, data.rewardHistory.length)} 筆 / 共 {data.rewardHistory.length} 筆
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRewardHistoryPage(p => Math.max(1, p - 1))}
                    disabled={rewardHistoryPage === 1}
                    className="p-2.5 rounded-2xl bg-white/60 hover:bg-white disabled:opacity-30 text-sky-600 shadow-sm border border-white transition-all hover:-translate-x-1 active:scale-90"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-white/40 rounded-2xl border border-white/60 shadow-inner">
                    <span className="text-sm font-black text-sky-800">{rewardHistoryPage}</span>
                    <span className="text-xs font-bold text-sky-300">/</span>
                    <span className="text-xs font-bold text-sky-400">{Math.ceil(data.rewardHistory.length / ITEMS_PER_PAGE)}</span>
                  </div>
                  <button
                    onClick={() => setRewardHistoryPage(p => Math.min(Math.ceil(data.rewardHistory.length / ITEMS_PER_PAGE), p + 1))}
                    disabled={rewardHistoryPage >= Math.ceil(data.rewardHistory.length / ITEMS_PER_PAGE)}
                    className="p-2.5 rounded-2xl bg-white/60 hover:bg-white disabled:opacity-30 text-sky-600 shadow-sm border border-white transition-all hover:translate-x-1 active:scale-90"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RewardsView;