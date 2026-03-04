import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { RotateCw, X, CheckCircle2 } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { formatForDateTimeLocal } from '../../utils';

const HistoryEditor = ({ editingHistory, setEditingHistory }) => {
  const { updateData } = useAppData();
  const [localItem, setLocalItem] = useState({ taskTitle: '', ...editingHistory });
  const isNew = !editingHistory.id;

  const handleSave = () => {
    updateData(prev => {
      const itemToSave = {
        ...localItem,
        claimedAt: localItem.claimed ? (localItem.claimedAt || new Date().toISOString()) : null
      };
      if (isNew) {
        const newRecord = { ...itemToSave, id: crypto.randomUUID() };
        return { ...prev, rewardHistory: [newRecord, ...prev.rewardHistory] };
      } else {
        return { ...prev, rewardHistory: prev.rewardHistory.map(h => h.id === itemToSave.id ? itemToSave : h) };
      }
    });
    setEditingHistory(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-sky-950/20 backdrop-blur-sm p-4 animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/30 backdrop-blur-[40px] w-full max-w-lg rounded-[48px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.4)] border border-white/20 overflow-hidden relative"
      >
        <div className="p-8 border-b border-white/20 flex justify-between items-center bg-white/10 relative z-10">
          <h3 className="font-black text-2xl flex items-center gap-3 text-sky-900 drop-shadow-sm">
            <RotateCw className="w-7 h-7 text-sky-500" /> {isNew ? '抽卡紀錄補登' : '編輯抽卡紀錄'}
          </h3>
          <button onClick={() => setEditingHistory(null)} className="p-3 hover:bg-white/40 rounded-2xl transition-all hover:scale-110 active:scale-90">
            <X className="w-6 h-6 text-sky-600" />
          </button>
        </div>
        <div className="p-10 space-y-8 relative z-10">
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest">等級</label><select className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none" value={localItem.rarity} onChange={e => setLocalItem({ ...localItem, rarity: e.target.value })}>{['UR', 'SSR', 'SR', 'R', 'N'].map(r => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest">狀態</label><select className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none" value={localItem.claimed ? 'true' : 'false'} onChange={e => { const isClaimed = e.target.value === 'true'; setLocalItem({ ...localItem, claimed: isClaimed, claimedAt: isClaimed ? (localItem.claimedAt || new Date().toISOString()) : null }); }}><option value="true">已領取</option><option value="false">待領取</option></select></div>
          </div>
          <div><label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">來源任務</label><input className="w-full bg-white/40 p-5 rounded-2xl text-lg font-black outline-none border border-white/60 focus:bg-white/60 text-sky-900 transition-all placeholder:text-sky-300" value={localItem.taskTitle || ''} onChange={e => setLocalItem({ ...localItem, taskTitle: e.target.value })} placeholder="輸入任務名稱..." /></div>
          <div><label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">獎勵內容</label><input className="w-full bg-white/40 p-5 rounded-2xl text-xl font-black outline-none border border-white/60 focus:bg-white/60 text-sky-900 transition-all placeholder:text-sky-300" value={localItem.prize.content} onChange={e => setLocalItem({ ...localItem, prize: { ...localItem.prize, content: e.target.value, type: 'text' } })} placeholder="輸入描述文字..." /><p className="text-[10px] text-sky-500 mt-2 ml-1 italic opacity-60">手動新增僅支援文字類獎品</p></div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">獲取時間</label><input type="datetime-local" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={formatForDateTimeLocal(localItem.timestamp)} onChange={e => { const val = e.target.value; if (val) setLocalItem({ ...localItem, timestamp: new Date(val).toISOString() }); }} /></div>
            <div>
              <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">領取時間</label>
              <input
                type="datetime-local"
                className={`w-full p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none transition-all ${localItem.claimed ? 'bg-white/40' : 'bg-gray-100/40 opacity-50 cursor-not-allowed'}`}
                value={localItem.claimedAt ? formatForDateTimeLocal(localItem.claimedAt) : ''}
                disabled={!localItem.claimed}
                onChange={e => { const val = e.target.value; if (val) setLocalItem({ ...localItem, claimedAt: new Date(val).toISOString() }); }}
              />
            </div>
          </div>
          <button onClick={handleSave} className="group relative w-full py-6 bg-sky-500/80 backdrop-blur-xl text-white font-black rounded-[32px] shadow-2xl shadow-sky-200/50 hover:bg-sky-600 hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 overflow-hidden border border-white/20">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
            <span className="relative flex items-center justify-center gap-3 text-xl tracking-[0.2em]"><CheckCircle2 className="w-7 h-7" /> 確認保存</span>
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default HistoryEditor;