import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { BookOpen, X, CheckCircle2 } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';

const NoteEditor = ({ editingNote, setEditingNote }) => {
  const { data, updateData } = useAppData();
  const [localItem, setLocalItem] = useState(editingNote);
  const isNew = !data.notes.some(n => n.id === editingNote.id);
  
  const handleSave = () => {
    const now = new Date().toISOString();
    const updatedItem = { ...localItem, updatedAt: now };
    updateData(prev => {
      const exists = prev.notes.some(n => n.id === updatedItem.id);
      if (exists) {
        return { ...prev, notes: prev.notes.map(n => n.id === updatedItem.id ? updatedItem : n) };
      }
      return { ...prev, notes: [updatedItem, ...prev.notes] };
    });
    setEditingNote(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-sky-950/20 backdrop-blur-sm p-4 animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/30 backdrop-blur-[40px] w-full max-w-2xl rounded-[48px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.4)] border border-white/20 overflow-hidden relative"
      >
        <div className="p-8 border-b border-white/20 flex justify-between items-center bg-white/10 relative z-10">
          <h3 className="font-black text-2xl flex items-center gap-3 text-sky-900 drop-shadow-sm">
            <BookOpen className="w-7 h-7 text-sky-500" /> {isNew ? '撰寫筆記' : '編輯筆記'}
          </h3>
          <button onClick={() => setEditingNote(null)} className="p-3 hover:bg-white/40 rounded-2xl transition-all hover:scale-110 active:scale-90">
            <X className="w-6 h-6 text-sky-600" />
          </button>
        </div>
        <div className="p-10 space-y-8 relative z-10">
          <div>
            <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">主題</label>
            <input
              type="text"
              className="w-full bg-white/40 p-4 rounded-2xl font-black text-sky-800 outline-none border border-white/60 focus:bg-white/60"
              value={localItem.title}
              onChange={e => setLocalItem({ ...localItem, title: e.target.value })}
              placeholder="輸入筆記主題..."
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-sky-600 mb-2 uppercase tracking-widest ml-1">筆記內容</label>
            <textarea
              className="w-full bg-white/40 p-8 rounded-[32px] text-xl font-bold outline-none border border-white/60 focus:bg-white/60 text-sky-900 min-h-[350px] resize-none leading-relaxed placeholder:text-sky-200"
              value={localItem.content}
              onChange={e => setLocalItem({ ...localItem, content: e.target.value })}
              placeholder="今天有什麼想法嗎？"
            />
          </div>
          <button
            onClick={handleSave}
            className="group relative w-full py-6 bg-sky-500/80 backdrop-blur-xl text-white font-black rounded-[32px] shadow-2xl shadow-sky-200/50 hover:bg-sky-600 hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 overflow-hidden border border-white/20"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
            <span className="relative flex items-center justify-center gap-3 text-xl tracking-[0.2em]">
              <CheckCircle2 className="w-7 h-7" /> 保存筆記
            </span>
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default NoteEditor;
