import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRing, describeElement, ancestorChain, countTextFields } from '../src/utils/focusDiagnostics.ts';
import { diagnosticFileStamp, readEnabledSetting, summarizeMetrics } from '../electron/focusDiagnostics.js';

const el = (tagName, { id = '', className = '', placeholder = null, parent = null, inputs = 0, textareas = 0 } = {}) => ({
  nodeType: 1,
  tagName: tagName.toUpperCase(),
  nodeName: tagName.toUpperCase(),
  id,
  className,
  parentElement: parent,
  getAttribute: (name) => (name === 'placeholder' ? placeholder : null),
  getElementsByTagName: (name) => ({ length: name === 'input' ? inputs : name === 'textarea' ? textareas : 0 }),
});

describe('焦點診斷（畫面端的小工具）', () => {
  it('紀錄只留最新的幾筆', () => {
    const ring = createRing(3);
    [1, 2, 3, 4, 5].forEach((n) => ring.push(n));
    expect(ring.list()).toEqual([3, 4, 5]);
  });

  it('描述元素：標籤、id、class、placeholder', () => {
    expect(describeElement(el('textarea', { id: 'a', className: 'w-full  bg-transparent', placeholder: '請輸入' }))).toBe(
      'textarea#a.w-full.bg-transparent[placeholder="請輸入"]',
    );
    expect(describeElement(null)).toBe(null);
    expect(describeElement({ nodeType: 9 })).toBe('#document');
  });

  it('往上列出每一層的樣式，讀樣式失敗也不中斷', () => {
    const root = el('div', { className: 'fixed' });
    const child = el('button', { parent: root });
    const styles = new Map([[root, { position: 'fixed', zIndex: '30', pointerEvents: 'auto', opacity: '0', visibility: 'visible' }]]);
    const chain = ancestorChain(child, (node) => {
      if (!styles.has(node)) throw new Error('no style');
      return styles.get(node);
    });
    expect(chain).toEqual([
      { el: 'button' },
      { el: 'div.fixed', position: 'fixed', zIndex: '30', pointerEvents: 'auto', opacity: '0', visibility: 'visible' },
    ]);
  });

  it('數一個節點裡有幾個輸入框', () => {
    expect(countTextFields(el('input'))).toBe(1);
    expect(countTextFields(el('div', { inputs: 2, textareas: 1 }))).toBe(3);
    expect(countTextFields({ nodeType: 3 })).toBe(0);
  });
});

describe('焦點診斷（主程序的小工具）', () => {
  it('檔名時間', () => {
    expect(diagnosticFileStamp(new Date(2026, 10, 21, 9, 3, 7, 45))).toBe('20261121_090307_045');
  });

  it('設定檔不存在、壞掉都當作沒開', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifesync-diag-'));
    const file = path.join(dir, 'focus-diagnostics.json');
    expect(readEnabledSetting(file)).toBe(false);
    fs.writeFileSync(file, '{壞掉');
    expect(readEnabledSetting(file)).toBe(false);
    fs.writeFileSync(file, JSON.stringify({ enabled: true }));
    expect(readEnabledSetting(file)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('整理各程序的 CPU、記憶體', () => {
    expect(
      summarizeMetrics([{ type: 'GPU', pid: 3, cpu: { percentCPUUsage: 12.345 }, memory: { workingSetSize: 204800 } }]),
    ).toEqual([{ type: 'GPU', pid: 3, cpuPercent: 12.3, memoryMB: 200 }]);
    expect(summarizeMetrics(undefined)).toEqual([]);
  });
});
