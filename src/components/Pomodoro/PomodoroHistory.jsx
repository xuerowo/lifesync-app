import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Trash2, Eye, Calendar, Clock, Timer, CheckCircle2, Zap, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { ITEMS_PER_PAGE } from '../../constants/index.jsx';
import { formatFlowTime, calculatePomodoroStats } from '../../utils';
import PomodoroSummary from './PomodoroSummary';

const PomodoroHistory = () => {
  const { data, updateData, deletePomodoroRecord } = useAppData();
  const [viewingStats, setViewingStats] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);

  const formatDate = (isoStr) => {
    const d = new Date(isoStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatTime = (isoStr) => {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="mt-12 space-y-6 animate-in slide-up">
      <div className="flex items-center gap-5 px-2">
        <div className="w-12 h-12 rounded-2xl bg-white/40 backdrop-blur-2xl border border-white/60 flex items-center justify-center shadow-xl shadow-sky-100/50 text-sky-500">
          <History className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-black text-sky-900">專注歷史</h3>
          <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Focus History</p>
        </div>
      </div>

      <div className="bg-white/40 backdrop-blur-md rounded-[40px] border border-white shadow-xl overflow-hidden flex flex-col">
        {selectedIds.length > 0 && (
          <div className="bg-rose-50/80 p-4 flex justify-between items-center border-b border-rose-100 animate-in slide-down">
            <span className="text-xs font-black text-rose-600 ml-8">已選擇 {selectedIds.length} 筆紀錄</span>
            <div className="flex gap-2 mr-4">
              <button onClick={() => setSelectedIds([])} className="px-4 py-2 text-[10px] font-black text-rose-400 hover:bg-rose-100 rounded-xl transition-colors">取消選擇</button>
              <button onClick={() => { if (confirm(`確定要刪除選中的 ${selectedIds.length} 筆紀錄嗎？`)) { updateData(prev => ({ ...prev, pomodoroHistory: prev.pomodoroHistory.filter(h => !selectedIds.includes(h.id)) })); setSelectedIds([]); } }} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black rounded-xl shadow-sm transition-colors flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> 批量刪除</button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-separate border-spacing-y-2 px-8">
            <thead>
              <tr className="text-sky-400">
                <th className="px-4 py-2 w-10">
                  <label className="relative flex items-center justify-center cursor-pointer group">
                    <input type="checkbox" className="peer sr-only" checked={selectedIds.length > 0 && selectedIds.length === data.pomodoroHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).length} onChange={(e) => { if (e.target.checked) { const currentIds = data.pomodoroHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(h => h.id); setSelectedIds(currentIds); } else { setSelectedIds([]); } }} />
                    <div className="w-5 h-5 rounded-lg border-2 border-sky-100 bg-white peer-checked:bg-sky-500 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm group-hover:border-sky-300"><CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" /></div>
                  </label>
                </th>
                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest">時間內容</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-center">專注統計</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {data.pomodoroHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((record) => {
                  const { focusDuration: calcFocus, flowDuration: calcFlow } = calculatePomodoroStats(record.timeline);
                  return (
                  <motion.tr
                    key={record.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`group/row transition-all duration-300 ${selectedIds.includes(record.id) ? 'translate-x-1' : ''}`}
                  >
                    <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm rounded-l-3xl border-y border-l transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedIds.includes(record.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                      <label className="relative flex items-center justify-center cursor-pointer group">
                        <input type="checkbox" className="peer sr-only" checked={selectedIds.includes(record.id)} onChange={(e) => { if (e.target.checked) { setSelectedIds(prev => [...prev, record.id]); } else { setSelectedIds(prev => prev.filter(id => id !== record.id)); } }} />
                        <div className="w-5 h-5 rounded-lg border-2 border-sky-100 bg-white peer-checked:bg-sky-500 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm group-hover:border-sky-300"><CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" /></div>
                      </label>
                    </td>
                    <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedIds.includes(record.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center text-sky-400 flex-shrink-0 border border-sky-100 group-hover/row:bg-sky-100 transition-colors">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-black text-sky-800">{formatDate(record.startTime)}</span>
                            <span className="text-[9px] font-bold text-sky-300">{formatTime(record.startTime)}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {record.tasks.length > 0 ? (
                              record.tasks.map((t, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded-lg text-[9px] font-black border transition-all ${
                                    t.isCompleted
                                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                      : 'bg-slate-50 text-slate-400 border-slate-100 opacity-60'
                                  }`}
                                >
                                  {t.title}
                                  {t.type === 'infinite' && t.sessionCount > 0 && (
                                    <span className="ml-1 opacity-70">×{t.sessionCount}</span>
                                  )}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs font-bold text-sky-900/40 italic">心流專注時光</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedIds.includes(record.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                      <div className="flex items-center justify-center gap-8">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-sky-100 rounded-lg text-sky-600">
                            <Timer className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">總耗時</span>
                            <span className="text-[11px] font-black text-sky-800 leading-none font-mono">{Math.floor(record.totalDuration / 60)}m</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">純專注</span>
                            <span className="text-[11px] font-black text-indigo-800 leading-none font-mono">
                              {formatFlowTime(Math.round((calcFocus || 0) + (calcFlow || 0)))}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">任務</span>
                            <span className="text-[11px] font-black text-emerald-700 leading-none">{record.tasks.filter(t => t.isCompleted).length}/{record.tasks.length}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm rounded-r-3xl border-y border-r transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${selectedIds.includes(record.id) ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-all duration-300 translate-x-2 group-hover/row:translate-x-0">
                        <button
                          onClick={() => setViewingStats(record)}
                          className="p-2 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-all"
                          title="查看詳情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if(confirm('確定要刪除此紀錄嗎？')) deletePomodoroRecord(record.id) }}
                          className="p-2 text-sky-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="刪除紀錄"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {data.pomodoroHistory.length > ITEMS_PER_PAGE && (
          <div className="px-8 py-6 flex justify-between items-center bg-sky-50/30 backdrop-blur-md border-t border-white/60">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">
                顯示 {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, data.pomodoroHistory.length)} 筆 / 共 {data.pomodoroHistory.length} 筆
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2.5 rounded-2xl bg-white/60 hover:bg-white disabled:opacity-30 text-sky-600 shadow-sm border border-white transition-all hover:-translate-x-1 active:scale-90"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 px-4 py-2 bg-white/40 rounded-2xl border border-white/60 shadow-inner">
                <span className="text-sm font-black text-sky-800">{currentPage}</span>
                <span className="text-xs font-bold text-sky-300">/</span>
                <span className="text-xs font-bold text-sky-400">{Math.ceil(data.pomodoroHistory.length / ITEMS_PER_PAGE)}</span>
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(data.pomodoroHistory.length / ITEMS_PER_PAGE), p + 1))}
                disabled={currentPage >= Math.ceil(data.pomodoroHistory.length / ITEMS_PER_PAGE)}
                className="p-2.5 rounded-2xl bg-white/60 hover:bg-white disabled:opacity-30 text-sky-600 shadow-sm border border-white transition-all hover:translate-x-1 active:scale-90"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {data.pomodoroHistory.length === 0 && (
          <div className="py-12 text-center bg-white/20 rounded-[32px] border-2 border-dashed border-white/60">
            <History className="w-12 h-12 text-sky-100 mx-auto mb-4" />
            <p className="text-sky-300 font-bold">尚無專注歷史紀錄</p>
          </div>
        )}
      </div>

      {viewingStats && (
        <PomodoroSummary
          stats={viewingStats}
          onClose={() => setViewingStats(null)}
        />
      )}
    </div>
  );
};

export default PomodoroHistory;