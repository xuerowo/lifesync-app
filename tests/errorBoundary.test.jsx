import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ErrorBoundary from '../src/components/Shared/ErrorBoundary.jsx';

// 測試環境沒有瀏覽器 DOM，所以直接呼叫元件的 render 檢查輸出內容
const renderWithState = (state, children = '正常內容') => {
  const boundary = new ErrorBoundary({ children });
  boundary.state = { ...boundary.state, ...state };
  const output = boundary.render();
  return typeof output === 'string' ? output : renderToStaticMarkup(output);
};

describe('ErrorBoundary', () => {
  it('沒有錯誤時原樣顯示子元件', () => {
    expect(renderWithState({})).toBe('正常內容');
  });

  it('出錯時記下錯誤', () => {
    const error = new Error('boom');
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it('出錯時顯示白話錯誤頁、錯誤摘要與重新載入按鈕', () => {
    const html = renderWithState({ error: new Error('Cannot read properties of undefined') });
    expect(html).toContain('畫面發生錯誤，你的資料不受影響');
    expect(html).toContain('Cannot read properties of undefined');
    expect(html).toContain('重新載入');
    expect(html).not.toContain('正常內容');
  });

  it('過長的錯誤訊息會被截短', () => {
    const html = renderWithState({ error: new Error('x'.repeat(1000)) });
    expect(html).toContain(`${'x'.repeat(300)}……`);
    expect(html).not.toContain('x'.repeat(301));
  });

  it('丟出的不是 Error 物件時也能顯示', () => {
    expect(renderWithState({ error: 'plain string' })).toContain('plain string');
  });

  it('把錯誤印到主控台', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    new ErrorBoundary({}).componentDidCatch(new Error('boom'), { componentStack: 'at App' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
