import { describe, it, expect } from 'vitest';
import { clampPage, formatPageRange, getTotalPages } from '../src/domain/pagination.ts';

describe('getTotalPages', () => {
  it('至少 1 頁', () => {
    expect(getTotalPages(0, 10)).toBe(1);
    expect(getTotalPages(10, 10)).toBe(1);
    expect(getTotalPages(11, 10)).toBe(2);
    expect(getTotalPages(25, 10)).toBe(3);
  });
});

describe('clampPage', () => {
  it('範圍內的頁碼不變', () => {
    expect(clampPage(1, 25, 10)).toBe(1);
    expect(clampPage(3, 25, 10)).toBe(3);
  });

  it('資料變少使頁碼超出時，退回最後一頁', () => {
    expect(clampPage(3, 15, 10)).toBe(2);
    expect(clampPage(2, 10, 10)).toBe(1);
    expect(clampPage(5, 0, 10)).toBe(1);
  });

  it('不合理的頁碼退回第 1 頁', () => {
    expect(clampPage(0, 25, 10)).toBe(1);
    expect(clampPage(-3, 25, 10)).toBe(1);
    expect(clampPage(NaN, 25, 10)).toBe(1);
  });
});

describe('formatPageRange：分頁下方的說明', () => {
  it('「第 1～10 筆，共 N 筆」', () => {
    expect(formatPageRange(1, 25, 10)).toBe('第 1～10 筆，共 25 筆');
    expect(formatPageRange(3, 25, 10)).toBe('第 21～25 筆，共 25 筆');
  });

  it('頁碼超出範圍時照最後一頁寫；沒有資料時只寫總數', () => {
    expect(formatPageRange(9, 15, 10)).toBe('第 11～15 筆，共 15 筆');
    expect(formatPageRange(1, 0, 10)).toBe('共 0 筆');
  });
});
