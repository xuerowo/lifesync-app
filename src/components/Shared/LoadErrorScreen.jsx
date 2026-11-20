// 測試環境（Vitest）用的是傳統 JSX 轉換，需要 React 在作用域內
import React from 'react';
import { AlertTriangle, RotateCcw, History, RefreshCw } from 'lucide-react';
import { describeLoadError, describeRestoreFailure, LOAD_ERROR_SAFETY_NOTE } from '../../domain/loadError';

/** 「09:30:05」；看不懂就回傳 null */
const formatLocalTime = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('zh-TW', { hour12: false });
};

/** 技術性的錯誤訊息最多顯示幾個字 */
const MAX_DETAIL_LENGTH = 300;

const clip = (text) => {
  const s = String(text || '').trim();
  return s.length > MAX_DETAIL_LENGTH ? `${s.slice(0, MAX_DETAIL_LENGTH)}…` : s;
};

/**
 * 讀檔失敗時的畫面（取代原本一直轉圈的「載入中」）。
 * 只負責顯示；重試與從備份還原由 AppDataContext 處理。
 *
 * @param {object} props
 * @param {{ code: string, error: string, dataFile?: string }} props.loadError
 * @param {'retry'|'restore'|null} props.busy 正在做哪個動作
 * @param {boolean} props.canRestore 是否能從備份還原（瀏覽器模式不行）
 * @param {{ code?: string, error?: string }|null} props.restoreFailure 上一次從備份還原失敗的原因
 * @param {() => void} props.onRetry
 * @param {() => void} props.onRestore
 */
const LoadErrorScreen = ({ loadError, busy = null, canRestore, restoreFailure = null, onRetry, onRestore }) => {
  const { reason, suggestRetryFirst } = describeLoadError(loadError);
  const detail = clip(loadError?.error);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-100 to-white flex items-center justify-center p-6 text-sky-950">
      <div role="alert" className="w-full max-w-xl bg-white/90 rounded-3xl shadow-xl border border-sky-100 p-8">
        <div className="text-center">
          <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black mb-3">資料讀不出來</h1>
        </div>
        <p className="text-sky-800 font-bold mb-3 leading-relaxed">{reason}</p>
        <p className="text-emerald-700 font-bold mb-5 leading-relaxed">{LOAD_ERROR_SAFETY_NOTE}</p>

        <div className="text-sm text-sky-800 mb-5 space-y-1 leading-relaxed">
          <p className="font-black">你可以：</p>
          <p>・按「重試」：重新讀一次資料檔。{suggestRetryFirst ? '建議先試這個。' : ''}</p>
          {canRestore ? (
            <p>・按「載入最近一次自動備份」：改用程式自動存下的最近一份備份。讀不出來的資料檔會先改名保留，不會被刪除；備份之後做的修改不會在裡面。</p>
          ) : (
            <p>・瀏覽器模式不能從這裡載入備份。請改用桌面版程式，或自己把 backups 資料夾裡的備份檔複製回來。</p>
          )}
        </div>

        {restoreFailure && (
          <p role="status" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 leading-relaxed">
            {describeRestoreFailure(restoreFailure)}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <button
            type="button"
            onClick={onRetry}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-black rounded-2xl shadow-md transition-colors disabled:opacity-50"
          >
            {busy === 'retry' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
            {busy === 'retry' ? '重新讀取中…' : '重試'}
          </button>
          {canRestore && (
            <button
              type="button"
              onClick={onRestore}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-emerald-50 text-emerald-700 border-2 border-emerald-400 font-black rounded-2xl shadow-sm transition-colors disabled:opacity-50"
            >
              {busy === 'restore' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <History className="w-5 h-5" />}
              {busy === 'restore' ? '載入備份中…' : '載入最近一次自動備份'}
            </button>
          )}
        </div>

        <div className="text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 break-all whitespace-pre-wrap font-mono space-y-1">
          <p>錯誤代碼：{loadError?.code || '未知'}</p>
          {formatLocalTime(loadError?.at) && <p>最後一次讀取：{formatLocalTime(loadError.at)}</p>}
          {detail && <p>錯誤訊息：{detail}</p>}
          {loadError?.dataFile && <p>資料檔位置：{loadError.dataFile}</p>}
        </div>
      </div>
    </div>
  );
};

export default LoadErrorScreen;
