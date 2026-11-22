import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installFocusGuard } from '../src/utils/focusGuard.ts';

interface FakeWindowOptions {
  hasFocus: { value: boolean };
  api: { refocusPage: () => void } | undefined;
  visibility?: string;
}

const fakeWindow = ({ hasFocus, api, visibility = 'visible' }: FakeWindowOptions) => {
  const listeners: Record<string, () => void> = {};
  return {
    electronAPI: api,
    document: { hasFocus: () => hasFocus.value, visibilityState: visibility },
    addEventListener: vi.fn((type: string, fn: () => void, _capture: boolean) => { listeners[type] = fn; }),
    removeEventListener: vi.fn((type: string, _fn: () => void, _capture: boolean) => { delete listeners[type]; }),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    fire: (type: string) => listeners[type]?.(),
    listeners,
  };
};

describe('installFocusGuard：點了畫面但頁面沒有鍵盤焦點時，請主程序把焦點交回來', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('點擊後稍等，仍然沒有焦點才呼叫 refocusPage', () => {
    const hasFocus = { value: true };
    const api = { refocusPage: vi.fn() };
    const win = fakeWindow({ hasFocus, api });
    let clock = 0;
    installFocusGuard(win, { now: () => clock });
    expect(win.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);

    win.fire('pointerdown');
    vi.advanceTimersByTime(200);
    expect(api.refocusPage).not.toHaveBeenCalled();

    // 點擊當下沒有焦點、但很快就有了（從別的程式點回來）：不用修
    hasFocus.value = false;
    win.fire('pointerdown');
    hasFocus.value = true;
    vi.advanceTimersByTime(200);
    expect(api.refocusPage).not.toHaveBeenCalled();

    hasFocus.value = false;
    clock = 5000;
    win.fire('pointerdown');
    vi.advanceTimersByTime(200);
    expect(api.refocusPage).toHaveBeenCalledTimes(1);

    // 一秒內不重複
    clock = 5500;
    win.fire('pointerdown');
    vi.advanceTimersByTime(200);
    expect(api.refocusPage).toHaveBeenCalledTimes(1);
    clock = 6600;
    win.fire('pointerdown');
    vi.advanceTimersByTime(200);
    expect(api.refocusPage).toHaveBeenCalledTimes(2);
  });

  it('頁面看不到（最小化）時不修', () => {
    const api = { refocusPage: vi.fn() };
    const win = fakeWindow({ hasFocus: { value: false }, api, visibility: 'hidden' });
    installFocusGuard(win);
    win.fire('pointerdown');
    vi.advanceTimersByTime(200);
    expect(api.refocusPage).not.toHaveBeenCalled();
  });

  it('可以移除；瀏覽器模式（沒有 refocusPage）什麼都不做', () => {
    const api = { refocusPage: vi.fn() };
    const win = fakeWindow({ hasFocus: { value: false }, api });
    const remove = installFocusGuard(win);
    win.fire('pointerdown');
    remove();
    vi.advanceTimersByTime(200);
    expect(win.listeners.pointerdown).toBeUndefined();
    expect(api.refocusPage).not.toHaveBeenCalled();

    const browser = fakeWindow({ hasFocus: { value: false }, api: undefined });
    installFocusGuard(browser)();
    expect(browser.addEventListener).not.toHaveBeenCalled();
  });
});
