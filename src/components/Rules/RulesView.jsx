import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListChecks, Plus, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';

const RulesView = () => {
  const { data, updateData } = useAppData();

  const addRule = () => {
    const newRule = {
      id: crypto.randomUUID(),
      content: '',
      createdAt: new Date().toISOString()
    };
    updateData(prev => ({ ...prev, rules: [...prev.rules, newRule] }));
  };

  const deleteRule = (id) => {
    updateData(prev => ({ ...prev, rules: prev.rules.filter(r => r.id !== id) }));
  };

  const moveRule = (index, direction) => {
    const newRules = [...data.rules];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newRules.length) return;
    [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
    updateData(prev => ({ ...prev, rules: newRules }));
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-sky-400/20 rounded-2xl flex items-center justify-center text-sky-500">
            <ListChecks className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-sky-900">行動準則</h2>
            <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">建立屬於你的生活規範與原則</p>
          </div>
        </div>
        <button
          onClick={addRule}
          className="group relative px-6 py-3.5 bg-white/40 backdrop-blur-md border border-white/60 text-sky-600 rounded-2xl hover:bg-white/60 hover:-translate-y-2 hover:scale-[1.05] active:scale-95 transition-all duration-300 flex items-center gap-2 font-black text-sm shadow-sm overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          <span className="relative">新增準則</span>
        </button>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {data.rules.map((rule, idx) => (
            <motion.div
              key={rule.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
              className="group relative flex items-center bg-white/40 backdrop-blur-xl pl-6 pr-2 py-5 rounded-[32px] border border-white/60 shadow-xl hover:bg-white/60"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-600 font-black text-lg mr-5 border border-sky-500/20">
                {idx + 1}
              </div>
            <div className="flex-grow min-w-0">
              <textarea
                className="w-full bg-transparent font-bold text-sky-900 outline-none focus:text-sky-600 text-lg resize-none overflow-hidden leading-relaxed block break-words whitespace-pre-wrap"
                placeholder="請輸入準則內容..."
                value={rule.content}
                rows={1}
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                onChange={(e) => {
                  updateData(prev => ({
                    ...prev,
                    rules: prev.rules.map(r => r.id === rule.id ? { ...r, content: e.target.value } : r)
                  }));
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
              />
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4 bg-white/40 backdrop-blur-md rounded-2xl p-1 border border-white/40">
              <button onClick={() => moveRule(idx, -1)} className="p-2 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-all" title="上移">
                <ArrowUp className="w-4 h-4" />
              </button>
              <button onClick={() => moveRule(idx, 1)} className="p-2 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-all" title="下移">
                <ArrowDown className="w-4 h-4" />
              </button>
              <button onClick={() => deleteRule(rule.id)} className="p-2 text-sky-200 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all" title="刪除">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {data.rules.length === 0 && (
          <div className="py-20 text-center bg-white/20 rounded-[48px] border-4 border-dashed border-white/60">
            <ListChecks className="w-16 h-16 text-sky-100 mx-auto mb-6" />
            <p className="text-sky-300 font-black text-xl">還沒有任何行動準則</p>
            <p className="text-sky-200 font-bold text-sm mt-2">點擊右上角開始建立你的生活原則吧！</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RulesView;