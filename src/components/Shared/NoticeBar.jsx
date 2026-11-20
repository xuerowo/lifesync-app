// 測試環境（Vitest）用的是傳統 JSX 轉換，需要 React 在作用域內
import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

const TONES = {
  warning: {
    box: 'bg-amber-50 border-amber-300 text-amber-900',
    icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />,
  },
  success: {
    box: 'bg-emerald-50 border-emerald-300 text-emerald-900',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />,
  },
};

/**
 * 畫面上方、可以關掉的一般提示（不擋住操作）。
 * @param {object} props
 * @param {'warning'|'success'} props.tone
 * @param {string[]} props.lines 一句一行
 * @param {{ label: string, onClick: () => void }} [props.action] 額外的按鈕（例如「前往設定」）
 * @param {() => void} props.onDismiss
 */
const NoticeBar = ({ tone = 'warning', lines, action, onDismiss }) => {
  const style = TONES[tone] || TONES.warning;
  return (
    <div role="status" className={`mb-4 flex items-start gap-3 rounded-2xl border-2 px-4 py-3 shadow-sm ${style.box}`}>
      {style.icon}
      <div className="flex-1 min-w-0 text-sm font-bold leading-relaxed break-words">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-white/80 border border-current text-xs font-black hover:bg-white transition-colors"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        title="知道了，關掉這則提示"
        aria-label="關掉這則提示"
        className="shrink-0 p-1 rounded-full hover:bg-black/5 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default NoticeBar;
