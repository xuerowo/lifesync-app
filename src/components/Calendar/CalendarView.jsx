import React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Cloud } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { getDateStr, getTodayStr, formatTaskTime } from '../../utils';
import { WEEK_DAYS } from '../../constants/index.jsx';

const CalendarView = ({ calendarDate, setCalendarDate, setEditingTask }) => {
  const { data } = useAppData();

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarDate);
    d.setDate(calendarDate.getDate() - calendarDate.getDay() + i);
    return d;
  });

  const getTasksForDay = (day) => {
    const dayIdx = day.getDay();
    const dateStr = getDateStr(day);
    
    const allMajorTasks = [...data.majorTasks, ...data.archivedTasks];
    const allSubTasks = [...data.subTasks, ...data.archivedSubTasks];

    return allSubTasks.filter(task => {
      if (task.type === 'infinite') return false;
      const major = allMajorTasks.find(m => m.id === task.majorTaskId);
      if (!major) return false;

      const isArchived = task.completed || major.completed;
      
      let effectiveStart, effectiveEnd;

      if (task.type === 'precise') {
        if (task.noTime) {
          if (!isArchived) return false;
          const completionDate = (task.completedAt || major.completedAt)?.split('T')[0];
          effectiveStart = completionDate;
          effectiveEnd = completionDate;
        } else if (isArchived) {
          effectiveStart = (task.createdAt || task.startDateTime)?.split('T')[0];
          effectiveEnd = (task.completedAt || major.completedAt || new Date().toISOString())?.split('T')[0];
        } else {
          effectiveStart = task.startDateTime?.split('T')[0];
          effectiveEnd = (task.endDateTime || task.startDateTime)?.split('T')[0];
        }
      } else {
        effectiveStart = (task.createdAt || major.startDate)?.split('T')[0];
        if (isArchived) {
          effectiveEnd = (task.completedAt || major.completedAt || new Date().toISOString())?.split('T')[0];
        } else {
          effectiveEnd = major.endDate;
        }
      }

      if (dateStr < effectiveStart || dateStr > effectiveEnd) return false;

      if (task.type === 'weekly') return task.days.includes(dayIdx);
      
      return true;
    }).sort((a, b) => (a.startTime || a.startDateTime || '').localeCompare(b.startTime || b.startDateTime || ''));
  };

  return (
    <div className="bg-white/40 backdrop-blur-xl rounded-3xl md:rounded-[48px] p-5 md:p-10 border border-white/60 shadow-xl animate-in slide-up">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 md:mb-10 gap-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-sky-400/20 rounded-2xl flex items-center justify-center text-sky-500">
            <CalendarIcon className="w-6 h-6 md:w-7 md:h-7" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-sky-900">時間地圖</h2>
            <p className="text-[8px] md:text-[10px] font-black text-sky-600 uppercase tracking-widest">{calendarDate.getFullYear()} . {calendarDate.getMonth() + 1}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-1 md:p-1.5 bg-white/50 rounded-xl md:rounded-2xl border border-white">
          <button onClick={() => { const d = new Date(calendarDate); d.setDate(d.getDate() - 7); setCalendarDate(d); }} className="p-1.5 md:p-2 hover:bg-sky-100 rounded-lg md:rounded-xl text-sky-500">
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={() => setCalendarDate(new Date())} className="px-3 md:px-4 py-1.5 md:py-2 text-[9px] md:text-[10px] font-black text-sky-600 whitespace-nowrap">今天</button>
          <button onClick={() => { const d = new Date(calendarDate); d.setDate(d.getDate() + 7); setCalendarDate(d); }} className="p-1.5 md:p-2 hover:bg-sky-100 rounded-lg md:rounded-xl text-sky-500">
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 md:gap-4">
        {weekDays.map((day, idx) => {
          const isToday = getDateStr(day) === getTodayStr();
          const tasks = getTasksForDay(day);
          return (
            <div key={idx} className={`rounded-2xl md:rounded-[32px] p-4 md:p-5 flex flex-col min-h-[250px] md:min-h-[350px] transition-all border ${isToday ? 'bg-sky-500 text-white border-sky-400 shadow-lg scale-100 md:scale-105 z-10' : 'bg-white/30 text-sky-900 border-white/50'}`}>
              <div className="text-center mb-4 md:mb-6">
                <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest ${isToday ? 'text-sky-100' : 'text-sky-500'}`}>{WEEK_DAYS[idx]}</span>
                <p className="text-xl md:text-2xl font-black">{day.getDate()}</p>
              </div>
              <div className="space-y-2">
                {tasks.map(t => {
                  const dateStr = getDateStr(day);
                  // 判斷該任務在該日期是否完成
                  // 1. 如果是一次性任務且已完成，檢查完成日期
                  // 2. 如果是重複性任務，檢查當天是否有對應的 taskHistory 紀錄
                  const isDoneOnThisDay = t.type === 'precise'
                    ? (t.completed && t.completedAt?.startsWith(dateStr))
                    : data.taskHistory.some(h => h.taskId === t.id && h.completedAt?.startsWith(dateStr));
                  
                  return (
                    <div key={t.id} onClick={() => setEditingTask({ type: 'sub', item: t })} className={`p-2.5 md:p-3 rounded-xl cursor-pointer hover:brightness-105 transition-all text-left ${isToday ? 'bg-white/20' : 'bg-white shadow-sm border border-sky-50'}`}>
                      <p className={`text-[7px] md:text-[8px] font-black mb-1 ${isToday ? 'text-sky-100' : 'text-sky-600'}`}>{formatTaskTime(t, true)}</p>
                      <p className={`text-[10px] md:text-xs font-bold leading-tight break-words ${isDoneOnThisDay ? 'opacity-50 line-through' : ''}`}>{t.title}</p>
                    </div>
                  );
                })}
                {tasks.length === 0 && <Cloud className={`w-5 h-5 md:w-6 md:h-6 mx-auto mt-4 opacity-10 ${isToday ? 'text-white' : 'text-sky-600'}`} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;