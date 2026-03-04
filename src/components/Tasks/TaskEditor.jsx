import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Settings2, X, Zap, CheckCircle2, TrendingUp, Tag } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { INDICATORS, WEEK_DAYS } from '../../constants/index.jsx';

const TaskEditor = ({ editingTask, setEditingTask }) => {
  const { data, updateData, reorderPriorityTasks } = useAppData();
  const { type, item } = editingTask;
  const [localItem, setLocalItem] = useState(item);
  const isMajor = type === 'major';

  const handleSave = () => {
    if (!localItem.title?.trim()) {
      alert(`請輸入${isMajor ? '計畫' : '任務'}名稱`);
      return;
    }
    updateData(prev => {
      if (isMajor) {
          const exists = prev.majorTasks.some(t => t.id === localItem.id);
          if (exists) return { ...prev, majorTasks: prev.majorTasks.map(t => t.id === localItem.id ? localItem : t) };
          return { ...prev, majorTasks: [...prev.majorTasks, localItem] };
      } else {
          let newSubTasks = [...prev.subTasks];
          const originalTask = prev.subTasks.find(t => t.id === localItem.id);
          
          if (originalTask && originalTask.isPriority && !localItem.isPriority) {
               const tempTasks = newSubTasks.map(t => t.id === localItem.id ? localItem : t);
               newSubTasks = reorderPriorityTasks(tempTasks);
          } else if (originalTask && !originalTask.isPriority && localItem.isPriority) {
               const maxOrder = Math.max(0, ...prev.subTasks.filter(t => t.isPriority).map(t => t.priorityOrder || 0));
               const updatedItem = { ...localItem, priorityOrder: maxOrder + 1 };
               newSubTasks = newSubTasks.map(t => t.id === localItem.id ? updatedItem : t);
          } else if (!originalTask) {
               if (localItem.isPriority) {
                   const maxOrder = Math.max(0, ...prev.subTasks.filter(t => t.isPriority).map(t => t.priorityOrder || 0));
                   newSubTasks = [...newSubTasks, { ...localItem, priorityOrder: maxOrder + 1 }];
               } else {
                   newSubTasks = [...newSubTasks, localItem];
               }
          } else {
               newSubTasks = newSubTasks.map(t => t.id === localItem.id ? localItem : t);
          }

          return { ...prev, subTasks: newSubTasks };
      }
    });
    setEditingTask(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-sky-950/20 backdrop-blur-sm p-4 animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/30 backdrop-blur-[40px] w-full max-w-xl rounded-[48px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.4)] border border-white/20 overflow-hidden relative"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
        
        <div className="p-8 border-b border-white/20 flex justify-between items-center bg-white/10 relative z-10">
          <h3 className="font-black text-2xl flex items-center gap-3 text-sky-900 drop-shadow-sm">
            <Settings2 className="w-7 h-7 text-sky-500" /> {isMajor ? '計畫設定' : '任務設定'}
          </h3>
          <button onClick={() => setEditingTask(null)} className="p-3 hover:bg-white/40 rounded-2xl transition-all hover:scale-110 active:scale-90">
            <X className="w-6 h-6 text-sky-600" />
          </button>
        </div>
        <div className="p-10 max-h-[75vh] overflow-y-auto space-y-10 no-scrollbar relative z-10">
          <div className="group">
            <label className="block text-[10px] font-black text-sky-600 mb-3 uppercase tracking-[0.2em] ml-1">{isMajor ? '計畫名稱' : '任務名稱'}</label>
            <input
              className="w-full bg-white/40 backdrop-blur-md p-5 rounded-3xl text-xl font-black outline-none border border-white/60 focus:border-sky-500/50 focus:bg-white/60 text-sky-900 transition-all shadow-sm placeholder:text-sky-300"
              value={localItem.title}
              onChange={e => setLocalItem({ ...localItem, title: e.target.value })}
              placeholder={`請輸入${isMajor ? '計畫' : '任務'}名稱...`}
            />
          </div>
          {isMajor ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">維度</label><select className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" value={localItem.indicatorId} onChange={e => setLocalItem({ ...localItem, indicatorId: e.target.value })}>{INDICATORS.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}</select></div>
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">目標</label><select className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" value={localItem.goalId} onChange={e => setLocalItem({ ...localItem, goalId: e.target.value })}>{data.goals[localItem.indicatorId]?.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">起始日期</label><input type="date" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.startDate} onChange={e => setLocalItem({ ...localItem, startDate: e.target.value })} /></div>
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">結束日期</label><input type="date" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.endDate} onChange={e => setLocalItem({ ...localItem, endDate: e.target.value })} /></div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {localItem.type !== 'infinite' && (
                <div className="flex items-center gap-4 p-5 bg-white/30 backdrop-blur-md rounded-[28px] border border-white/60 shadow-sm">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      id="isPriority"
                      checked={localItem.isPriority || false}
                      onChange={e => setLocalItem({ ...localItem, isPriority: e.target.checked })}
                      className="peer w-6 h-6 rounded-lg border-2 border-white/80 bg-white/20 checked:bg-amber-500 checked:border-amber-400 appearance-none cursor-pointer transition-all"
                    />
                    <Zap className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="isPriority" className="text-sm font-black text-sky-700 cursor-pointer select-none">優先序列任務</label>
                    <p className="text-[10px] text-sky-400 font-bold">必須依序優先完成的特殊任務</p>
                  </div>
                  {localItem.isPriority && (
                    <div className="ml-auto flex items-center gap-2 bg-amber-50/50 px-3 py-1.5 rounded-xl border border-amber-100">
                      <span className="text-[10px] font-black text-amber-600">順序</span>
                      <span className="text-lg font-black text-amber-600">{localItem.priorityOrder || '新'}</span>
                      <p className="text-[8px] text-amber-400 ml-1">(自動分配)</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex p-1.5 bg-white/30 backdrop-blur-md rounded-[24px] gap-1 relative border border-white/40">
                {['precise', 'daily', 'weekly', 'infinite'].map(m => (
                  <button
                    key={m}
                    onClick={() => {
                      if (m === 'infinite') {
                        setLocalItem({ ...localItem, type: m, isPriority: false, noTime: true });
                      } else {
                        setLocalItem({ ...localItem, type: m });
                      }
                    }}
                    className={`relative flex-1 py-4 rounded-2xl text-[10px] font-black z-10 transition-colors ${localItem.type === m ? 'text-sky-800' : 'text-sky-500 hover:text-sky-700'}`}
                  >
                    {m === 'precise' ? '一次性任務' : m === 'daily' ? '每日重複' : m === 'weekly' ? '每週指定' : '隨時挑戰'}
                    {localItem.type === m && (
                      <motion.div
                        layoutId="activeTabHighlight"
                        className="absolute inset-0 bg-white/80 rounded-2xl shadow-sm -z-10"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                  </button>
                ))}
              </div>
              {localItem.type === 'weekly' && (<div className="flex justify-between bg-white/30 p-2 rounded-[24px] border border-white/40">{[0, 1, 2, 3, 4, 5, 6].map(d => <button key={d} onClick={() => { const newDays = localItem.days.includes(d) ? localItem.days.filter(v => v !== d) : [...localItem.days, d].sort(); setLocalItem({ ...localItem, days: newDays }); }} className={`w-11 h-11 rounded-full text-[10px] font-black transition-all border-2 ${localItem.days.includes(d) ? 'bg-sky-500 text-white border-sky-400 shadow-md scale-110' : 'text-sky-300 border-transparent hover:bg-white/40'}`}>{WEEK_DAYS[d]}</button>)}</div>)}
              
              {localItem.type !== 'infinite' && (
                <div className="flex items-center gap-4 p-5 bg-white/30 backdrop-blur-md rounded-[28px] border border-white/60 shadow-sm">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      id="noTime"
                      checked={localItem.noTime || false}
                      onChange={e => setLocalItem({ ...localItem, noTime: e.target.checked })}
                      className="peer w-6 h-6 rounded-lg border-2 border-white/80 bg-white/20 checked:bg-sky-500 checked:border-sky-400 appearance-none cursor-pointer transition-all"
                    />
                    <CheckCircle2 className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                  </div>
                  <label htmlFor="noTime" className="text-sm font-black text-sky-700 cursor-pointer select-none">不限時間</label>
                </div>
              )}

              {localItem.type !== 'infinite' && !localItem.noTime && (
                localItem.type === 'precise' ? (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest ml-1">起始時間</label>
                      <input
                        type="datetime-local"
                        className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none"
                        value={localItem.startDateTime}
                        onChange={e => setLocalItem({ ...localItem, startDateTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest ml-1">結束時間</label>
                      <input
                        type="datetime-local"
                        className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none"
                        value={localItem.endDateTime || ''}
                        onChange={e => setLocalItem({ ...localItem, endDateTime: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2"><label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest ml-1">起始時間</label><input type="time" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.startTime} onChange={e => setLocalItem({ ...localItem, startTime: e.target.value })} /></div>
                    <div className="space-y-2"><label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest ml-1">結束時間</label><input type="time" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.endTime} onChange={e => setLocalItem({ ...localItem, endTime: e.target.value })} /></div>
                  </div>
                )
              )}

              <div className="group">
                <label className="block text-[10px] font-black text-sky-600 mb-3 uppercase tracking-[0.2em] ml-1">完成獎勵 (抽卡券)</label>
                <div className="relative flex items-center">
                  <div className="absolute left-5 text-sky-400">
                    <Tag className="w-5 h-5" />
                  </div>
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-white/40 backdrop-blur-md p-5 pl-14 rounded-3xl text-xl font-black outline-none border border-white/60 focus:border-sky-500/50 focus:bg-white/60 text-sky-900 transition-all shadow-sm"
                    value={localItem.rewardTickets ?? 1}
                    onChange={e => setLocalItem({ ...localItem, rewardTickets: parseInt(e.target.value) || 0 })}
                    placeholder="輸入獎勵數量..."
                  />
                </div>
              </div>
            </div>
          )}
          <button onClick={handleSave} className="group relative w-full py-6 bg-sky-500/80 backdrop-blur-xl text-white font-black rounded-[32px] shadow-2xl shadow-sky-200/50 hover:bg-sky-600 hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 overflow-hidden border border-white/20">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
            <span className="relative flex items-center justify-center gap-3 text-xl tracking-[0.2em]"><CheckCircle2 className="w-7 h-7" /> 保存設定</span>
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default TaskEditor;