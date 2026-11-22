import React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Cloud } from 'lucide-react';
import { useAppData } from '../../contexts/useAppData.ts';
import { getDateStr, getTodayStr, formatTaskTime } from '../../utils/index.ts';
import { WEEK_DAYS } from '../../constants/index.tsx';
import { getCalendarTasksForDay, isDoneOnDate } from '../../domain/calendar.ts';
import { formatDisplayMonth } from '../../utils/displayFormat.ts';
import type { Dispatch, SetStateAction } from 'react';
import type { EditingTask } from '../../types/ui.ts';

interface CalendarViewProps {
  /** 顯示哪一週（這一天所在的那一週） */
  calendarDate: Date;
  setCalendarDate: Dispatch<SetStateAction<Date>>;
  setEditingTask: Dispatch<SetStateAction<EditingTask | null>>;
}

const CalendarView = ({ calendarDate, setCalendarDate, setEditingTask }: CalendarViewProps) => {
  const { data } = useAppData();

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarDate);
    d.setDate(calendarDate.getDate() - calendarDate.getDay() + i);
    return d;
  });

  // 各種時間欄位分別換成本地日期再比較（以前直接切 UTC 字串，台灣凌晨 0～8 點的事會跑到前一天）
  const getTasksForDay = (day: Date) => getCalendarTasksForDay(data, getDateStr(day), day.getDay(), getTodayStr());

  return (
    <div className="bg-white/40 backdrop-blur-xl rounded-3xl md:rounded-[48px] p-5 md:p-10 border border-white/60 shadow-xl animate-in slide-up">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 md:mb-10 gap-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-sky-400/20 rounded-2xl flex items-center justify-center text-sky-500">
            <CalendarIcon className="w-6 h-6 md:w-7 md:h-7" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-sky-900">週曆</h2>
            <p className="text-[8px] md:text-[10px] font-black text-sky-600 uppercase tracking-widest">{formatDisplayMonth(calendarDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-1 md:p-1.5 bg-white/50 rounded-xl md:rounded-2xl border border-white">
          <button onClick={() => { const d = new Date(calendarDate); d.setDate(d.getDate() - 7); setCalendarDate(d); }} title="上一週" aria-label="上一週" className="p-1.5 md:p-2 hover:bg-sky-100 rounded-lg md:rounded-xl text-sky-500">
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={() => setCalendarDate(new Date())} className="px-3 md:px-4 py-1.5 md:py-2 text-[9px] md:text-[10px] font-black text-sky-600 whitespace-nowrap">今天</button>
          <button onClick={() => { const d = new Date(calendarDate); d.setDate(d.getDate() + 7); setCalendarDate(d); }} title="下一週" aria-label="下一週" className="p-1.5 md:p-2 hover:bg-sky-100 rounded-lg md:rounded-xl text-sky-500">
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
                  const isDoneOnThisDay = isDoneOnDate(t, data.taskHistory, dateStr);
                  
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