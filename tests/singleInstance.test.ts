import { describe, it, expect, vi } from 'vitest';
import { setupSingleInstance, shouldUseSingleInstanceLock, focusWindow } from '../electron/singleInstance.ts';

const fakeApp = ({ isPackaged, gotLock = true }: { isPackaged: boolean; gotLock?: boolean }) => {
  const listeners: Record<string, () => void> = {};
  return {
    isPackaged,
    requestSingleInstanceLock: vi.fn(() => gotLock),
    on: vi.fn((name: string, fn: () => void) => {
      listeners[name] = fn;
    }),
    emit: (name: string) => listeners[name]?.(),
    listeners,
  };
};

const fakeWindow = ({ minimized = false, destroyed = false } = {}) => ({
  isDestroyed: () => destroyed,
  isMinimized: () => minimized,
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
});

describe('shouldUseSingleInstanceLock', () => {
  it('只有打包版才限制', () => {
    expect(shouldUseSingleInstanceLock(true)).toBe(true);
    expect(shouldUseSingleInstanceLock(false)).toBe(false);
    expect(shouldUseSingleInstanceLock(undefined)).toBe(false);
  });
});

describe('setupSingleInstance', () => {
  it('開發版：不申請鎖，照常啟動', () => {
    const app = fakeApp({ isPackaged: false });
    expect(setupSingleInstance(app, () => null)).toBe(true);
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(app.on).not.toHaveBeenCalled();
  });

  it('打包版、第一個開的：拿到鎖並監聽第二次開啟', () => {
    const app = fakeApp({ isPackaged: true, gotLock: true });
    expect(setupSingleInstance(app, () => null)).toBe(true);
    expect(app.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
    expect(app.listeners['second-instance']).toBeTypeOf('function');
  });

  it('打包版、已經有一個在跑：回傳 false（呼叫端要結束這個程序）', () => {
    const app = fakeApp({ isPackaged: true, gotLock: false });
    expect(setupSingleInstance(app, () => null)).toBe(false);
    expect(app.on).not.toHaveBeenCalled();
  });

  it('第二次開啟時，把最小化的主視窗還原並叫到前面', () => {
    const app = fakeApp({ isPackaged: true });
    const win = fakeWindow({ minimized: true });
    setupSingleInstance(app, () => win);
    app.emit('second-instance');
    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('主視窗還沒建立時，第二次開啟不會出錯', () => {
    const app = fakeApp({ isPackaged: true });
    setupSingleInstance(app, () => undefined);
    expect(() => app.emit('second-instance')).not.toThrow();
  });
});

describe('focusWindow', () => {
  it('沒有最小化時不呼叫 restore', () => {
    const win = fakeWindow();
    expect(focusWindow(win)).toBe(true);
    expect(win.restore).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('視窗已經關掉（destroyed）時什麼都不做', () => {
    const win = fakeWindow({ destroyed: true });
    expect(focusWindow(win)).toBe(false);
    expect(win.focus).not.toHaveBeenCalled();
  });
});
