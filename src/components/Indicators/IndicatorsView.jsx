import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Trophy, RotateCcw, Trash2, Plus, CheckCircle2, ArrowUp, ArrowDown, BookOpen, Heart, Smile } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { INDICATORS } from '../../constants/index.jsx';

const IndicatorsView = ({ setEditingTask }) => {
  const { data, updateData, getIndicatorStats } = useAppData();
  const [addingGoalTo, setAddingGoalTo] = useState(null);
  const [newGoalTitle, setNewGoalTitle] = useState('');

  const addGoal = (indicatorId, title) => {
    const finalTitle = title?.trim();
    if (!finalTitle) {
      setAddingGoalTo(null);
      setNewGoalTitle('');
      return;
    }
    if (data.goals[indicatorId].length >= 3) return;
    const newGoal = { id: crypto.randomUUID(), title: finalTitle, order: data.goals[indicatorId].length + 1 };
    updateData(prev => ({ ...prev, goals: { ...prev.goals, [indicatorId]: [...prev.goals[indicatorId], newGoal] } }));
    setAddingGoalTo(null);
    setNewGoalTitle('');
  };

  const deleteGoal = (indicatorId, goalId) => updateData(prev => ({ ...prev, goals: { ...prev.goals, [indicatorId]: prev.goals[indicatorId].filter(g => g.id !== goalId) } }));
  
  const completeGoal = (indicatorId, goalId) => {
    updateData(prev => {
      const goal = prev.goals[indicatorId].find(g => g.id === goalId);
      if (!goal) return prev;
      return {
        ...prev,
        goals: { ...prev.goals, [indicatorId]: prev.goals[indicatorId].filter(g => g.id !== goalId) },
        archivedGoals: [...prev.archivedGoals, { ...goal, indicatorId, completedAt: new Date().toISOString() }]
      };
    });
  };

  const uncompleteGoal = (goalId) => {
    updateData(prev => {
      const goal = prev.archivedGoals.find(g => g.id === goalId);
      if (!goal) return prev;
      const { indicatorId } = goal;
      return {
        ...prev,
        archivedGoals: prev.archivedGoals.filter(g => g.id !== goalId),
        goals: { ...prev.goals, [indicatorId]: [...prev.goals[indicatorId], { id: goal.id, title: goal.title, order: prev.goals[indicatorId].length + 1 }] }
      };
    });
  };

  const moveGoal = (indicatorId, index, direction) => {
    const newGoals = [...data.goals[indicatorId]];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newGoals.length) return;
    [newGoals[index], newGoals[targetIndex]] = [newGoals[targetIndex], newGoals[index]];
    updateData(prev => ({ ...prev, goals: { ...prev.goals, [indicatorId]: newGoals } }));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
      {INDICATORS.map(ind => {
        const totalCompleted = getIndicatorStats(ind.id);

        return (
          <div key={ind.id} className="bg-white/40 backdrop-blur-xl rounded-[32px] md:rounded-[48px] p-6 md:p-8 border border-white/60 shadow-xl transition-all hover:-translate-y-1 md:hover:-translate-y-2 hover:scale-[1.01] md:hover:scale-[1.02]">
            <div className="flex justify-between items-start mb-6 md:mb-8">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl md:rounded-3xl bg-gradient-to-br ${ind.color} flex items-center justify-center text-white shadow-lg shadow-sky-200`}>{ind.icon}</div>
              <div className="text-right">
                <p className="text-[8px] md:text-[10px] font-black text-sky-400 uppercase tracking-widest mb-1">累計成就</p>
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-2xl md:text-3xl font-black text-sky-900">{totalCompleted}</span>
                  <span className="text-xs font-bold text-sky-400">次</span>
                </div>
              </div>
            </div>
            <h2 className="text-xl md:text-2xl font-black mb-4 md:mb-6 text-sky-900">{ind.name}目標</h2>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {(data.goals[ind.id] || []).map((goal, idx) => (
                <motion.div
                  key={goal.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="group relative flex items-start bg-white/60 pl-3 md:pl-4 pr-1 py-3 md:py-4 rounded-2xl md:rounded-3xl border border-white/80 shadow-sm hover:bg-white overflow-hidden min-h-[56px] md:min-h-[64px]"
                >
                  <span className={`flex-shrink-0 w-6 h-6 md:w-7 md:h-7 rounded-lg md:rounded-xl bg-gradient-to-br ${ind.color} flex items-center justify-center text-[10px] md:text-[11px] font-black text-white mr-2 md:mr-3 shadow-lg shadow-sky-200/50 transform -rotate-3 group-hover:rotate-0 transition-transform duration-300 mt-0.5`}>
                    {idx + 1}
                  </span>
                  <div className="flex-grow min-w-0 relative pt-1 md:pt-1">
                    <textarea
                      className="w-full bg-transparent font-bold text-sky-800 outline-none focus:text-sky-500 text-xs md:text-sm pr-10 md:pr-10 resize-none overflow-hidden min-h-[18px] md:min-h-[20px] leading-relaxed block break-words whitespace-pre-wrap"
                      placeholder="請輸入目標名稱..."
                      value={goal.title}
                      rows={1}
                      ref={(el) => {
                        if (el) {
                          el.style.height = 'auto';
                          el.style.height = el.scrollHeight + 'px';
                        }
                      }}
                      onChange={(e) => updateData(prev => ({ ...prev, goals: { ...prev.goals, [ind.id]: prev.goals[ind.id].map(g => g.id === goal.id ? { ...g, title: e.target.value } : g) } }))}
                    />
                  </div>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex opacity-0 group-hover:opacity-100 transition-opacity bg-white/60 backdrop-blur-md rounded-xl md:rounded-2xl p-0.5 shadow-xl border border-white/40 z-20 scale-90 md:scale-100">
                    <button onClick={() => completeGoal(ind.id, goal.id)} className="p-1 md:p-1.5 text-sky-200 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg md:rounded-xl transition-all" title="完成目標"><CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                    <button onClick={() => moveGoal(ind.id, idx, -1)} className="p-1 md:p-1.5 text-sky-200 hover:text-sky-400 hover:bg-sky-50 rounded-lg md:rounded-xl transition-all" title="上移"><ArrowUp className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                    <button onClick={() => moveGoal(ind.id, idx, 1)} className="p-1 md:p-1.5 text-sky-200 hover:text-sky-400 hover:bg-sky-50 rounded-lg md:rounded-xl transition-all" title="下移"><ArrowDown className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                    <button onClick={() => deleteGoal(ind.id, goal.id)} className="p-1 md:p-1.5 text-sky-200 hover:text-red-400 hover:bg-red-50 rounded-lg md:rounded-xl transition-all" title="刪除"><Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {(data.goals[ind.id] || []).length < 3 && (
              addingGoalTo === ind.id ? (
                <div className="mt-3 md:mt-4 animate-in slide-down">
                  <input
                    autoFocus
                    className="w-full bg-white/80 p-3 md:p-4 rounded-2xl md:rounded-3xl border-2 border-sky-400 font-bold text-sky-800 outline-none shadow-lg shadow-sky-100 text-sm"
                    placeholder="輸入新目標名稱..."
                    value={newGoalTitle}
                    onChange={e => setNewGoalTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addGoal(ind.id, newGoalTitle);
                      if (e.key === 'Escape') { setAddingGoalTo(null); setNewGoalTitle(''); }
                    }}
                    onBlur={() => addGoal(ind.id, newGoalTitle)}
                  />
                  <p className="text-[7px] md:text-[8px] font-black text-sky-300 mt-2 ml-3 md:ml-4 uppercase tracking-widest">按 Enter 確認 / Esc 取消</p>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingGoalTo(ind.id); setNewGoalTitle(''); }}
                  className="w-full py-3 md:py-4 border-2 border-dashed border-sky-100 rounded-2xl md:rounded-3xl text-sky-300 hover:text-sky-500 hover:border-sky-300 transition-all flex items-center justify-center gap-2 font-black text-[9px] md:text-[10px] uppercase tracking-widest mt-3 md:mt-4"
                >
                  <Plus className="w-4 h-4" /> 點擊新增核心目標
                </button>
              )
            )}
          </div>
        </div>
        );
      })}
      
      {data.archivedGoals.length > 0 && (
        <div className="col-span-full mt-8 md:mt-12 animate-in slide-up">
          <div className="flex items-center gap-3 md:gap-4 px-2 mb-6 md:mb-8">
            <Archive className="w-6 h-6 md:w-8 md:h-8 text-emerald-500" />
            <h2 className="text-2xl md:text-3xl font-black text-sky-900 tracking-tight">已達成的核心目標</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {data.archivedGoals.map(goal => {
              const ind = INDICATORS.find(i => i.id === goal.indicatorId);
              return (
                <div key={goal.id} className="bg-emerald-50/50 backdrop-blur-xl rounded-[32px] md:rounded-[40px] p-6 md:p-7 border border-emerald-100 shadow-lg group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-3 md:mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 md:w-6 md:h-6 rounded-lg bg-gradient-to-br ${ind?.color} flex items-center justify-center text-white shadow-sm opacity-60 text-[8px] md:text-[10px]`}>{ind?.icon}</div>
                      <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-emerald-600/60 bg-emerald-100/50 px-2 py-1 rounded-md">{ind?.name}</span>
                    </div>
                    <div className="flex gap-0.5 md:gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => uncompleteGoal(goal.id)} className="p-1.5 md:p-2 text-emerald-300 hover:text-sky-500 transition-colors" title="恢復目標"><RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                      <button onClick={() => updateData(prev => ({ ...prev, archivedGoals: prev.archivedGoals.filter(g => g.id !== goal.id) }))} className="p-1.5 md:p-2 text-emerald-200 hover:text-red-400 transition-colors" title="刪除紀錄"><Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                    </div>
                  </div>
                  <h3 className="text-base md:text-lg font-black text-emerald-800 line-through mb-1 break-words leading-tight">{goal.title || '未命名目標'}</h3>
                  <p className="text-[8px] md:text-[9px] font-bold text-emerald-400/60 uppercase tracking-tighter italic">達成於 {new Date(goal.completedAt).toLocaleDateString()}</p>
                  
                  <div className="absolute -bottom-2 -right-2 opacity-5 scale-125 md:scale-150 rotate-12">
                    <Trophy className="w-16 h-16 md:w-20 md:h-20 text-emerald-600" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default IndicatorsView;