// 測試環境（Vitest）用的是傳統 JSX 轉換，需要 React 在作用域內
import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { describeSaveError } from '../../domain/saveRetry.ts';
import type { SaveFailure } from '../../domain/saveRetry.ts';

/**
 * 存檔失敗時固定在畫面最上方的紅色提示（不擋住操作）。存好之後由呼叫端拿掉。
 */
interface SaveErrorBannerProps {
  /** AppDataContext 的 saveError */
  saveError: SaveFailure | null;
  /** 正在重試 */
  isRetrying?: boolean;
  /** 「立即重試」 */
  onRetry: () => void;
}

const SaveErrorBanner = ({ saveError, isRetrying = false, onRetry }: SaveErrorBannerProps) => {
  const text = describeSaveError(saveError);
  // describeSaveError 在沒有 saveError 時一定回傳 null，多判斷 saveError 只是讓型別檢查知道下面讀得到 saveError.code
  if (!saveError || !text) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[700] px-3 pt-3 pointer-events-none">
      <div
        role="alert"
        className="pointer-events-auto mx-auto max-w-3xl flex items-start gap-3 rounded-2xl border-2 border-rose-300 bg-rose-600 text-white px-4 py-3 shadow-2xl"
      >
        <AlertOctagon className="w-6 h-6 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm leading-relaxed">
          <p className="font-black text-base">{text.title}</p>
          {text.lines.map((line, i) => (
            <p key={i} className="font-bold">{line}</p>
          ))}
          <p className="text-xs text-rose-100 mt-1 break-all">
            錯誤代碼：{saveError.code}{saveError.error ? `（${saveError.error}）` : ''}
          </p>
        </div>
        {text.canRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-rose-700 text-xs font-black hover:bg-rose-50 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? '重試中……' : '立即重試'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SaveErrorBanner;
