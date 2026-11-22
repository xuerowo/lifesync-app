import { describe, it, expect } from 'vitest';
import { compareNotesByRecent } from '../src/domain/notes.ts';
import type { Note } from '../src/types/data.ts';

const sortIds = (notes: Note[]) => [...notes].sort(compareNotesByRecent).map(n => n.id);

describe('compareNotesByRecent：生活筆記的排序', () => {
  it('都有 updatedAt 時，最近更新的在前面，和原本一樣', () => {
    expect(sortIds([
      { id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', updatedAt: '2026-03-01T00:00:00.000Z' },
      { id: 'mid', updatedAt: '2026-02-01T00:00:00.000Z' },
    ])).toEqual(['new', 'mid', 'old']);
  });

  it('沒有 updatedAt 的舊筆記改用 createdAt 排', () => {
    expect(sortIds([
      { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', createdAt: '2026-02-01T00:00:00.000Z' },
      { id: 'c', updatedAt: '2025-12-01T00:00:00.000Z' },
    ])).toEqual(['b', 'a', 'c']);
  });

  it('updatedAt 不是有效時間時也改用 createdAt', () => {
    expect(sortIds([
      { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', updatedAt: 'not a date', createdAt: '2026-02-01T00:00:00.000Z' },
    ])).toEqual(['b', 'a']);
  });

  it('兩個時間都沒有的排在最後，彼此維持原本的先後', () => {
    expect(sortIds([
      { id: 'x' },
      { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'y', createdAt: 'broken' },
      { id: 'b', createdAt: '2026-02-01T00:00:00.000Z' },
    ])).toEqual(['b', 'a', 'x', 'y']);
  });

  it('時間相同時維持原本的先後', () => {
    const t = '2026-01-01T00:00:00.000Z';
    expect(sortIds([{ id: 'p', updatedAt: t }, { id: 'q', createdAt: t }])).toEqual(['p', 'q']);
  });
});
