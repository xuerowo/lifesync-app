import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';

const PriorityManager = ({ isOpen, onClose }) => {
  const { data, updateData } = useAppData();
  
  if (!isOpen) return null;
  
  const priorityTasks = data.subTasks.filter(t => t.isPriority).sort((a, b) => a.priorityOrder - b.priorityOrder);

  const handleMove = (taskId, direction) => {
      const currentIndex = priorityTasks.findIndex(t => t.id === taskId);
      if (currentIndex === -1) return;
      
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= priorityTasks.length) return;
      
      const newOrderedList = [...priorityTasks];
      [newOrderedList[currentIndex], newOrderedList[targetIndex]] = [newOrderedList[targetIndex], newOrderedList[currentIndex]];
      
      updateData(prev => ({
          ...prev,
          subTasks: prev.subTasks.map(t => {
              const foundIndex = newOrderedList.findIndex(nt => nt.id === t.id);
              if (foundIndex !== -1) {
                  return { ...t, priorityOrder: foundIndex + 1 };
              }
              return t;
          })
      }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-sky-950/20 backdrop-blur-sm p-4 animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/80 backdrop-blur-xl w-full max-w-lg rounded-[48px] shadow-2xl border border-white/40 overflow-hidden flex flex-col max-h-[80vh]"
      >
           <div className="p-6 border-b border-sky-100 flex justify-between items-center">
              <h3 className="font-black text-xl text-sky-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" /> 優先級管理
              </h3>
              <button onClick={onClose} className="p-2 hover:bg-sky-50 rounded-full text-sky-400 hover:text-sky-600 transition-colors">
                  <X className="w-5 h-5" />
              </button>
           </div>
           <div className="p-6 overflow-y-auto space-y-3 custom-scrollbar">
              {priorityTasks.length === 0 ? (
                  <div className="text-center py-10 text-sky-300 font-bold">沒有設定優先級的任務</div>
              ) : (
                  <AnimatePresence mode="popLayout">
                      {priorityTasks.map((task, index) => (
                          <motion.div
                              key={task.id}
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
                              className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-sky-50 shadow-sm"
                          >
                              <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-black text-sm">
                                  {index + 1}
                              </span>
                              <span className="flex-grow font-bold text-sky-800 text-sm truncate">{task.title}</span>
                              <div className="flex gap-1">
                                  <button onClick={() => handleMove(task.id, -1)} disabled={index === 0} className="p-1.5 text-sky-300 hover:text-sky-600 disabled:opacity-30 hover:bg-sky-50 rounded-lg transition-colors">
                                      <ArrowUp className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleMove(task.id, 1)} disabled={index === priorityTasks.length - 1} className="p-1.5 text-sky-300 hover:text-sky-600 disabled:opacity-30 hover:bg-sky-50 rounded-lg transition-colors">
                                      <ArrowDown className="w-4 h-4" />
                                  </button>
                              </div>
                          </motion.div>
                      ))}
                  </AnimatePresence>
              )}
           </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default PriorityManager;