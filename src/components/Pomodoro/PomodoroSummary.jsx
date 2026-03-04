import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Trophy, Clock, CheckCircle2, Zap, Timer, X, Calendar, ArrowRight, Sparkles, Pause, Play, Coffee, Flag, Target } from 'lucide-react';
import { formatFlowTime, calculatePomodoroStats } from '../../utils';

const PomodoroSummary = ({ stats, onConfirm, onClose }) => {
  if (!stats) return null;

  const {
    startTime,
    endTime,
    totalDuration,
    focusDuration,
    flowDuration,
    breakDuration,
    completedCycles,
    timeline,
    tasks
  } = stats;

  const formatTimeStr = (isoStr) => {
    const d = new Date(isoStr);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? '下午' : '上午';
    const displayH = h % 12 || 12;
    return `${ampm} ${displayH}:${m.toString().padStart(2, '0')}`;
  };

  const { focusDuration: calcFocus, flowDuration: calcFlow, segments: statsSegments } = useMemo(() => {
    return calculatePomodoroStats(timeline);
  }, [timeline]);

  const segments = useMemo(() => {
    return statsSegments.map(seg => {
      let color = 'bg-slate-200';
      if (seg.isPaused) {
        color = 'bg-slate-300 opacity-50 stripe-bg';
      } else {
        if (seg.mode === 'focus') color = 'bg-sky-400';
        else if (seg.mode === 'flow') color = 'bg-indigo-400';
        else if (seg.mode === 'break') color = 'bg-emerald-400';
      }
      return {
        width: (seg.duration / totalDuration) * 100,
        color,
        isPaused: seg.isPaused
      };
    });
  }, [statsSegments, totalDuration]);

  const taskMarkers = useMemo(() => {
    return timeline
      .filter(e => e.type === 'task_complete')
      .map(e => ({
        ...e,
        left: ((new Date(e.time) - new Date(startTime)) / (totalDuration * 1000)) * 100
      }));
  }, [timeline, startTime, totalDuration]);

  return createPortal(
    <div style={{ zIndex: 9999 }} className="fixed inset-0 flex items-center justify-center p-4">
      {/* 全域遮罩層 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-sky-950/60 backdrop-blur-md"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-2xl w-full max-w-2xl rounded-[48px] shadow-2xl border border-white/40 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-sky-100 flex justify-between items-center bg-gradient-to-r from-sky-500/5 to-indigo-500/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-200">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-sky-900">專注結算</h2>
              <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Focus Session Summary</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-sky-50 rounded-full text-sky-400 hover:text-sky-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-sky-50/50 p-6 rounded-[32px] border border-sky-100 text-center">
              <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest block mb-2">總耗時</span>
              <p className="text-3xl font-black text-sky-800 font-mono">{Math.floor(totalDuration / 60)}<span className="text-sm ml-1 font-sans">m</span></p>
            </div>
            <div className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100 text-center">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">純專注</span>
              <p className="text-3xl font-black text-indigo-800 font-mono">
                {formatFlowTime(Math.round((calcFocus || 0) + (calcFlow || 0)))}
              </p>
            </div>
            <div className="bg-emerald-50/50 p-6 rounded-[32px] border border-emerald-100 text-center">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-2">完成任務</span>
              <p className="text-3xl font-black text-sky-800 font-mono">{tasks.filter(t => t.isCompleted).length}</p>
            </div>
          </div>

          {/* Timeline Chart */}
          <div className="space-y-4">
            <div className="flex justify-between items-end px-1">
              <h3 className="font-black text-sky-900 flex items-center gap-2">
                <Timer className="w-5 h-5 text-sky-500" /> 時間分配
              </h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-sky-400" />
                  <span className="text-[10px] font-bold text-slate-500">專注</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-[10px] font-bold text-slate-500">心流</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-bold text-slate-500">休息</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-300" />
                  <span className="text-[10px] font-bold text-slate-500">暫停</span>
                </div>
              </div>
            </div>

            <div className="relative pt-12 pb-10 px-8">
              {/* Main Bar */}
              <div className="h-10 w-full bg-slate-100 rounded-2xl overflow-hidden flex shadow-inner border border-slate-200 relative z-10">
                {segments.map((seg, i) => (
                  <div
                    key={i}
                    style={{ width: `${seg.width}%` }}
                    className={`${seg.color} h-full`}
                  />
                ))}
              </div>

              {/* Unified Bottom Markers (Time Labels + Task Icons) */}
              <div className="absolute top-0 left-8 right-8 h-full pointer-events-none">
                {/* Time Labels */}
                {[
                  { time: startTime, type: 'edge' },
                  ...timeline.filter((e, idx) => idx > 0 && ['focus_start', 'flow_start', 'break_start', 'pause_start', 'pause_end'].includes(e.type)),
                  { time: endTime, type: 'edge' }
                ].map((e, i) => {
                  const left = e.type === 'edge' && i === 0 ? 0 :
                               e.type === 'edge' ? 100 :
                               ((new Date(e.time) - new Date(startTime)) / (totalDuration * 1000)) * 100;
                  
                  if (left < 0 || left > 100) return null;

                  const isPause = e.type === 'pause_start';
                  const isResume = e.type === 'pause_end';
                  const isFocus = e.type === 'focus_start';
                  const isFlow = e.type === 'flow_start';
                  const isBreak = e.type === 'break_start';
                  const isEdge = e.type === 'edge';
                  
                  return (
                    <div
                      key={`time-${i}`}
                      className="absolute top-12 flex flex-col items-center -translate-x-1/2 transition-all duration-300 hover:z-[100] group/time pointer-events-auto"
                      style={{ left: `${left}%` }}
                    >
                      <div className={`w-px h-10 transition-colors ${
                        isEdge ? 'bg-slate-300' :
                        (isPause || isResume) ? 'bg-slate-400/60 border-dotted border-l' :
                        'bg-slate-300/40 border-dashed border-l'
                      } group-hover/time:bg-sky-400`} />
                      
                      <div className={`flex items-center gap-1 px-1.5 h-5 rounded-lg border shadow-sm z-20 transition-all group-hover/time:scale-110 ${
                        isPause ? 'bg-rose-50 border-rose-200 group-hover/time:bg-rose-100' :
                        isResume ? 'bg-blue-50 border-sky-200 group-hover/time:bg-blue-100' :
                        isFocus ? 'bg-sky-50 border-sky-200 group-hover/time:bg-sky-100' :
                        isFlow ? 'bg-indigo-50 border-indigo-200 group-hover/time:bg-indigo-100' :
                        isBreak ? 'bg-emerald-50 border-emerald-200 group-hover/time:bg-emerald-100' :
                        'bg-white/30 backdrop-blur-md border-white/40 group-hover/time:bg-white/60'
                      }`}>
                        {isPause && <Pause className="w-2 h-2 text-rose-500" />}
                        {isResume && <Play className="w-2 h-2 text-blue-500 fill-current" />}
                        {isFocus && <Target className="w-2 h-2 text-sky-500" />}
                        {isFlow && <Sparkles className="w-2 h-2 text-indigo-500" />}
                        {isBreak && <Coffee className="w-2 h-2 text-emerald-500" />}
                        {isEdge && (i === 0 ? <Flag className="w-2 h-2 text-slate-400" /> : <CheckCircle2 className="w-2 h-2 text-slate-400" />)}
                        
                        <span className={`text-[9px] font-black whitespace-nowrap leading-none ${
                          isPause ? 'text-rose-600' :
                          isResume ? 'text-blue-600' :
                          isFocus ? 'text-sky-600' :
                          isFlow ? 'text-indigo-600' :
                          isBreak ? 'text-emerald-600' :
                          'text-slate-600 group-hover/time:text-sky-700'
                        }`}>{formatTimeStr(e.time)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Task Markers: Synchronized Hover System */}
                {taskMarkers.map((m, i) => (
                  <div
                    key={`task-${i}`}
                    className="absolute top-0 bottom-0 pointer-events-none group/task transition-all duration-300 hover:z-[100]"
                    style={{ left: `${m.left}%` }}
                  >
                    {/* 1. Info Box Above Bar */}
                    <div className="absolute top-[44px] flex flex-col items-center -translate-x-1/2 -translate-y-full pointer-events-auto">
                      <div className="bg-emerald-500/20 backdrop-blur-xl px-2 py-1 rounded-xl shadow-xl border border-white/40 flex flex-col items-center min-w-[70px] transition-all group-hover/task:scale-110 group-hover/task:bg-emerald-500/40 group-hover/task:border-emerald-300">
                        <p className="text-[9px] font-black text-emerald-900 whitespace-nowrap mb-0.5 group-hover/task:text-emerald-950">{m.taskTitle}</p>
                        <p className="text-[8px] font-black text-emerald-800 whitespace-nowrap opacity-70 group-hover/task:opacity-100">{formatTimeStr(m.time)}</p>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-emerald-500/20 group-hover/task:border-t-emerald-500/40" />
                      </div>
                    </div>

                    {/* 2. Connection Line (Through the bar) - Dashed */}
                    <div className="absolute top-[44px] h-10 w-px -translate-x-1/2 border-l border-dashed border-emerald-400/40 group-hover/task:border-emerald-500/80 transition-colors z-0" />

                    {/* 3. Check Icon Below Bar (Aligned with time labels) */}
                    <div className="absolute top-12 flex flex-col items-center -translate-x-1/2 pointer-events-auto">
                      <div className="w-px h-10 border-l border-dashed border-emerald-400/40 group-hover/task:border-emerald-500 transition-colors" />
                      <div className="mt-0.5 bg-emerald-500 text-white p-1 rounded-full shadow-lg z-20 border-2 border-white transition-all group-hover/task:scale-125 group-hover/task:shadow-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Task List */}
          <div className="space-y-4 pt-0">
            <h3 className="font-black text-sky-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> 任務清單
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {tasks.map(task => (
                <div key={task.id} className={`flex items-center gap-3 p-4 rounded-2xl border ${task.isCompleted ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50/50 border-slate-100 opacity-60'}`}>
                  {task.isCompleted ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-200" />}
                  <span className={`font-bold text-sm ${task.isCompleted ? 'text-emerald-900' : 'text-slate-500'}`}>
                    {task.title}
                    {task.type === 'infinite' && task.sessionCount > 0 && (
                      <span className="ml-2 text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-md border border-emerald-500/20">×{task.sessionCount}</span>
                    )}
                  </span>
                  {task.isCompleted && (
                    <span className="ml-auto text-[10px] font-black text-emerald-400">
                      {formatTimeStr(timeline.filter(e => e.type === 'task_complete' && e.taskId === task.id).pop()?.time)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        {onConfirm && (
          <div className="p-8 bg-white border-t border-sky-50 flex gap-4 relative z-10">
            <button
              onClick={onConfirm}
              className="flex-grow py-5 bg-sky-500 hover:bg-sky-600 text-white rounded-[24px] font-black text-lg shadow-xl shadow-sky-200 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
            >
              下一步 <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  );
};

const style = document.createElement('style');
style.textContent = `
  .stripe-bg {
    background-image: linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent);
    background-size: 10px 10px;
  }
`;
document.head.appendChild(style);

export default PomodoroSummary;