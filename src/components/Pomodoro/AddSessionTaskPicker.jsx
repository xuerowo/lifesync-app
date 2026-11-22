import React, { useEffect, useEffectEvent, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Target, X } from 'lucide-react';
import { formatTaskTime } from '../../utils';

/**
 * 專注計時進行中，按「這次要做的任務」旁的「＋」打開的選單：從可選的成長任務中加入。
 * 可選的任務和開始前的選擇清單是同一份規則（domain/pomodoro.js 的 pomodoroCandidateTasks），
 * 已經在這次清單裡的不再列出。加入後選單不關，方便一次加好幾個；Esc、背景、X、「完成」都能關閉。
 * 這裡只改這次的任務清單，不碰計時。
 */
const AddSessionTaskPicker = ({ tasks, onAdd, onClose }) => {
  const closeRef = useRef(null);

  // 計時器每秒都會讓畫面重繪，onClose 每次都是新的函式；用 useEffectEvent 讓下面的 effect 只在打開時跑一次，
  // 否則鍵盤焦點會每秒被拉回關閉鈕
  const handleKeyDown = useEffectEvent((e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  });

  useEffect(() => {
    // 打開時把鍵盤焦點放到關閉鈕，Esc 隨時可以關掉
    closeRef.current?.focus();
    const onKeyDown = (e) => handleKeyDown(e);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[450] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="add-session-task-title">
      <div className="absolute inset-0 bg-sky-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-white/60 flex flex-col max-h-[80vh] animate-in fade-in">
        <div className="flex items-center justify-between gap-3 p-5 md:p-6 border-b border-sky-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-sky-500 text-white flex items-center justify-center shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="add-session-task-title" className="text-lg font-black text-sky-900">加入任務</h3>
              <p className="text-[10px] md:text-xs font-bold text-sky-600">計時不會中斷</p>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            title="關閉"
            aria-label="關閉"
            className="p-2 rounded-full text-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto custom-scrollbar space-y-2">
          {tasks.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-sm font-bold text-sky-700">沒有可以加入的成長任務</p>
              <p className="text-[10px] md:text-xs font-bold text-sky-500 mt-2 leading-relaxed">
                成長任務都已經在這次的清單裡，或今天已經完成。<br />
                要新的任務，可以先到「計畫清單」新增，這裡會照常計時。
              </p>
            </div>
          ) : (
            tasks.map(task => {
              const timeText = formatTaskTime(task);
              return (
                <button
                  key={task.id}
                  onClick={() => onAdd(task)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/70 border border-sky-50 hover:border-sky-200 hover:bg-sky-50/60 text-left transition-all group"
                >
                  <span className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                    <Plus className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-grow">
                    <span className="block text-sm font-bold text-slate-700 break-words line-clamp-2">{task.title}</span>
                    {timeText && <span className="block text-[10px] font-bold text-sky-500 mt-0.5">{timeText}</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-4 md:p-5 border-t border-sky-50">
          <button
            onClick={onClose}
            className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-black transition-all active:scale-95"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddSessionTaskPicker;
