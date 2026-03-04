import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { RotateCw, X, CheckCircle2 } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { INDICATORS } from '../../constants/index.jsx';
import { formatForDateTimeLocal } from '../../utils';

const TaskHistoryEditor = ({ editingTaskHistory, setEditingTaskHistory }) => {
  const { data, updateData } = useAppData();
  const [localItem, setLocalItem] = useState({
    title: '',
    majorTaskTitle: '',
    indicatorId: 'learning',
    type: 'daily',
    completedAt: new Date().toISOString(),
    ...editingTaskHistory
  });
  const isNew = !editingTaskHistory.id;

  const handleSave = () => {
    if (!localItem.title.trim()) {
      alert('請輸入任務名稱');
      return;
    }
    updateData(prev => {
      if (isNew) {
        const newRecord = { ...localItem, id: crypto.randomUUID() };
        return { ...prev, taskHistory: [newRecord, ...prev.taskHistory] };
      } else {
        return { ...prev, taskHistory: prev.taskHistory.map(h => h.id === localItem.id ? localItem : h) };
      }
    });
    setEditingTaskHistory(null);
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
            <RotateCw className="w-7 h-7 text-sky-500" /> {isNew ? '任務紀錄補登' : '編輯任務紀錄'}
          </h3>
          <button onClick={() => setEditingTaskHistory(null)} className="p-3 hover:bg-white/40 rounded-2xl transition-all hover:scale-110 active:scale-90">
            <X className="w-6 h-6 text-sky-600" />
          </button>
        </div>
        <div className="p-10 space-y-8 relative z-10">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest">維度</label>
              <select 
                className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" 
                value={localItem.indicatorId} 
                onChange={e => setLocalItem({ ...localItem, indicatorId: e.target.value })}
              >
                {INDICATORS.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest">類型</label>
              <select 
                className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" 
                value={localItem.type} 
                onChange={e => setLocalItem({ ...localItem, type: e.target.value })}
              >
                <option value="daily">每日任務</option>
                <option value="weekly">每週任務</option>
                <option value="precise">單次計畫</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">任務名稱</label>
            <input 
              className="w-full bg-white/40 p-5 rounded-2xl text-lg font-black outline-none border border-white/60 focus:bg-white/60 text-sky-900 transition-all placeholder:text-sky-300" 
              value={localItem.title} 
              onChange={e => setLocalItem({ ...localItem, title: e.target.value })} 
              placeholder="輸入任務名稱..." 
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">所屬計畫</label>
            <input 
              className="w-full bg-white/40 p-5 rounded-2xl text-lg font-black outline-none border border-white/60 focus:bg-white/60 text-sky-900 transition-all placeholder:text-sky-300" 
              value={localItem.majorTaskTitle} 
              onChange={e => setLocalItem({ ...localItem, majorTaskTitle: e.target.value })} 
              placeholder="輸入計畫名稱..." 
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">完成時間</label>
            <input 
              type="datetime-local" 
              className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" 
              value={formatForDateTimeLocal(localItem.completedAt)} 
              onChange={e => {
                const val = e.target.value;
                if (val) setLocalItem({ ...localItem, completedAt: new Date(val).toISOString() });
              }} 
            />
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

export default TaskHistoryEditor;