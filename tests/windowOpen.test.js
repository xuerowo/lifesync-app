import { describe, it, expect } from 'vitest';
import { decideWindowOpen } from '../electron/windowOpen.js';

describe('decideWindowOpen：開新視窗的要求一律不開 Electron 視窗', () => {
  it('https／http 網址交給系統瀏覽器', () => {
    expect(decideWindowOpen('https://koofr.eu')).toEqual({ action: 'external', url: 'https://koofr.eu/' });
    expect(decideWindowOpen('http://example.com/a?b=1')).toEqual({ action: 'external', url: 'http://example.com/a?b=1' });
  });

  it('其他協定一律拒絕', () => {
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'mailto:someone@example.com',
      'ms-settings:privacy',
      'data:text/html,<b>x</b>',
      'about:blank',
    ]) {
      expect(decideWindowOpen(url)).toEqual({ action: 'deny' });
    }
  });

  it('看不懂的網址拒絕', () => {
    expect(decideWindowOpen('')).toEqual({ action: 'deny' });
    expect(decideWindowOpen('not a url')).toEqual({ action: 'deny' });
    expect(decideWindowOpen(undefined)).toEqual({ action: 'deny' });
  });
});
