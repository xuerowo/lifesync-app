import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/** 錯誤訊息摘要最多顯示幾個字 */
const MAX_MESSAGE_LENGTH = 300;

const summarize = (error: unknown): string => {
  // 丟出來的可以是任何值；不是物件時讀 message 得到 undefined（和原本的 error?.message 一樣），所以這個 as 是安全的
  const text = String((error as { message?: unknown } | null | undefined)?.message || error || '未知的錯誤').trim();
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}……` : text;
};

/**
 * 最外層的錯誤保護：任何一個畫面出錯時，改顯示錯誤頁，而不是整個視窗變白。
 *
 * 放在 AppDataProvider「裡面」，所以畫面出錯時，存檔機制（含關窗、重新整理前的存檔）仍照常運作。
 */
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  /** 畫面丟出來的錯誤（可以是任何值）；沒有錯誤時是 null */
  error: unknown;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary] 畫面發生錯誤:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-scroll h-full bg-gradient-to-b from-sky-300 via-sky-100 to-white flex [align-items:safe_center] justify-center p-6 text-sky-950">
        <div role="alert" className="w-full max-w-lg bg-white/90 rounded-3xl shadow-xl border border-sky-100 p-8 text-center">
          <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black mb-2">畫面發生錯誤，你的資料不受影響</h1>
          <p className="text-sky-700 font-bold mb-5">按下「重新載入」就能回到程式。</p>
          <p className="text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 break-all whitespace-pre-wrap font-mono">
            錯誤訊息：{summarize(this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-black rounded-2xl shadow-md transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            重新載入
          </button>
        </div>
      </div>
    );
  }
}
