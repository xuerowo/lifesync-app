import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Settings2, X, Zap, CheckCircle2, TrendingUp, Tag } from 'lucide-react';
import { useAppData } from '../../contexts/useAppData.ts';
import { INDICATORS, WEEK_DAYS } from '../../constants/index.tsx';
import { firstGoalId, toggleWeekDay, toNonNegativeInt, validateSubTaskTimes } from '../../domain/inputs.ts';
import { topSortOrder } from '../../shared/taskOrder.ts';

const TaskEditor = ({ editingTask, setEditingTask }) => {
  const { data, updateData, reorderPriorityTasks } = useAppData();
  const { type, item } = editingTask;
  const [localItem, setLocalItem] = useState(item);
  const isMajor = type === 'major';
  // 從日曆打開的已結束任務（已完成或已停止）：不能改類型、不能設優先。
  // 改類型會讓「已停止」和「已完成」對調（判斷方式見 domain/tasks.ts 的 isStoppedTask），優先標記存檔時本來就不會改
  const isArchivedTask = !isMajor && !data.subTasks.some(t => t.id === item.id) && data.archivedSubTasks.some(t => t.id === item.id);
  // 原本就是優先任務才有順位；剛勾選的會排在最後（存檔時才編號）
  const existingPriorityOrder = item.isPriority ? item.priorityOrder : 0;

  const handleSave = () => {
    if (!localItem.title?.trim()) {
      alert(`請輸入${isMajor ? '計畫' : '任務'}名稱`);
      return;
    }
    if (!isMajor) {
      const timeError = validateSubTaskTimes(localItem);
      if (timeError) {
        alert(timeError);
        return;
      }
    }
    updateData(prev => {
      if (isMajor) {
          const exists = prev.majorTasks.some(t => t.id === localItem.id);
          if (exists) return { ...prev, majorTasks: prev.majorTasks.map(t => t.id === localItem.id ? localItem : t) };
          // 新的計畫放在最上面
          return { ...prev, majorTasks: [...prev.majorTasks, { ...localItem, sortOrder: topSortOrder(prev.majorTasks) }] };
      } else {
          let newSubTasks = [...prev.subTasks];
          const originalTask = prev.subTasks.find(t => t.id === localItem.id);

          // 從日曆打開的已完成任務：更新原本已完成的那一筆，不要再新增一份到進行中。
          // 已完成的任務不參與優先順序，保留它原本的優先欄位
          const archivedOriginal = !originalTask && prev.archivedSubTasks.find(t => t.id === localItem.id);
          if (archivedOriginal) {
            const updated = { ...localItem, type: archivedOriginal.type, isPriority: archivedOriginal.isPriority, priorityOrder: archivedOriginal.priorityOrder };
            return { ...prev, archivedSubTasks: prev.archivedSubTasks.map(t => t.id === localItem.id ? updated : t) };
          }

          if (originalTask && originalTask.isPriority && !localItem.isPriority) {
               const tempTasks = newSubTasks.map(t => t.id === localItem.id ? localItem : t);
               newSubTasks = reorderPriorityTasks(tempTasks);
          } else if (originalTask && !originalTask.isPriority && localItem.isPriority) {
               const maxOrder = Math.max(0, ...prev.subTasks.filter(t => t.isPriority).map(t => t.priorityOrder || 0));
               const updatedItem = { ...localItem, priorityOrder: maxOrder + 1 };
               newSubTasks = newSubTasks.map(t => t.id === localItem.id ? updatedItem : t);
          } else if (!originalTask) {
               // 新的任務放在這個計畫的最上面
               const sortOrder = topSortOrder(prev.subTasks.filter(t => t.majorTaskId === localItem.majorTaskId));
               if (localItem.isPriority) {
                   const maxOrder = Math.max(0, ...prev.subTasks.filter(t => t.isPriority).map(t => t.priorityOrder || 0));
                   newSubTasks = [...newSubTasks, { ...localItem, sortOrder, priorityOrder: maxOrder + 1 }];
               } else {
                   newSubTasks = [...newSubTasks, { ...localItem, sortOrder }];
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
          <button onClick={() => setEditingTask(null)} title="關閉" aria-label="關閉" className="p-3 hover:bg-white/40 rounded-2xl transition-all hover:scale-110 active:scale-90">
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
              placeholder={`請輸入${isMajor ? '計畫' : '任務'}名稱`}
            />
          </div>
          {isMajor ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">維度</label><select className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" value={localItem.indicatorId} onChange={e => setLocalItem({ ...localItem, indicatorId: e.target.value, goalId: firstGoalId(data.goals, e.target.value) })}>{INDICATORS.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}</select></div>
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">目標</label><select className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" value={localItem.goalId} onChange={e => setLocalItem({ ...localItem, goalId: e.target.value })}>{data.goals[localItem.indicatorId]?.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">開始日期</label><input type="date" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.startDate} onChange={e => setLocalItem({ ...localItem, startDate: e.target.value })} /></div>
                <div><label className="block text-[10px] font-black text-sky-600 mb-2 tracking-widest uppercase">結束日期</label><input type="date" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.endDate} onChange={e => setLocalItem({ ...localItem, endDate: e.target.value })} /></div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {localItem.type !== 'infinite' && !isArchivedTask && (
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
                    <label htmlFor="isPriority" className="text-sm font-black text-sky-700 cursor-pointer select-none">設為優先任務</label>
                    <p className="text-[10px] text-sky-400 font-bold">勾選後要先照順序做完優先任務，其他任務（隨時挑戰除外）會暫時鎖住。</p>
                  </div>
                  {localItem.isPriority && (
                    <div className="ml-auto shrink-0 flex items-center gap-2 bg-amber-50/50 px-3 py-1.5 rounded-xl border border-amber-100">
                      <span className="text-[10px] font-black text-amber-600 whitespace-nowrap">
                        {existingPriorityOrder ? `優先順序第 ${existingPriorityOrder} 名` : '會排在優先順序的最後'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex p-1.5 bg-white/30 backdrop-blur-md rounded-[24px] gap-1 relative border border-white/40">
                {['precise', 'daily', 'weekly', 'infinite'].map(m => (
                  <button
                    key={m}
                    disabled={isArchivedTask}
                    onClick={() => {
                      if (m === 'infinite') {
                        setLocalItem({ ...localItem, type: m, isPriority: false, noTime: true });
                      } else {
                        setLocalItem({ ...localItem, type: m });
                      }
                    }}
                    className={`relative flex-1 py-4 rounded-2xl text-[10px] font-black z-10 transition-colors disabled:cursor-not-allowed ${localItem.type === m ? 'text-sky-800' : isArchivedTask ? 'text-sky-300' : 'text-sky-500 hover:text-sky-700'}`}
                  >
                    {m === 'precise' ? '一次性任務' : m === 'daily' ? '每日任務' : m === 'weekly' ? '每週任務' : '隨時挑戰'}
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
              {isArchivedTask && (
                <p className="-mt-4 ml-2 text-[10px] font-bold text-sky-400">這個任務已經結束，不能改類型。</p>
              )}
              {localItem.type === 'infinite' && (
                <p className="-mt-4 ml-2 text-[10px] font-bold text-sky-500">不限時間、可以重複完成無限次，不受優先任務限制。</p>
              )}
              {localItem.type === 'weekly' && (<div className="flex justify-between bg-white/30 p-2 rounded-[24px] border border-white/40">{[0, 1, 2, 3, 4, 5, 6].map(d => <button key={d} onClick={() => setLocalItem({ ...localItem, days: toggleWeekDay(localItem.days, d) })} className={`w-11 h-11 rounded-full text-[10px] font-black transition-all border-2 ${localItem.days.includes(d) ? 'bg-sky-500 text-white border-sky-400 shadow-md scale-110' : 'text-sky-300 border-transparent hover:bg-white/40'}`}>{WEEK_DAYS[d]}</button>)}</div>)}
              
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
                      <label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest ml-1">開始時間</label>
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
                    <div className="space-y-2"><label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest ml-1">開始時間</label><input type="time" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.startTime} onChange={e => setLocalItem({ ...localItem, startTime: e.target.value })} /></div>
                    <div className="space-y-2"><label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest ml-1">結束時間</label><input type="time" className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none" value={localItem.endTime} onChange={e => setLocalItem({ ...localItem, endTime: e.target.value })} /></div>
                  </div>
                )
              )}

              <div className="group">
                <label className="block text-[10px] font-black text-sky-600 mb-3 uppercase tracking-[0.2em] ml-1">完成獎勵（抽卡券）</label>
                <div className="relative flex items-center">
                  <div className="absolute left-5 text-sky-400">
                    <Tag className="w-5 h-5" />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full bg-white/40 backdrop-blur-md p-5 pl-14 rounded-3xl text-xl font-black outline-none border border-white/60 focus:border-sky-500/50 focus:bg-white/60 text-sky-900 transition-all shadow-sm"
                    value={localItem.rewardTickets ?? 1}
                    onChange={e => setLocalItem({ ...localItem, rewardTickets: toNonNegativeInt(e.target.value) })}
                    placeholder="輸入抽卡券張數"
                  />
                </div>
              </div>
            </div>
          )}
          <button onClick={handleSave} className="group relative w-full py-6 bg-sky-500/80 backdrop-blur-xl text-white font-black rounded-[32px] shadow-2xl shadow-sky-200/50 hover:bg-sky-600 hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 overflow-hidden border border-white/20">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
            <span className="relative flex items-center justify-center gap-3 text-xl tracking-[0.2em]"><CheckCircle2 className="w-7 h-7" /> 儲存設定</span>
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default TaskEditor;