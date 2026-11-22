import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cleanData, main } from '../scripts/clean-data.ts';

/** 清理後的資料：下面要往下讀 pomodoroHistory 每一筆的欄位（值不對時斷言本身會失敗） */
type CleanedSample = Record<string, unknown> & { pomodoroHistory: Array<Record<string, unknown>> };

const sample = () => ({
  lotteryTickets: 5,
  cloudConfig: { url: 'https://example.invalid/dav', password: 'ENCRYPTED' },
  rewardHistory: [
    { id: 'r1', name: '獎品', taskTitle: '手動填的來源任務' },
    { id: 'r2', name: '獎品2' },
  ],
  achievements: [
    { id: 'a1', title: '只有一個舊欄位', rewardRarity: 'SR' },
    { id: 'a2', title: '兩個舊欄位', rewardRarity: 'N', rewardCount: 3 },
    { id: 'a3', title: '乾淨的' },
  ],
  pomodoroHistory: [
    {
      id: 'p1',
      tasks: [
        { id: 't1', title: 'A', isCompleted: true, isPriority: true, priorityOrder: 1, learningOrder: 2 },
        { id: 't2', title: 'B', priorityOrder: 4 }, // 沒有 isPriority 但有舊欄位
        { id: 't3', title: 'C' },
      ],
    },
    { id: 'p2' }, // 沒有 tasks
  ],
});

describe('cleanData', () => {
  it('保留 rewardHistory.taskTitle（來源任務）', () => {
    const { data } = cleanData(sample());
    expect(data.rewardHistory).toEqual(sample().rewardHistory);
  });

  it('移除 achievements 與 pomodoroHistory.tasks 的舊欄位，其餘欄位不變', () => {
    const data = cleanData(sample()).data as CleanedSample;
    expect(data.achievements).toEqual([
      { id: 'a1', title: '只有一個舊欄位' },
      { id: 'a2', title: '兩個舊欄位' },
      { id: 'a3', title: '乾淨的' },
    ]);
    expect(data.pomodoroHistory[0].tasks).toEqual([
      { id: 't1', title: 'A', isCompleted: true },
      { id: 't2', title: 'B' },
      { id: 't3', title: 'C' },
    ]);
    expect(data.pomodoroHistory[1]).toEqual({ id: 'p2' });
    expect(data.lotteryTickets).toBe(5);
    expect(data.cloudConfig).toEqual(sample().cloudConfig);
  });

  it('依實際移除的欄位計數', () => {
    const { report } = cleanData(sample());
    expect(report).toEqual({
      achievements: 2,
      achievementFields: 3,
      pomodoroTasks: 2,
      pomodoroTaskFields: 4,
      totalFields: 7,
    });
  });

  it('不修改傳入的物件', () => {
    const input = sample();
    cleanData(input);
    expect(input).toEqual(sample());
  });

  it('已經乾淨的資料不會有任何變動', () => {
    const { data: once } = cleanData(sample());
    const { data: twice, report } = cleanData(once);
    expect(twice).toEqual(once);
    expect(report.totalFields).toBe(0);
  });

  it('欄位缺少或格式奇怪時不會出錯', () => {
    expect(cleanData({}).report.totalFields).toBe(0);
    expect(cleanData({ achievements: [null, 1], pomodoroHistory: [null, { tasks: [null] }] }).report.totalFields).toBe(0);
    expect(() => cleanData([])).toThrow();
    expect(() => cleanData(null)).toThrow();
  });
});

describe('clean-data 指令', () => {
  let dir: string;
  let file: string;
  let logs: string[];
  const io = () => ({
    log: (m: string) => logs.push(m),
    error: (m: string) => logs.push(m),
    now: () => new Date(2026, 10, 20, 9, 30, 5),
  });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifesync-clean-test-'));
    file = path.join(dir, 'lifesync-data.json');
    fs.writeFileSync(file, JSON.stringify(sample(), null, 2));
    logs = [];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('沒有 --file 時只印說明並回傳失敗，不碰任何檔案', () => {
    expect(main([], io())).toBe(1);
    expect(logs.join('\n')).toContain('--file');
    expect(fs.readdirSync(dir)).toEqual(['lifesync-data.json']);
  });

  it('看不懂的參數回傳失敗', () => {
    expect(main(['--file'], io())).toBe(1);
    expect(main(['--file', file, '--force'], io())).toBe(1);
  });

  it('預設是試跑：只顯示會改什麼，不寫入也不備份', () => {
    const before = fs.readFileSync(file, 'utf8');
    expect(main(['--file', file], io())).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(fs.readdirSync(dir)).toEqual(['lifesync-data.json']);
    expect(logs.join('\n')).toContain('7 個欄位');
    expect(logs.join('\n')).toContain('--apply');
  });

  it('--apply：先備份原檔，再寫入清理後的內容，不留下暫存檔', () => {
    const before = fs.readFileSync(file, 'utf8');
    expect(main(['--file', file, '--apply'], io())).toBe(0);

    const backup = path.join(dir, 'lifesync-data.json.before-clean-20261120_093005.json');
    expect(fs.readFileSync(backup, 'utf8')).toBe(before);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(cleanData(sample()).data);
    expect(fs.readdirSync(dir).sort()).toEqual(['lifesync-data.json', 'lifesync-data.json.before-clean-20261120_093005.json']);
  });

  it('--apply 但沒有需要清理的欄位時，不寫入也不備份', () => {
    fs.writeFileSync(file, JSON.stringify(cleanData(sample()).data, null, 2));
    expect(main(['--file', file, '--apply'], io())).toBe(0);
    expect(fs.readdirSync(dir)).toEqual(['lifesync-data.json']);
  });

  it('同一秒內已有備份檔時不覆蓋它，也不寫入', () => {
    const backup = path.join(dir, 'lifesync-data.json.before-clean-20261120_093005.json');
    fs.writeFileSync(backup, 'older backup');
    const before = fs.readFileSync(file, 'utf8');
    expect(main(['--file', file, '--apply'], io())).toBe(1);
    expect(fs.readFileSync(backup, 'utf8')).toBe('older backup');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('讀不到或不是 JSON 的檔案回傳失敗，不改動檔案', () => {
    expect(main(['--file', path.join(dir, 'none.json')], io())).toBe(1);
    fs.writeFileSync(file, '{ broken');
    expect(main(['--file', file, '--apply'], io())).toBe(1);
    expect(fs.readFileSync(file, 'utf8')).toBe('{ broken');
  });

  it('可以讀有 BOM 的檔案', () => {
    fs.writeFileSync(file, '﻿' + JSON.stringify(sample()));
    expect(main(['--file', file], io())).toBe(0);
  });
});
