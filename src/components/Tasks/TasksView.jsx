import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Zap, CheckCircle2, CalendarDays, Lock, Edit3, Archive, Trash2, Plus, ChevronUp, ChevronDown, Settings2, RotateCcw, GripVertical, Tag, CircleStop
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, verticalListSortingStrategy, sortableKeyboardCoordinates, defaultAnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppData } from '../../contexts/AppDataContext';
import { INDICATORS } from '../../constants/index.tsx';
import { getTodayStr, formatTaskTime, formatDateOnly } from '../../utils/index.ts';
import { RANGE_SEP } from '../../utils/displayFormat.ts';
import {
  completeMajorTaskMessage, deleteMajorTaskMessage, deleteSubTaskMessage, revertCompletionMessage
} from '../../domain/confirmations.ts';
import { applySortOrders, reorderSortOrders, sortBySortOrder } from '../../shared/taskOrder.ts';
import { canStopTask, completionRewardTickets, isStoppedTask } from '../../domain/tasks.ts';

// 可以拖曳換位置的一格。拖曳只從「把手」開始（handleProps 給把手按鈕），點卡片其他地方照常操作。
// 位移用 dnd-kit 的 transform，所以裡面的動畫不要用 framer-motion 的 layout（兩者都改 transform 會互相干擾）。
// animateLayoutChanges：放開後其他卡片也平順滑到新位置，不會瞬間跳過去。
const animateAfterDrop = (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true });
function SortableItem({ id, className, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, animateLayoutChanges: animateAfterDrop });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 40 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

// 拖曳把手：手機上一直看得到；滑鼠移上去會變成可以抓的手勢
function DragHandle({ handleProps, label, className = '' }) {
  return (
    <button
      type="button"
      {...handleProps}
      title={label}
      aria-label={label}
      className={`touch-none cursor-grab active:cursor-grabbing rounded-lg text-sky-400 hover:text-sky-600 hover:bg-white/60 transition-colors ${className}`}
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
}

// 用鍵盤拖曳時，讀螢幕軟體念出來的中文提示（dnd-kit 預設是英文）
function dragAccessibility(getName) {
  const name = (item) => (item ? `「${getName(item.id) || '未命名'}」` : '');
  return {
    screenReaderInstructions: { draggable: '按空白鍵或 Enter 抓起，用方向鍵移動，再按一次空白鍵或 Enter 放下，按 Esc 取消。' },
    announcements: {
      onDragStart: ({ active }) => `已抓起${name(active)}。`,
      onDragOver: ({ active, over }) => (over ? `${name(active)}移到${name(over)}的位置。` : `${name(active)}不在可以放的位置。`),
      onDragEnd: ({ active, over }) => (over ? `${name(active)}已放到${name(over)}的位置。` : `已放下${name(active)}，順序沒有改變。`),
      onDragCancel: ({ active }) => `已取消，${name(active)}回到原位。`,
    },
  };
}

// 滑鼠要拖動一點點才算開始拖（避免點一下就被當成拖曳）；鍵盤可以用空白鍵抓起、方向鍵移動
function useSortSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

const TasksView = ({ setEditingTask, setIsPriorityManagerOpen, onCompleteSubTask }) => {
  const {
    data, updateData, activePriorityTasks, toggleMajorTask, restoreMajorTask,
    completeSubTaskData, revertTaskCompletion, deleteMajorTask, deleteSubTask, stopSubTask, restoreStoppedSubTask
  } = useAppData();
  const [expandedArchived, setExpandedArchived] = useState({});
  const [filterIndicator, setFilterIndicator] = useState('all');

  // 自動追蹤定位計畫
  const majorTaskRefs = useRef({});
  const lastInteractedMajorId = useRef(null);

  useEffect(() => {
    if (lastInteractedMajorId.current && majorTaskRefs.current[lastInteractedMajorId.current]) {
      const element = majorTaskRefs.current[lastInteractedMajorId.current];
      // 延遲一點點執行，等畫面更新完再捲過去
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

  // 會刪資料或扣券的操作，一律先確認；確認文字寫明會刪幾筆紀錄、扣幾張券
  const confirmRevert = (subId, majorTaskId) => {
    if (!confirm(revertCompletionMessage(data, subId))) return;
    if (majorTaskId) lastInteractedMajorId.current = majorTaskId;
    revertTaskCompletion(subId);
  };

  const confirmDeleteSubTask = (subId, majorTaskId) => {
    if (!confirm(deleteSubTaskMessage(data, subId))) return;
    lastInteractedMajorId.current = majorTaskId;
    deleteSubTask(subId);
  };

  // 停止重複任務：不刪紀錄、不扣券，只是不再出現在清單（規則見 domain/tasks.ts）
  const confirmStopSubTask = (sub, majorTaskId) => {
    const name = sub.title?.trim() ? `「${sub.title.trim()}」` : '這個任務';
    if (!confirm(`確定要停止${name}嗎？停止後不會再出現在清單，已完成的紀錄和抽卡券都會保留。`)) return;
    lastInteractedMajorId.current = majorTaskId;
    stopSubTask(sub.id);
  };

  // 恢復停止的任務：只放回清單，不動紀錄和券，所以不用確認
  const handleRestoreStopped = (subId, majorTaskId) => {
    lastInteractedMajorId.current = majorTaskId;
    restoreStoppedSubTask(subId);
  };

  const confirmDeleteMajorTask = (majorTaskId) => {
    if (confirm(deleteMajorTaskMessage(data, majorTaskId))) deleteMajorTask(majorTaskId);
  };

  // 新增計畫：篩選某個維度時就用那個維度，否則用第一個有目標的維度（打開後可以在設定裡改）
  const addPlan = () => {
    if (filterIndicator !== 'all') {
      const goals = data.goals[filterIndicator] || [];
      if (goals.length === 0) {
        const name = INDICATORS.find(i => i.id === filterIndicator)?.name || '這個維度';
        alert(`請先到維度頁幫「${name}」新增至少一個目標`);
        return;
      }
      addMajorTask(filterIndicator, goals[0].id);
      return;
    }
    const ind = INDICATORS.find(i => (data.goals[i.id] || []).length > 0);
    if (!ind) {
      alert('請先到維度頁新增至少一個目標');
      return;
    }
    addMajorTask(ind.id, data.goals[ind.id][0].id);
  };

  // 使用者自己排的順序（見 shared/taskOrder.ts）
  const sensors = useSortSensors();
  const visiblePlans = sortBySortOrder(data.majorTasks)
    .filter(t => filterIndicator === 'all' || t.indicatorId === filterIndicator);
  const visiblePlanIds = visiblePlans.map(t => t.id);
  const planA11y = dragAccessibility(id => data.majorTasks.find(t => t.id === id)?.title);
  const taskA11y = dragAccessibility(id => data.subTasks.find(t => t.id === id)?.title);
  // 現在能做的第一優先任務在哪個計畫：計畫不再自動排到最前面，改用醒目的框和標籤標出來
  const topPriorityPlanId = activePriorityTasks[0]?.majorTaskId;

  // 拖曳不算「操作某個計畫」：清掉待捲動的目標，免得拖完畫面突然捲走
  const handlePlanDragEnd = ({ active, over }) => {
    lastInteractedMajorId.current = null;
    if (!over || active.id === over.id) return;
    updateData(prev => {
      const orders = reorderSortOrders(prev.majorTasks, visiblePlanIds, active.id, over.id);
      return { ...prev, majorTasks: applySortOrders(prev.majorTasks, orders) };
    });
  };

  const handleTaskDragEnd = (planId) => ({ active, over }) => {
    lastInteractedMajorId.current = null;
    if (!over || active.id === over.id) return;
    updateData(prev => {
      const inPlan = prev.subTasks.filter(s => s.majorTaskId === planId);
      const orders = reorderSortOrders(inPlan, null, active.id, over.id);
      return { ...prev, subTasks: applySortOrders(prev.subTasks, orders) };
    });
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
          <div className="flex gap-3">
            <button onClick={addPlan} className="flex-1 sm:flex-none px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-black text-[10px] md:text-xs flex items-center justify-center gap-2 transition-colors shadow-sm">
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> 新增計畫
            </button>
            <button onClick={() => setIsPriorityManagerOpen(true)} className="flex-1 sm:flex-none px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-2xl font-black text-[10px] md:text-xs flex items-center justify-center gap-2 transition-colors shadow-sm">
                <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" /> 管理優先順序
            </button>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePlanDragEnd} accessibility={planA11y}>
      <SortableContext items={visiblePlanIds} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
    {visiblePlans.map(task => {
      const ind = INDICATORS.find(i => i.id === task.indicatorId);
      const subs = sortBySortOrder(data.subTasks.filter(s => s.majorTaskId === task.id));
      const goal = data.goals[task.indicatorId]?.find(g => g.id === task.goalId);
      const isTopPriorityPlan = task.id === topPriorityPlanId;
      return (
        <SortableItem key={task.id} id={task.id}>
        {({ handleProps: planHandleProps, isDragging: planDragging }) => (
        <motion.div
          ref={el => majorTaskRefs.current[task.id] = el}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-white/40 backdrop-blur-2xl rounded-[32px] md:rounded-[48px] p-6 md:p-8 border border-white/60 group transition-shadow relative overflow-hidden h-full ${planDragging ? 'shadow-[0_30px_60px_-10px_rgba(0,0,0,0.2)] ring-2 ring-sky-300' : 'shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_30px_60px_-10px_rgba(0,0,0,0.1)]'} ${isTopPriorityPlan && !planDragging ? 'ring-2 ring-amber-300' : ''}`}
        >
          <div className={`absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-gradient-to-br ${ind?.color} opacity-[0.03] blur-3xl pointer-events-none`} />
          <div className="flex justify-between items-start mb-4 md:mb-6 relative z-10">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <DragHandle handleProps={planHandleProps} label="拖曳調整計畫順序" className="p-2.5 -m-2 -ml-3 md:-ml-4 shrink-0" />
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-gradient-to-br ${ind?.color} flex items-center justify-center text-white shadow-lg shadow-sky-200/50`}>{ind?.icon}</div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 md:px-4 md:py-2 bg-white/60 text-sky-700 rounded-xl md:rounded-2xl border border-white/40 backdrop-blur-md truncate max-w-[120px] md:max-w-none">{goal?.title || '計畫中'}</span>
            </div>
            <button onClick={() => { if (confirm(completeMajorTaskMessage(data, task.id))) toggleMajorTask(task.id); }} title="完成整個計畫" aria-label="完成整個計畫" className="p-2 md:p-2.5 bg-white/60 hover:bg-emerald-50 text-sky-400 hover:text-emerald-500 rounded-xl md:rounded-2xl transition-all hover:scale-110 active:scale-90 border border-white/40 shadow-sm"><CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" /></button>
          </div>
          {isTopPriorityPlan && (
            <span className="relative z-10 inline-flex items-center gap-1 mb-2 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 text-[9px] md:text-[10px] font-black" title="優先順序排第一、現在要先做的任務在這個計畫">
              <Zap className="w-3 h-3" /> 目前優先
            </span>
          )}
          <h3 className="text-xl md:text-2xl font-black text-sky-950 mb-1 md:mb-1.5 break-words tracking-tight relative z-10">{task.title}</h3>
          <p className="text-[9px] md:text-[10px] font-black text-sky-800 mb-4 md:mb-6 flex items-center gap-1.5 md:gap-2 uppercase tracking-[0.1em] bg-sky-100/50 w-fit px-2.5 py-1 rounded-lg border border-sky-200/50 relative z-10"><CalendarDays className="w-3 md:w-3.5 h-3 md:h-3.5" /> {formatDateOnly(task.startDate)}{RANGE_SEP}{formatDateOnly(task.endDate)}</p>
          {/* 新增任務放在清單上面：新的任務會出現在最上面，不用往下捲 */}
          <button onClick={() => addSubTask(task.id)} className="relative z-10 w-full py-2.5 md:py-3 mb-2.5 md:mb-3 bg-white/40 hover:bg-white text-sky-600 rounded-2xl md:rounded-[24px] text-[10px] md:text-[11px] font-black flex items-center justify-center gap-2 border-2 border-dashed border-white hover:border-sky-200 transition-all shadow-sm active:scale-95"><Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> 新增任務</button>
          <div className="space-y-2.5 md:space-y-3 relative z-10">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd(task.id)} accessibility={taskA11y}>
            <SortableContext items={subs.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {subs.map(sub => {
                const today = new Date();
                const currentDay = today.getDay();
                const isWrongDay = sub.type === 'weekly' && !sub.days.includes(currentDay);
                
                // 隨時挑戰不受優先任務限制，也不會被日期鎖住
                const blockingPriority = sub.type !== 'infinite' && activePriorityTasks.length > 0 && activePriorityTasks[0].id !== sub.id
                  ? activePriorityTasks[0] : null;
                const isLocked = sub.type !== 'infinite' && (!!blockingPriority || isWrongDay);
                // 鎖住的原因分開寫：先講要先做哪個優先任務，再講今天不用做
                const lockReason = blockingPriority
                  ? `要先完成優先任務「${blockingPriority.title?.trim() || '未命名任務'}」`
                  : '這個任務今天不用做';
                
                // 隨時挑戰不顯示為「今日已完成」，才能一直重複完成
                const isTodayCompleted = sub.type !== 'infinite' && (sub.type === 'daily' || sub.type === 'weekly') &&
                                         sub.lastCompletedAt &&
                                         sub.lastCompletedAt.startsWith(getTodayStr());

                return (
                <SortableItem key={sub.id} id={sub.id}>
                {({ handleProps: subHandleProps, isDragging: subDragging }) => (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`relative flex items-start gap-1.5 md:gap-2 p-3 md:p-3.5 pl-1 md:pl-1.5 backdrop-blur-md rounded-2xl md:rounded-[24px] border transition-[background-color,border-color,box-shadow,opacity] group/sub ${
                    subDragging ? 'shadow-lg ring-2 ring-sky-300 bg-white' : 'shadow-sm'
                  } ${
                    isLocked ? 'bg-slate-100/50 border-slate-200 opacity-70 grayscale-[0.5]' :
                    isTodayCompleted ? 'bg-emerald-50/40 border-emerald-100/50 opacity-80' :
                    'bg-white/60 border-white hover:border-sky-200 hover:bg-white'
                  }`}
                >
                  {/* 把手、勾選框對齊標題第一行；標題獨佔整行寬度，券數、次數放到下面那一行 */}
                  <DragHandle handleProps={subHandleProps} label="拖曳調整任務順序" className="p-2 -my-1.5 shrink-0" />
                  <div className="relative flex items-center justify-center shrink-0 w-5 h-5 md:w-6 md:h-6 mr-0.5">
                    {isLocked ? (
                      <div className="w-5 h-5 md:w-6 md:h-6 rounded-md md:rounded-lg border-2 border-slate-200 bg-slate-100/50 flex items-center justify-center" title={lockReason} aria-label={lockReason}>
                        <Lock className="w-3 h-3 text-slate-400" />
                      </div>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          checked={isTodayCompleted}
                          onChange={() => {
                            if (isTodayCompleted) {
                              confirmRevert(sub.id, task.id);
                            } else {
                              completeSubTask(sub.id, task.id);
                            }
                          }}
                          title={isTodayCompleted ? '撤銷今天的完成' : '完成'}
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
                  <div className="flex-grow min-w-0 md:pt-0.5">
                    <p className={`text-[13px] md:text-sm font-bold break-words leading-snug transition-colors ${
                      isTodayCompleted ? 'text-emerald-800/60 line-through' : 'text-sky-900'
                    }`}>
                      {sub.isPriority && (
                        <span className={`inline-block align-[1px] mr-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-black leading-none border no-underline ${
                          isLocked ? 'bg-slate-200 text-slate-500 border-slate-300' :
                          isTodayCompleted ? 'bg-emerald-100 text-emerald-600 border-emerald-200' :
                          'bg-amber-100 text-amber-600 border-amber-200'
                        }`} title={`優先順序第 ${sub.priorityOrder} 名`}>
                          P{sub.priorityOrder}
                        </span>
                      )}
                      {sub.title}
                    </p>
                    <div className="flex items-center mt-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="text-[10px] md:text-[11px] font-semibold text-sky-600/90">{formatTaskTime(sub)}</span>
                        {(() => {
                          // 完成一次可以拿幾張抽卡券（任務設定裡的張數）；0 張時淡淡地顯示
                          const reward = completionRewardTickets(sub);
                          return (
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] md:text-[10px] font-black leading-none border ${
                                reward > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                              }`}
                              title={`完成一次可得 ${reward} 張抽卡券`}
                            >
                              <Tag className="w-2.5 h-2.5 md:w-3 md:h-3 fill-current" />+{reward}
                            </span>
                          );
                        })()}
                        {(sub.type === 'daily' || sub.type === 'weekly' || sub.type === 'infinite') && sub.completionCount > 0 && (
                          <>
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[9px] md:text-[10px] font-black leading-none border border-emerald-500/20" title={`已完成 ${sub.completionCount} 次`}>
                              ×{sub.completionCount}
                            </span>
                            <button
                              onClick={() => confirmRevert(sub.id, task.id)}
                              className="p-1 -m-0.5 rounded-md text-rose-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                              title="撤銷最近一次完成"
                              aria-label="撤銷最近一次完成"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 操作按鈕：滑鼠移到任務上才浮出來，掛在任務框右上角的邊線上（不佔寬度，也不會蓋到框裡的文字和「撤銷」按鈕）；
                      用鍵盤移過來時也會出現；沒出現時不能被誤點 */}
                  <div className="absolute -top-3.5 right-3 z-20 flex items-center rounded-xl bg-white shadow-md border border-sky-100 opacity-0 pointer-events-none group-hover/sub:opacity-100 group-hover/sub:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
                        <button onClick={() => { lastInteractedMajorId.current = task.id; setEditingTask({ type: 'sub', item: sub }); }} className="p-1.5 text-sky-500 hover:text-sky-800 hover:bg-sky-50 rounded-lg transition-all" title="編輯任務" aria-label="編輯任務"><Edit3 className="w-3.5 h-3.5" /></button>
                        {canStopTask(sub) && (<button onClick={() => confirmStopSubTask(sub, task.id)} className="p-1.5 text-sky-500 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all" title="停止這個任務" aria-label="停止這個任務"><CircleStop className="w-3.5 h-3.5" /></button>)}
                        <button onClick={() => confirmDeleteSubTask(sub.id, task.id)} className="p-1.5 text-sky-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="刪除任務" aria-label="刪除任務"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </motion.div>
                )}
                </SortableItem>
                );
              })}
            </SortableContext>
            </DndContext>
            {(() => {
              const archivedSubs = data.archivedSubTasks.filter(s => s.majorTaskId === task.id);
              if (archivedSubs.length === 0) return null;
              return (
                <div className="mt-3 md:mt-4">
                  <button
                    onClick={() => setExpandedArchived(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                    className="w-full py-1.5 text-[8px] md:text-[9px] font-black text-sky-600 hover:text-sky-800 flex items-center justify-between px-2"
                  >
                    <span>已結束（{archivedSubs.length}）</span>
                    {expandedArchived[task.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {expandedArchived[task.id] && (
                    <div className="space-y-2 mt-2">
                      {archivedSubs.map(sub => {
                        // 停止的重複任務不是「完成」：不打勾，按鈕是「恢復這個任務」（不動紀錄和券）；
                        // 真的完成的一次性任務照舊打勾，按勾勾撤銷完成
                        const stopped = isStoppedTask(sub);
                        return (
                        <div key={sub.id} className="flex items-center gap-2.5 p-2.5 bg-sky-50/30 rounded-xl md:rounded-2xl border border-sky-50 group/archived">
                          {stopped ? (
                            <button onClick={() => handleRestoreStopped(sub.id, task.id)} title="恢復這個任務" aria-label="恢復這個任務" className="shrink-0 p-0.5 rounded-md text-sky-400 hover:text-sky-600 hover:bg-white transition-colors">
                              <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                          ) : (
                            <input type="checkbox" checked={true} onChange={() => confirmRevert(sub.id, task.id)} title="撤銷完成" aria-label="撤銷完成" className="w-4 h-4 md:w-5 md:h-5 rounded-md md:rounded-lg text-emerald-500 border-sky-100 cursor-pointer" />
                          )}
                          <div className="flex-grow min-w-0">
                            <p className={`text-[11px] md:text-xs font-bold break-words leading-snug ${stopped ? 'text-sky-500' : 'line-through text-sky-400'}`}>{sub.title}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {stopped && (
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 text-[8px] md:text-[9px] font-black leading-none">已停止</span>
                              )}
                              <span className="text-[9px] md:text-[10px] font-semibold text-sky-300">{formatTaskTime(sub)}</span>
                              {canStopTask(sub) && sub.completionCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/5 text-emerald-500/60 text-[8px] md:text-[9px] font-black leading-none" title={`已完成 ${sub.completionCount} 次`}>×{sub.completionCount}</span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => confirmDeleteSubTask(sub.id, task.id)} title="刪除任務" aria-label="刪除任務" className="opacity-0 md:group-hover/archived:opacity-100 focus:opacity-100 p-1 text-sky-100 hover:text-red-400">
                            <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-white/20 flex justify-between relative z-10"><button onClick={() => setEditingTask({ type: 'major', item: task })} className="text-[9px] md:text-[10px] font-black text-sky-600 hover:text-sky-800 flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-white/40 hover:bg-white/80 rounded-lg md:rounded-xl transition-all border border-white/40 shadow-sm"><Settings2 className="w-3 md:w-3.5 h-3 md:h-3.5" /> 編輯</button><button onClick={() => confirmDeleteMajorTask(task.id)} title="刪除計畫" className="text-[9px] md:text-[10px] font-black text-sky-400 hover:text-red-500 flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-white/40 hover:bg-red-50 rounded-lg md:rounded-xl transition-all border border-white/40 shadow-sm" aria-label="刪除計畫"><Trash2 className="w-3 md:w-3.5 h-3 md:h-3.5" /></button></div>
        </motion.div>
        )}
        </SortableItem>
      );
    })}
    {/* 沒有計畫時才顯示：直接選維度開始（平常用上方的「新增計畫」，不用捲到最下面） */}
    {visiblePlans.length === 0 && (
    <div className="bg-white/20 border-4 border-dashed border-white/60 rounded-3xl md:rounded-[40px] p-6 md:p-10 flex flex-col items-center justify-center gap-4 md:gap-6 min-h-[300px] md:min-h-[350px]"><div className="flex gap-2.5 md:gap-4">{INDICATORS.filter(ind => filterIndicator === 'all' || ind.id === filterIndicator).map(ind => (<button key={ind.id} title={`新增${ind.name}計畫`} onClick={() => { const firstGoal = data.goals[ind.id]?.[0]; if (firstGoal) addMajorTask(ind.id, firstGoal.id); else alert(`請先到維度頁幫「${ind.name}」新增至少一個目標`); }} className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br ${ind.color} text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all`}>{ind.icon}</button>))}</div><div className="text-center"><p className="font-black text-[9px] md:text-[10px] text-sky-400 uppercase tracking-widest mb-1">展開新旅程</p><p className="text-[8px] md:text-[9px] text-sky-300 italic">選擇維度開始一個計畫</p></div></div>
    )}
  </div>
  </SortableContext>
  </DndContext>
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
                  <button onClick={() => restoreMajorTask(task.id)} className="p-1.5 md:p-2 text-emerald-300 hover:text-sky-500 transition-colors" title="恢復計畫" aria-label="恢復計畫"><RotateCcw className="w-4 h-4 md:w-5 md:h-5" /></button>
                  <button onClick={() => confirmDeleteMajorTask(task.id)} className="p-1.5 md:p-2 text-emerald-200 hover:text-red-400 transition-colors" title="刪除計畫" aria-label="刪除計畫"><Trash2 className="w-4 h-4 md:w-5 md:h-5" /></button>
                </div>
              </div>
              <h3 className="text-lg md:text-xl font-black text-emerald-800 mb-1 line-through break-words">{task.title}</h3>
              <p className="text-[8px] md:text-[9px] font-bold text-emerald-400 mb-3 md:mb-4 flex items-center gap-1.5 md:gap-2 uppercase tracking-tighter"><CalendarDays className="w-3 md:w-3.5 h-3 md:h-3.5" /> {formatDateOnly(task.startDate)}{RANGE_SEP}{formatDateOnly(task.endDate)}</p>
              
              {allSubs.length > 0 && (
                <div className="mt-3 md:mt-4">
                  <button
                    onClick={() => setExpandedArchived(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                    className="w-full py-1.5 md:py-2 text-[8px] md:text-[9px] font-black text-emerald-400 hover:text-emerald-600 flex items-center justify-between px-2 bg-emerald-100/30 rounded-xl transition-colors"
                  >
                    <span>查看任務（{allSubs.length}）</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  
                  {isExpanded && (
                    <div className="space-y-2 mt-2 md:mt-3 animate-in slide-down">
                      {allSubs.map(sub => {
                        // 停止的任務（在「已結束」區、不是跟著計畫收起來的重複任務）不是完成，不打勾也不能撤銷
                        const stopped = !activeSubs.includes(sub) && isStoppedTask(sub);
                        const done = !!sub.completed && !stopped;
                        return (
                        <div key={sub.id} className="flex items-center gap-2.5 p-2.5 md:p-3 bg-white/40 rounded-xl md:rounded-2xl border border-emerald-100/50">
                          {/* 顯示真實的完成狀態：已撤銷（回到進行中）的任務、跟著計畫一起收起來的任務、停止的任務不打勾，
                              也不能撤銷，避免一直重複扣券 */}
                          <input
                            type="checkbox"
                            checked={done}
                            disabled={!done}
                            onChange={() => { if (done) confirmRevert(sub.id); }}
                            title={done ? '撤銷完成'
                              : stopped ? '已停止；恢復計畫後，可以在計畫的「已結束」區恢復這個任務'
                              : sub.archivedWithPlanId ? '沒有完成，跟著計畫一起收起來；按「恢復計畫」會回到進行中'
                              : '已撤銷完成；恢復計畫後可以在計畫裡重新完成'}
                            className={`w-4 h-4 md:w-5 md:h-5 rounded-md md:rounded-lg text-emerald-500 border-sky-100 ${done ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                          />
                          <div className="flex-grow min-w-0">
                            <div className="flex items-start justify-between gap-1 mb-0.5">
                              <p className={`text-[11px] md:text-xs font-bold break-words leading-snug ${done ? 'line-through text-emerald-300' : 'text-emerald-700'}`}>
                                {sub.title}
                              </p>
                              <div className="flex-shrink-0 flex items-center gap-1">
                                {stopped && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[7px] md:text-[8px] font-black leading-none">已停止</span>
                                )}
                                {canStopTask(sub) && sub.completionCount > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-500 text-[7px] md:text-[8px] font-black leading-none">完成 {sub.completionCount} 次</span>
                                )}
                              </div>
                            </div>
                            <p className="text-[7px] md:text-[8px] font-black text-emerald-300/70">{formatTaskTime(sub)}</p>
                          </div>
                          {done && <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-400 shrink-0" />}
                        </div>
                        );
                      })}
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