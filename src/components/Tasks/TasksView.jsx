import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Zap, CheckCircle2, CalendarDays, Lock, Edit3, Archive, Trash2, Plus, ChevronUp, ChevronDown, Settings2, RotateCcw
} from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { INDICATORS } from '../../constants/index.jsx';
import { getTodayStr, formatTaskTime } from '../../utils';

const TasksView = ({ setEditingTask, setIsPriorityManagerOpen, onCompleteSubTask }) => {
  const {
    data, updateData, activePriorityTasks, reorderPriorityTasks,
    completeSubTaskData, revertTaskCompletion, deleteMajorTask, deleteSubTask, terminateSubTask
  } = useAppData();
  const [expandedArchived, setExpandedArchived] = useState({});
  const [filterIndicator, setFilterIndicator] = useState('all');

  // 自動追蹤定位計畫
  const majorTaskRefs = useRef({});
  const lastInteractedMajorId = useRef(null);

  useEffect(() => {
    if (lastInteractedMajorId.current && majorTaskRefs.current[lastInteractedMajorId.current]) {
      const element = majorTaskRefs.current[lastInteractedMajorId.current];
      // 延遲一點點執行，等待 Framer Motion 的 layout 動畫開始
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        lastInteractedMajorId.current = null;
      }, 100);
    }
  }, [data.subTasks, data.archivedSubTasks]);

  const addMajorTask = (indicatorId, goalId) => {
    const newTask = { id: crypto.randomUUID(), indicatorId, goalId, title: '', startDate: getTodayStr(), endDate: getTodayStr(), completed: false, createdAt: new Date().toISOString() };
    setEditingTask({ type: 'major', item: newTask });
  };

  const toggleMajorTask = (taskId) => {
    updateData(prev => {
      const task = prev.majorTasks.find(t => t.id === taskId);
      if (!task) return prev;

      const subTasksToArchive = prev.subTasks.filter(s => s.majorTaskId === taskId);
      let updatedSubTasks = prev.subTasks.filter(s => s.majorTaskId !== taskId);
      
      const priorityTasksToRemove = subTasksToArchive.filter(s => s.isPriority).map(s => s.id);
      if (priorityTasksToRemove.length > 0) {
        const remainingPriorityTasks = updatedSubTasks
          .filter(t => t.isPriority)
          .sort((a, b) => a.priorityOrder - b.priorityOrder);
          
        updatedSubTasks = updatedSubTasks.map(t => {
          if (!t.isPriority) return t;
          const newIndex = remainingPriorityTasks.findIndex(rt => rt.id === t.id);
          return { ...t, priorityOrder: newIndex + 1 };
        });
      }

      return {
        ...prev,
        majorTasks: prev.majorTasks.filter(t => t.id !== taskId),
        subTasks: updatedSubTasks,
        archivedTasks: [...prev.archivedTasks, { ...task, completed: true, completedAt: new Date().toISOString() }],
        archivedSubTasks: [...prev.archivedSubTasks, ...subTasksToArchive.map(s => ({ ...s, completed: true, completedAt: new Date().toISOString(), isPriority: false, priorityOrder: 0 }))]
      };
    });
  };

  const addSubTask = (majorTaskId) => {
    const major = data.majorTasks.find(t => t.id === majorTaskId);
    if (!major) return;
    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);
    const getLocalISO = (d) => {
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().slice(0, 16);
    };
    const startDateTime = getLocalISO(now);
    const endDateTime = getLocalISO(new Date(now.getTime() + 3600000));
    const newSub = {
      id: crypto.randomUUID(),
      majorTaskId,
      indicatorId: major.indicatorId,
      goalId: major.goalId,
      title: '',
      type: 'precise',
      startTime,
      endTime: new Date(now.getTime() + 3600000).toTimeString().slice(0, 5),
      days: [1, 2, 3, 4, 5],
      startDateTime,
      endDateTime,
      noTime: true,
      completed: false,
      isPriority: false,
      priorityOrder: 0,
      rewardTickets: 1,
      createdAt: new Date().toISOString()
    };
    setEditingTask({ type: 'sub', item: newSub });
    lastInteractedMajorId.current = majorTaskId;
  };

  const completeSubTask = (id, majorTaskId) => {
    lastInteractedMajorId.current = majorTaskId;
    if (onCompleteSubTask) {
      onCompleteSubTask(id);
    } else {
      completeSubTaskData(id);
    }
  };


  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-2 gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <LayoutDashboard className="w-6 h-6 md:w-8 md:h-8 text-sky-500" />
          <h2 className="text-2xl md:text-3xl font-black text-sky-900 tracking-tight">進行中的計畫</h2>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <div className="flex p-1 bg-white/40 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm relative overflow-x-auto no-scrollbar">
            {['all', ...INDICATORS.map(i => i.id)].map(id => {
              const name = id === 'all' ? '全部' : INDICATORS.find(i => i.id === id).name;
              const isActive = filterIndicator === id;
              return (
                <button
                  key={id}
                  onClick={() => setFilterIndicator(id)}
                  className={`relative px-3 md:px-4 py-1.5 rounded-xl text-[10px] md:text-[10px] font-black transition-colors duration-300 z-10 whitespace-nowrap ${isActive ? 'text-white' : 'text-sky-600 hover:text-sky-700'}`}
                >
                  <span className="relative z-10">{name}</span>
                  {isActive && (
                    <motion.div
                      layoutId="taskFilterHighlight"
                      className="absolute inset-0 bg-sky-500 rounded-xl shadow-md"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <button onClick={() => setIsPriorityManagerOpen(true)} className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-2xl font-black text-[10px] md:text-xs flex items-center justify-center gap-2 transition-colors shadow-sm">
              <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" /> 管理優先級
          </button>
        </div>
      </div>

      <motion.div
        layout
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
      >
        <AnimatePresence mode="popLayout">
    {data.majorTasks
      .filter(t => filterIndicator === 'all' || t.indicatorId === filterIndicator)
      .sort((a, b) => {
      const getHighestPriority = (taskId) => {
        const subs = data.subTasks.filter(s => s.majorTaskId === taskId && s.isPriority);
        if (subs.length === 0) return Infinity;
        return Math.min(...subs.map(s => s.priorityOrder || Infinity));
      };
      const priorityA = getHighestPriority(a.id);
      const priorityB = getHighestPriority(b.id);
      if (priorityA !== priorityB) return priorityA - priorityB;

      const getActiveUnfinishedCount = (taskId) => {
        const today = new Date();
        const currentDay = today.getDay();
        const todayStr = getTodayStr();
        
        return data.subTasks.filter(s => {
          if (s.majorTaskId !== taskId) return false;
          
          // 如果是重複性任務
          if (s.type === 'daily' || s.type === 'weekly') {
            const isTodayCompleted = s.lastCompletedAt && s.lastCompletedAt.startsWith(todayStr);
            const isWrongDay = s.type === 'weekly' && !s.days.includes(currentDay);
            // 排除已勾選或被鎖定(非指定日期)的任務
            return !isTodayCompleted && !isWrongDay;
          }
          
          // 如果是一次性任務，排除已完成的 (雖然理論上 subTasks 裡都是未完成的，但為了嚴謹性保留)
          return !s.completed;
        }).length;
      };

      const countA = getActiveUnfinishedCount(a.id);
      const countB = getActiveUnfinishedCount(b.id);
      if (countA !== countB) return countB - countA; // 數量越多越前

      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    }).map(task => {
      const ind = INDICATORS.find(i => i.id === task.indicatorId);
      const subs = data.subTasks.filter(s => s.majorTaskId === task.id);
      const goal = data.goals[task.indicatorId]?.find(g => g.id === task.goalId);
      return (
        <motion.div
          key={task.id}
          ref={el => majorTaskRefs.current[task.id] = el}
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/40 backdrop-blur-2xl rounded-[32px] md:rounded-[48px] p-6 md:p-8 border border-white/60 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] group transition-all hover:shadow-[0_30px_60px_-10px_rgba(0,0,0,0.1)] hover:-translate-y-1 md:hover:-translate-y-2 relative overflow-hidden"
        >
          <div className={`absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-gradient-to-br ${ind?.color} opacity-[0.03] blur-3xl pointer-events-none`} />
          <div className="flex justify-between items-start mb-4 md:mb-6 relative z-10">
            <div className="flex items-center gap-2 md:gap-3">
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-gradient-to-br ${ind?.color} flex items-center justify-center text-white shadow-lg shadow-sky-200/50`}>{ind?.icon}</div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 md:px-4 md:py-2 bg-white/60 text-sky-700 rounded-xl md:rounded-2xl border border-white/40 backdrop-blur-md truncate max-w-[120px] md:max-w-none">{goal?.title || '計畫中'}</span>
            </div>
            <button onClick={() => toggleMajorTask(task.id)} className="p-2 md:p-2.5 bg-white/60 hover:bg-emerald-50 text-sky-400 hover:text-emerald-500 rounded-xl md:rounded-2xl transition-all hover:scale-110 active:scale-90 border border-white/40 shadow-sm"><CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" /></button>
          </div>
          <h3 className="text-xl md:text-2xl font-black text-sky-950 mb-1 md:mb-1.5 break-words tracking-tight relative z-10">{task.title}</h3>
          <p className="text-[9px] md:text-[10px] font-black text-sky-800 mb-6 md:mb-8 flex items-center gap-1.5 md:gap-2 uppercase tracking-[0.1em] bg-sky-100/50 w-fit px-2.5 py-1 rounded-lg border border-sky-200/50 relative z-10"><CalendarDays className="w-3 md:w-3.5 h-3 md:h-3.5" /> {task.startDate} — {task.endDate}</p>
          <div className="space-y-2.5 md:space-y-3 relative z-10">
            <AnimatePresence mode="popLayout">
              {subs.map(sub => {
                const today = new Date();
                const currentDay = today.getDay();
                const isWrongDay = sub.type === 'weekly' && !sub.days.includes(currentDay);
                
                // 無限任務不受優先級限制且不會被日期鎖定
                const isLocked = sub.type !== 'infinite' && ((activePriorityTasks.length > 0 && activePriorityTasks[0].id !== sub.id) || isWrongDay);
                
                // 無限任務不顯示為「今日已完成」狀態，以便可以無限次點擊
                const isTodayCompleted = sub.type !== 'infinite' && (sub.type === 'daily' || sub.type === 'weekly') &&
                                         sub.lastCompletedAt &&
                                         sub.lastCompletedAt.startsWith(getTodayStr());

                return (
                <motion.div
                  key={sub.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex items-center gap-2.5 md:gap-3 p-3 md:p-4 backdrop-blur-md rounded-2xl md:rounded-[24px] border shadow-sm transition-all group/sub ${
                    isLocked ? 'bg-slate-100/50 border-slate-200 opacity-70 grayscale-[0.5]' :
                    isTodayCompleted ? 'bg-emerald-50/40 border-emerald-100/50 opacity-80' :
                    'bg-white/60 border-white hover:border-sky-200 hover:bg-white'
                  }`}
                >
                  <div className="relative flex items-center justify-center shrink-0">
                    {isLocked ? (
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-xl border-2 border-slate-200 bg-slate-100/50 flex items-center justify-center">
                        <Lock className="w-3 h-3 md:w-4 md:h-4 text-slate-400" />
                      </div>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          checked={isTodayCompleted}
                          onChange={() => {
                            if (isTodayCompleted) {
                              if (confirm('確定要取消今日的完成紀錄嗎？這將會回收一張抽卡券。')) {
                                lastInteractedMajorId.current = task.id;
                                revertTaskCompletion(sub.id);
                              }
                            } else {
                              completeSubTask(sub.id, task.id);
                            }
                          }}
                          className={`peer w-5 h-5 md:w-6 md:h-6 rounded-md md:rounded-lg border-2 appearance-none cursor-pointer transition-all ${
                            isTodayCompleted
                              ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-200/50'
                              : 'border-sky-200 bg-white hover:border-sky-400'
                          }`}
                        />
                        <CheckCircle2 className={`absolute w-3 h-3 md:w-4 md:h-4 text-white pointer-events-none transition-opacity ${isTodayCompleted ? 'opacity-100' : 'opacity-0 peer-checked:opacity-100'}`} />
                      </>
                    )}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex items-start justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {sub.isPriority && (
                          <span className={`px-1.5 py-0.5 rounded-md text-[7px] md:text-[8px] font-black uppercase tracking-wider border ${
                            isLocked ? 'bg-slate-200 text-slate-500 border-slate-300' :
                            isTodayCompleted ? 'bg-emerald-100 text-emerald-600 border-emerald-200' :
                            'bg-amber-100 text-amber-600 border-amber-200'
                          }`}>
                            P{sub.priorityOrder}
                          </span>
                        )}
                        <p className={`text-xs md:text-sm font-black break-words leading-tight transition-colors ${
                          isTodayCompleted ? 'text-emerald-800/60 line-through' : 'text-sky-900'
                        }`}>{sub.title}</p>
                      </div>
                      {(sub.type === 'daily' || sub.type === 'weekly' || sub.type === 'infinite') && sub.completionCount > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { lastInteractedMajorId.current = task.id; revertTaskCompletion(sub.id); }}
                            className="p-1 text-rose-300 hover:text-rose-500 transition-colors"
                            title="撤銷最後一次完成"
                          >
                            <RotateCcw className="w-2.5 h-2.5 md:w-3 md:h-3" />
                          </button>
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[8px] md:text-[9px] font-black leading-none border border-emerald-500/20">
                            ×{sub.completionCount}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-[8px] md:text-[9px] font-black text-sky-800 uppercase tracking-tighter">{formatTaskTime(sub)}</p>
                  </div>
                  <div className="flex gap-0 opacity-0 md:group-hover/sub:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => { lastInteractedMajorId.current = task.id; setEditingTask({ type: 'sub', item: sub }); }} className="p-1.5 md:p-2 text-sky-600 hover:text-sky-800 hover:bg-sky-50 rounded-lg md:rounded-xl transition-all" title="編輯項目"><Edit3 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                    {(sub.type === 'daily' || sub.type === 'weekly' || sub.type === 'infinite') && (<button onClick={() => { if(confirm('確定要終止此任務並將其歸檔嗎？')) { lastInteractedMajorId.current = task.id; terminateSubTask(sub.id); } }} className="p-1.5 md:p-2 text-sky-600 hover:text-amber-500 hover:bg-amber-50 rounded-lg md:rounded-xl transition-all" title="終止並歸檔"><Archive className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>)}
                    <button onClick={() => { lastInteractedMajorId.current = task.id; deleteSubTask(sub.id); }} className="p-1.5 md:p-2 text-sky-600 hover:text-red-500 hover:bg-red-50 rounded-lg md:rounded-xl transition-all" title="刪除項目"><Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>
            <button onClick={() => addSubTask(task.id)} className="w-full py-3 md:py-4 bg-white/40 hover:bg-white text-sky-600 rounded-2xl md:rounded-[24px] text-[10px] md:text-[11px] font-black flex items-center justify-center gap-2 mt-3 md:mt-4 border-2 border-dashed border-white hover:border-sky-200 transition-all shadow-sm active:scale-95"><Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> 新增任務</button>
            {(() => {
              const archivedSubs = data.archivedSubTasks.filter(s => s.majorTaskId === task.id);
              if (archivedSubs.length === 0) return null;
              return (
                <div className="mt-3 md:mt-4">
                  <button
                    onClick={() => setExpandedArchived(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                    className="w-full py-1.5 text-[8px] md:text-[9px] font-black text-sky-600 hover:text-sky-800 flex items-center justify-between px-2"
                  >
                    <span>已完成 ({archivedSubs.length})</span>
                    {expandedArchived[task.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {expandedArchived[task.id] && (
                    <div className="space-y-2 mt-2">
                      {archivedSubs.map(sub => (
                        <div key={sub.id} className="flex items-center gap-2.5 p-2.5 bg-sky-50/30 rounded-xl md:rounded-2xl border border-sky-50 group/archived">
                          <input type="checkbox" checked={true} onChange={() => { lastInteractedMajorId.current = task.id; revertTaskCompletion(sub.id); }} className="w-4 h-4 md:w-5 md:h-5 rounded-md md:rounded-lg text-emerald-500 border-sky-100 cursor-pointer" />
                          <div className="flex-grow min-w-0">
                            <div className="flex items-start justify-between gap-1 mb-0.5">
                              <p className="text-[11px] md:text-xs font-bold line-through text-sky-300 break-words leading-tight">{sub.title}</p>
                              {(sub.type === 'daily' || sub.type === 'weekly' || sub.type === 'infinite') && sub.completionCount > 0 && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-500/5 text-emerald-500/40 text-[7px] md:text-[8px] font-black leading-none">×{sub.completionCount}</span>
                              )}
                            </div>
                            <p className="text-[7px] md:text-[8px] font-black text-sky-200">{formatTaskTime(sub)}</p>
                          </div>
                          <button onClick={() => { lastInteractedMajorId.current = task.id; deleteSubTask(sub.id); }} className="opacity-0 md:group-hover/archived:opacity-100 p-1 text-sky-100 hover:text-red-400">
                            <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-white/20 flex justify-between relative z-10"><button onClick={() => setEditingTask({ type: 'major', item: task })} className="text-[9px] md:text-[10px] font-black text-sky-600 hover:text-sky-800 flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-white/40 hover:bg-white/80 rounded-lg md:rounded-xl transition-all border border-white/40 shadow-sm"><Settings2 className="w-3 md:w-3.5 h-3 md:h-3.5" /> 編輯</button><button onClick={() => { if(confirm('確定要刪除此計畫及其所有任務嗎？')) deleteMajorTask(task.id) }} className="text-[9px] md:text-[10px] font-black text-sky-400 hover:text-red-500 flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-white/40 hover:bg-red-50 rounded-lg md:rounded-xl transition-all border border-white/40 shadow-sm"><Trash2 className="w-3 md:w-3.5 h-3 md:h-3.5" /></button></div>
        </motion.div>
      );
    })}
        </AnimatePresence>
    <div className="bg-white/20 border-4 border-dashed border-white/60 rounded-3xl md:rounded-[40px] p-6 md:p-10 flex flex-col items-center justify-center gap-4 md:gap-6 min-h-[300px] md:min-h-[350px]"><div className="flex gap-2.5 md:gap-4">{INDICATORS.map(ind => (<button key={ind.id} onClick={() => { const firstGoal = data.goals[ind.id][0]; if (firstGoal) addMajorTask(ind.id, firstGoal.id); }} className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br ${ind.color} text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all`}>{ind.icon}</button>))}</div><div className="text-center"><p className="font-black text-[9px] md:text-[10px] text-sky-400 uppercase tracking-widest mb-1">展開新旅程</p><p className="text-[8px] md:text-[9px] text-sky-300 italic">選擇維度開始一個計畫</p></div></div>
  </motion.div>
  {data.archivedTasks.length > 0 && (
    <div className="space-y-6">
      <div className="flex items-center gap-3 md:gap-4 px-2">
        <Archive className="w-6 h-6 md:w-8 md:h-8 text-emerald-500" />
        <h2 className="text-2xl md:text-3xl font-black text-sky-900 tracking-tight">已完成的計畫</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {data.archivedTasks.map(task => {
          const ind = INDICATORS.find(i => i.id === task.indicatorId);
          const archivedSubs = data.archivedSubTasks.filter(s => s.majorTaskId === task.id);
          const activeSubs = data.subTasks.filter(s => s.majorTaskId === task.id);
          const allSubs = [...activeSubs, ...archivedSubs];
          const goal = data.goals[task.indicatorId]?.find(g => g.id === task.goalId);
          const isExpanded = expandedArchived[task.id];

          return (
            <div key={task.id} className="bg-emerald-50/50 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-7 border border-emerald-100 shadow-lg opacity-75 group transition-all">
              <div className="flex justify-between items-start mb-4 md:mb-5">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-2xl bg-gradient-to-br ${ind?.color} flex items-center justify-center text-white shadow-sm opacity-60`}>{ind?.icon}</div>
                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest px-2.5 py-1 md:px-3 md:py-1.5 bg-white/60 text-emerald-600 rounded-full border border-emerald-50">{goal?.title || '已完成'}</span>
                </div>
                <div className="flex gap-0.5 md:gap-1">
                  <button onClick={() => updateData(prev => ({ ...prev, archivedTasks: prev.archivedTasks.filter(t => t.id !== task.id), majorTasks: [...prev.majorTasks, { ...task, completed: false }] }))} className="p-1.5 md:p-2 text-emerald-300 hover:text-sky-500 transition-colors" title="恢復計畫"><RotateCcw className="w-4 h-4 md:w-5 md:h-5" /></button>
                  <button onClick={() => { if(confirm('確定要永久刪除此已完成計畫及其任務紀錄嗎？')) deleteMajorTask(task.id) }} className="p-1.5 md:p-2 text-emerald-200 hover:text-red-400 transition-colors" title="刪除計畫"><Trash2 className="w-4 h-4 md:w-5 md:h-5" /></button>
                </div>
              </div>
              <h3 className="text-lg md:text-xl font-black text-emerald-800 mb-1 line-through break-words">{task.title}</h3>
              <p className="text-[8px] md:text-[9px] font-bold text-emerald-400 mb-3 md:mb-4 flex items-center gap-1.5 md:gap-2 uppercase tracking-tighter"><CalendarDays className="w-3 md:w-3.5 h-3 md:h-3.5" /> {task.startDate} 至 {task.endDate}</p>
              
              {allSubs.length > 0 && (
                <div className="mt-3 md:mt-4">
                  <button
                    onClick={() => setExpandedArchived(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                    className="w-full py-1.5 md:py-2 text-[8px] md:text-[9px] font-black text-emerald-400 hover:text-emerald-600 flex items-center justify-between px-2 bg-emerald-100/30 rounded-xl transition-colors"
                  >
                    <span>查看任務 ({allSubs.length})</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  
                  {isExpanded && (
                    <div className="space-y-2 mt-2 md:mt-3 animate-in slide-down">
                      {allSubs.map(sub => (
                        <div key={sub.id} className="flex items-center gap-2.5 p-2.5 md:p-3 bg-white/40 rounded-xl md:rounded-2xl border border-emerald-100/50">
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => revertTaskCompletion(sub.id)}
                            className="w-4 h-4 md:w-5 md:h-5 rounded-md md:rounded-lg text-emerald-500 border-sky-100 cursor-pointer"
                          />
                          <div className="flex-grow min-w-0">
                            <div className="flex items-start justify-between gap-1 mb-0.5">
                              <p className={`text-[11px] md:text-xs font-bold break-words leading-snug ${sub.completed ? 'line-through text-emerald-300' : 'text-emerald-700'}`}>
                                {sub.title}
                              </p>
                              {(sub.type === 'daily' || sub.type === 'weekly' || sub.type === 'infinite') && sub.completionCount > 0 && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-500 text-[7px] md:text-[8px] font-black leading-none">完成 {sub.completionCount} 次</span>
                              )}
                            </div>
                            <p className="text-[7px] md:text-[8px] font-black text-emerald-300/70">{formatTaskTime(sub)}</p>
                          </div>
                          {sub.completed && <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-400 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  )}
</div>
  );
};

export default TasksView;