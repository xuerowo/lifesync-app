/**
 * 生活筆記的規則（純函式）
 */
import type { Note } from '../types/data.ts';

/** 筆記排序用的時間（毫秒）：先看 updatedAt，沒有或不是有效時間就看 createdAt，都沒有回傳 null */
function noteTime(note: Pick<Note, 'updatedAt' | 'createdAt'>): number | null {
  for (const value of [note.updatedAt, note.createdAt]) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) return time;
  }
  return null;
}

/**
 * 生活筆記清單的排序比較函式：最近更新的在前面。
 * 沒有 updatedAt 的舊筆記改用 createdAt；兩個都沒有（或都不是有效時間）的排在最後。
 * 時間相同、或兩個都沒有時回傳 0，搭配 Array.prototype.sort（穩定排序）會維持原本的先後。
 */
export function compareNotesByRecent(
  a: Pick<Note, 'updatedAt' | 'createdAt'>,
  b: Pick<Note, 'updatedAt' | 'createdAt'>,
): number {
  const timeA = noteTime(a);
  const timeB = noteTime(b);
  if (timeA !== null && timeB !== null) return timeB - timeA;
  if (timeA !== null) return -1;
  if (timeB !== null) return 1;
  return 0;
}
