import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Clock, Layers, Plus, Edit3 } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { ITEMS_PER_PAGE, INDICATORS } from '../../constants/index.jsx';
import { formatTaskTime } from '../../utils';

const TasksHistory = ({ setEditingTaskHistory }) => {
  const { data, updateData } = useAppData();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);

  // 取得所有任務完成紀錄並按時間排序
  const historyTasks = [...data.taskHistory].sort((a, b) =>
    new Date(b.completedAt) - new Date(a.completedAt)
  );

  const paginatedTasks = historyTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleDelete = (id) => {
    if (confirm('確定要永久刪除此項任務紀錄嗎？')) {
      updateData(prev => ({
        ...prev,
        taskHistory: prev.taskHistory.filter(t => t.id !== id)
      }));
    }
  };

  const handleBulkDelete = () => {
    if (confirm(`確定要刪除選中的 ${selectedIds.length} 筆任務紀錄嗎？`)) {
      updateData(prev => ({
        ...prev,
        taskHistory: prev.taskHistory.filter(t => !selectedIds.includes(t.id))
      }));
      setSelectedIds([]);
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(paginatedTasks.map(t => t.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="mt-12 space-y-6 animate-in slide-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-white/40 backdrop-blur-2xl border border-white/60 flex items-center justify-center shadow-xl shadow-sky-100/50 text-sky-500">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black text-sky-900">任務歷史</h3>
            <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Task Completion History</p>
          </div>
        </div>
        <button
          onClick={() => setEditingTaskHistory({ title: '', majorTaskTitle: '手動補登', indicatorId: 'learning', type: 'daily', completedAt: new Date().toISOString() })}
          className="group relative px-6 py-3 bg-sky-500/5 backdrop-blur-md text-sky-600 text-[11px] font-black rounded-2xl transition-all shadow-sm hover:bg-sky-500/10 hover:!translate-y-[-6px] hover:scale-105 active:scale-95 flex items-center gap-2 border border-sky-500/20 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
          <span className="relative flex items-center gap-2">
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
            手動補登紀錄
          </span>
        </button>
      </div>

      <div className="bg-white/40 backdrop-blur-md rounded-[40px] border border-white shadow-xl overflow-hidden flex flex-col">
        {selectedIds.length > 0 && (
          <div className="bg-rose-50/80 p-4 flex justify-between items-center border-b border-rose-100 animate-in slide-down">
            <span className="text-xs font-black text-rose-600 ml-8">已選擇 {selectedIds.length} 筆紀錄</span>
            <div className="flex gap-2 mr-4">
              <button onClick={() => setSelectedIds([])} className="px-4 py-2 text-[10px] font-black text-rose-400 hover:bg-rose-100 rounded-xl transition-colors">取消選擇</button>
              <button onClick={handleBulkDelete} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black rounded-xl shadow-sm transition-colors flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> 批量刪除</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-separate border-spacing-y-2 px-8">
            <thead>
              <tr className="text-sky-400">
                <th className="px-4 py-2 w-10">
                  <label className="relative flex items-center justify-center cursor-pointer group">
                    <input 
                      type="checkbox" 
                      className="peer sr-only" 
                      checked={selectedIds.length > 0 && selectedIds.length === paginatedTasks.length} 
                      onChange={toggleSelectAll} 
                    />
                    <div className="w-5 h-5 rounded-lg border-2 border-sky-100 bg-white peer-checked:bg-sky-500 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm group-hover:border-sky-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" />
                    </div>
                  </label>
                </th>
                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest">完成時間</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest">任務與計畫</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-center">維度</th>
                <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {paginatedTasks.map((task) => {
                  const ind = INDICATORS.find(i => i.id === task.indicatorId);
                  const isSelected = selectedIds.includes(task.id);
                  return (
                    <motion.tr
                      key={task.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`group/row transition-all duration-300 ${isSelected ? 'translate-x-1' : ''}`}
                    >
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm rounded-l-3xl border-y border-l transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${isSelected ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <label className="relative flex items-center justify-center cursor-pointer group">
                          <input 
                            type="checkbox" 
                            className="peer sr-only" 
                            checked={isSelected} 
                            onChange={() => toggleSelect(task.id)} 
                          />
                          <div className="w-5 h-5 rounded-lg border-2 border-sky-100 bg-white peer-checked:bg-sky-500 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm group-hover:border-sky-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" />
                          </div>
                        </label>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${isSelected ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-sky-800">{new Date(task.completedAt || task.createdAt).toLocaleDateString()}</span>
                          <span className="text-[10px] font-bold text-sky-500">{new Date(task.completedAt || task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${isSelected ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 flex-shrink-0 border border-emerald-100 group-hover/row:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-sky-900 line-clamp-1 group-hover/row:text-sky-600 transition-colors">{task.title}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-sky-400" />
                                <span className="text-[9px] font-black text-sky-600 uppercase tracking-tighter">
                                  {task.type === 'daily' ? '每日任務' : task.type === 'weekly' ? '每週任務' : '單次計畫'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-sky-500/5 rounded-md border border-sky-500/10">
                                <span className="text-[8px] font-black text-sky-400 uppercase tracking-widest">計畫：</span>
                                <span className="text-[9px] font-bold text-sky-700 truncate max-w-[120px]">{task.majorTaskTitle}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm border-y transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${isSelected ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${ind?.color} flex items-center justify-center text-white shadow-sm scale-75`}>
                            {ind?.icon}
                          </div>
                          <span className="text-[8px] font-black text-sky-600 uppercase tracking-widest">{ind?.name}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-4 bg-white/50 backdrop-blur-sm rounded-r-3xl border-y border-r transition-all duration-300 group-hover/row:bg-white group-hover/row:shadow-md ${isSelected ? 'border-sky-200 bg-sky-50/50' : 'border-white'}`}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-all duration-300 translate-x-2 group-hover/row:translate-x-0">
                          <button
                            onClick={() => setEditingTaskHistory(task)}
                            className="p-2 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-all"
                            title="編輯紀錄"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            className="p-2 text-sky-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="永久刪除紀錄"
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

        {historyTasks.length > ITEMS_PER_PAGE && (
          <div className="px-8 py-6 flex justify-between items-center bg-sky-50/30 backdrop-blur-md border-t border-white/60">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest">
                顯示 {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, historyTasks.length)} 筆 / 共 {historyTasks.length} 筆
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
                <span className="text-xs font-bold text-sky-400">{Math.ceil(historyTasks.length / ITEMS_PER_PAGE)}</span>
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(historyTasks.length / ITEMS_PER_PAGE), p + 1))} 
                disabled={currentPage >= Math.ceil(historyTasks.length / ITEMS_PER_PAGE)} 
                className="p-2.5 rounded-2xl bg-white/60 hover:bg-white disabled:opacity-30 text-sky-600 shadow-sm border border-white transition-all hover:translate-x-1 active:scale-90"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {historyTasks.length === 0 && (
          <div className="py-20 text-center bg-white/20 rounded-[40px] border-4 border-dashed border-white/60">
            <Layers className="w-16 h-16 text-sky-100 mx-auto mb-6" />
            <p className="text-sky-300 font-black text-xl">尚無任務歷史紀錄</p>
            <p className="text-sky-200 font-bold text-sm mt-2">完成計畫中的任務後，紀錄將會出現在這裡</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksHistory;