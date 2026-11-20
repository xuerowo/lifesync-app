import { describe, it, expect } from 'vitest';
import { clampPage, getTotalPages } from '../src/domain/pagination.js';

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
