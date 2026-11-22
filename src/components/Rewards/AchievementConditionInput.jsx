import React, { useEffect, useRef, useState } from 'react';
import { commitCountDraft, sanitizeCountDraft } from '../../domain/inputs.ts';

/**
 * 成就的「條件次數」欄位。
 *
 * 成就卡片是照條件次數由小到大排的。如果每打一個字就存一次，卡片會在打字途中跟著跳來跳去
 * （例如把 30 改成 50：清空那一下變 0 跳到最前面、打 5 又跳一次），還可能因為卡片被搬動而失去游標。
 * 所以打字時只改欄位裡的草稿，不動資料；離開欄位或按 Enter 才存，卡片這時才排到新位置，
 * 並捲到看得到它的地方。按 Esc 放棄這次修改。清空或只打 0 會退回原本的次數。
 *
 * 保留數字欄位（type="number"）：注音輸入法開著時，數字欄位會直接收數字，文字欄位會變成注音符號。
 * 但數字欄位在有游標時，滑鼠滾輪滾過去會偷偷改掉數字，所以把滾輪改成照常捲動頁面。
 * 上下方向鍵加減 1（最少 1）；數字以外的字元（e、-、小數點）打不進去。
 */
export default function AchievementConditionInput({ value, onCommit, className, ariaLabel = '要完成幾次任務' }) {
  const [draft, setDraft] = useState(null); // null = 沒在編輯，直接顯示目前的次數
  const cancelRef = useRef(false);
  const startValueRef = useRef(value); // 開始編輯時的次數：沒改就不存，避免蓋掉編輯途中從別處來的新值
  const inputRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const scroller = el.closest('.app-scroll');
      if (scroller) scroller.scrollBy({ top: e.deltaY, left: e.deltaX });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const step = (delta) => {
    setDraft((d) => {
      const current = parseInt(d, 10);
      const base = Number.isFinite(current) ? current : value;
      return String(Math.max(1, Math.min(999999, base + delta)));
    });
  };

  return (
    <input
      ref={inputRef}
      type="number"
      min="1"
      className={className}
      aria-label={ariaLabel}
      value={draft ?? String(value ?? '')}
      onFocus={() => {
        cancelRef.current = false;
        startValueRef.current = value;
        setDraft(String(value ?? ''));
      }}
      onChange={(e) => {
        // 數字欄位裡有不合法的內容時，瀏覽器回報空字串；這時不要把草稿清空，免得已經打的數字全不見
        if (e.target.validity?.badInput) return;
        setDraft(sanitizeCountDraft(e.target.value));
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // 輸入法組字中的 Enter／Esc 交給輸入法
        // 數字欄位本來也收 e、+、-、小數點；次數只要整數，其他單一字元一律擋掉
        if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); return; }
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelRef.current = true; e.currentTarget.blur(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
      }}
      onBlur={(e) => {
        const cancelled = cancelRef.current;
        cancelRef.current = false;
        const el = e.currentTarget;
        if (draft !== null && !cancelled) {
          const next = commitCountDraft(draft, startValueRef.current);
          if (next !== startValueRef.current) {
            onCommit(next);
            // 卡片滑到新位置後（動畫約 0.35 秒），捲到看得到它的地方
            setTimeout(() => {
              const card = el.closest('[data-achievement-card]');
              if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 400);
          }
        }
        setDraft(null);
      }}
    />
  );
}
