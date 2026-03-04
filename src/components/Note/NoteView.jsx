import React from 'react';
import { BookOpen, Plus, Edit3, Trash2, Clock, RotateCw, Cloud } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';

const NoteView = ({ setEditingNote }) => {
  const { data, updateData } = useAppData();
  const sortedNotes = [...data.notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const addNote = () => {
    const newNote = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditingNote(newNote);
  };

  const deleteNote = (id) => {
    if (confirm('確定要刪除這篇筆記嗎？')) {
      updateData(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== id) }));
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-2 gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-sky-400/20 rounded-2xl flex items-center justify-center text-sky-500">
            <BookOpen className="w-6 h-6 md:w-7 md:h-7" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-sky-900">生活筆記</h2>
            <p className="text-[8px] md:text-[10px] font-black text-sky-600 uppercase tracking-widest">記錄生命中的每一個想法</p>
          </div>
        </div>
        <button
          onClick={addNote}
          className="group relative w-full sm:w-auto px-6 py-3 md:py-3.5 bg-white/40 backdrop-blur-md border border-white/60 text-sky-600 rounded-2xl hover:bg-white/60 hover:-translate-y-1 md:hover:-translate-y-2 hover:scale-[1.02] md:hover:scale-[1.05] active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 font-black text-sm shadow-sm overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
          <Plus className="w-4 h-4 md:w-5 md:h-5 group-hover:rotate-90 transition-transform duration-500" />
          <span className="relative">撰寫新筆記</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        {sortedNotes.map(note => (
          <div key={note.id} className="bg-white/40 backdrop-blur-xl rounded-3xl md:rounded-[40px] p-6 md:p-8 border border-white/60 shadow-xl group relative transition-all hover:-translate-y-1 md:hover:-translate-y-2 hover:scale-[1.01] md:hover:scale-[1.02]">
            <div className="flex justify-between items-start mb-4 md:mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="px-3 py-1.5 md:px-4 md:py-2 bg-sky-500/10 rounded-xl text-sky-600 font-black text-[10px] md:text-xs border border-sky-500/20 truncate max-w-[200px]">
                  {note.title || '無主題'}
                </div>
              </div>
              <div className="flex gap-0.5 md:gap-1 opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditingNote(note)} className="p-1.5 md:p-2 text-sky-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-all">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteNote(note.id)} className="p-1.5 md:p-2 text-sky-200 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 md:gap-1 mb-4">
              <div className="flex items-center gap-1.5 md:gap-2 text-[8px] md:text-[9px] font-bold text-sky-500 uppercase tracking-tighter">
                <Clock className="w-3 h-3" /> 創建於 {new Date(note.createdAt).toLocaleString()}
              </div>
              {note.updatedAt && note.updatedAt !== note.createdAt && (
                <div className="flex items-center gap-1.5 md:gap-2 text-[8px] md:text-[9px] font-bold text-amber-600 uppercase tracking-tighter">
                  <RotateCw className="w-3 h-3" /> 更新於 {new Date(note.updatedAt).toLocaleString()}
                </div>
              )}
            </div>
            <p className="text-sky-900 font-bold leading-relaxed whitespace-pre-wrap break-words text-base md:text-lg">
              {note.content || <span className="text-sky-200 italic font-normal">這篇筆記還沒有內容...</span>}
            </p>
            
            <div className="absolute -bottom-2 -right-2 md:-bottom-4 md:-right-4 opacity-5 scale-100 md:scale-150 rotate-12 pointer-events-none">
              <Cloud className="w-16 h-16 md:w-24 md:h-24 text-sky-400" />
            </div>
          </div>
        ))}
        
        {sortedNotes.length === 0 && (
          <div className="col-span-full py-12 md:py-20 text-center bg-white/20 rounded-3xl md:rounded-[48px] border-4 border-dashed border-white/60">
            <BookOpen className="w-12 h-12 md:w-16 md:h-16 text-sky-100 mx-auto mb-4 md:mb-6" />
            <p className="text-sky-300 font-black text-lg md:text-xl">還沒有任何筆記</p>
            <p className="text-sky-200 font-bold text-xs md:text-sm mt-2">點擊上方開始記錄想法吧！</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteView;
