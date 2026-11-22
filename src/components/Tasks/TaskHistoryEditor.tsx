import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { RotateCw, X, CheckCircle2 } from 'lucide-react';
import { useAppData } from '../../contexts/useAppData.ts';
import { INDICATORS } from '../../constants/index.tsx';
import { formatForDateTimeLocal } from '../../utils/index.ts';
import { addHistoryRecord, historyFieldsFromTask, linkableHistoryTasks } from '../../domain/taskHistory.ts';
import { isStoppedTask } from '../../domain/tasks.ts';
import type { Dispatch, SetStateAction } from 'react';
import type { IndicatorId, TaskHistoryRecord, TaskType } from '../../types/data.ts';
import type { EditingTaskHistory } from '../../types/ui.ts';

interface TaskHistoryEditorProps {
  editingTaskHistory: EditingTaskHistory;
  setEditingTaskHistory: Dispatch<SetStateAction<EditingTaskHistory | null>>;
}

/** 編輯中的紀錄：這幾個欄位一開始就補上預設值 */
type LocalHistory = EditingTaskHistory & Required<Pick<EditingTaskHistory, 'title' | 'majorTaskTitle' | 'indicatorId' | 'type'>>;

const TaskHistoryEditor = ({ editingTaskHistory, setEditingTaskHistory }: TaskHistoryEditorProps) => {
  const { data, updateData } = useAppData();
  // 預設值先放進一個變數再展開：completedAt 在型別上一定有，直接寫在同一個物件裡型別檢查會說「一定被蓋掉」。
  // 執行起來和原本一樣（資料檔裡缺 completedAt 的舊紀錄仍會用現在時間）
  const defaults: LocalHistory = {
    title: '',
    majorTaskTitle: '',
    indicatorId: 'growth',
    type: 'daily',
    completedAt: new Date().toISOString(),
  };
  const [localItem, setLocalItem] = useState<LocalHistory>({
    ...defaults,
    ...editingTaskHistory
  });
  const isNew = !editingTaskHistory.id;
  // 補登時可以選「對應的任務」：選了的話，那個任務的完成次數會加 1（Q18）
  const linkable = isNew ? linkableHistoryTasks(data) : [];
  const linked = isNew && !!localItem.taskId;

  const handleLinkChange = (taskId: string) => {
    const option = linkable.find(o => o.task.id === taskId);
    if (!option) {
      const { taskId: _unlinked, ...rest } = localItem;
      setLocalItem(rest);
      return;
    }
    setLocalItem({ ...localItem, ...historyFieldsFromTask(option.task, option.planTitle) });
  };

  const handleSave = () => {
    if (!localItem.title.trim()) {
      alert('請輸入任務名稱');
      return;
    }
    updateData(prev => {
      if (isNew) {
        // 補登不發抽卡券，所以記成 0 張：之後撤銷或刪除任務時，才不會扣到一張沒拿到的券
        const newRecord = { ...localItem, id: crypto.randomUUID(), rewardTickets: 0 };
        return { ...prev, ...addHistoryRecord(prev, newRecord) };
      } else {
        // 不是補登時（isNew 為 false），editingTaskHistory 一定有 id，localItem 也帶著它，所以是完整的紀錄
        const edited = localItem as TaskHistoryRecord;
        return { ...prev, taskHistory: prev.taskHistory.map(h => h.id === localItem.id ? edited : h) };
      }
    });
    setEditingTaskHistory(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-sky-950/20 backdrop-blur-sm p-4 animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/30 backdrop-blur-[40px] w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar rounded-[48px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.4)] border border-white/20 overflow-hidden relative"
      >
        <div className="p-8 border-b border-white/20 flex justify-between items-center bg-white/10 relative z-10">
          <h3 className="font-black text-2xl flex items-center gap-3 text-sky-900 drop-shadow-sm">
            <RotateCw className="w-7 h-7 text-sky-500" /> {isNew ? '任務紀錄補登' : '編輯任務紀錄'}
          </h3>
          <button onClick={() => setEditingTaskHistory(null)} title="關閉" aria-label="關閉" className="p-3 hover:bg-white/40 rounded-2xl transition-all hover:scale-110 active:scale-90">
            <X className="w-6 h-6 text-sky-600" />
          </button>
        </div>
        <div className="p-10 space-y-8 relative z-10">
          {isNew && (
            <div>
              <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">對應的任務</label>
              <select
                className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer"
                value={localItem.taskId || ''}
                onChange={e => handleLinkChange(e.target.value)}
              >
                <option value="">不對應任何任務（只記一筆紀錄）</option>
                {linkable.map(({ task, planTitle, archived }) => (
                  <option key={task.id} value={task.id}>
                    {task.title || '（未命名任務）'}（{planTitle}）{archived ? (isStoppedTask(task) ? '・已停止' : '・計畫已完成') : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] font-bold text-sky-500 mt-2 ml-1 leading-relaxed">
                {linked
                  ? '這個任務的完成次數會加 1，成就和維度的進度也會跟著增加。補登不會發抽卡券。'
                  : '只列出每日、每週、隨時挑戰任務（只有這些任務有完成次數）。不選的話，任何任務的完成次數都不會變。'}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest">維度</label>
              <select 
                className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" 
                value={localItem.indicatorId} 
                disabled={linked}
                // 選項只有 INDICATORS 的 id
                onChange={e => setLocalItem({ ...localItem, indicatorId: e.target.value as IndicatorId })}
              >
                {INDICATORS.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest">類型</label>
              <select 
                className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 border border-white/60 focus:bg-white/60 outline-none appearance-none cursor-pointer" 
                value={localItem.type} 
                disabled={linked}
                // 選項只有下面四種任務類型
                onChange={e => setLocalItem({ ...localItem, type: e.target.value as TaskType })}
              >
                <option value="daily">每日任務</option>
                <option value="weekly">每週任務</option>
                <option value="precise">一次性任務</option>
                <option value="infinite">隨時挑戰</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">任務名稱</label>
            <input 
              className="w-full bg-white/40 p-5 rounded-2xl text-lg font-black outline-none border border-white/60 focus:bg-white/60 text-sky-900 transition-all placeholder:text-sky-300" 
              value={localItem.title} 
              disabled={linked}
              onChange={e => setLocalItem({ ...localItem, title: e.target.value })} 
              placeholder="輸入任務名稱" 
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">所屬計畫</label>
            <input 
              className="w-full bg-white/40 p-5 rounded-2xl text-lg font-black outline-none border border-white/60 focus:bg-white/60 text-sky-900 transition-all placeholder:text-sky-300" 
              value={localItem.majorTaskTitle} 
              disabled={linked}
              onChange={e => setLocalItem({ ...localItem, majorTaskTitle: e.target.value })} 
              placeholder="輸入計畫名稱" 
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
            <span className="relative flex items-center justify-center gap-3 text-xl tracking-[0.2em]"><CheckCircle2 className="w-7 h-7" /> 儲存紀錄</span>
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default TaskHistoryEditor;