// 卡片裡只有一個文字欄位時（例如「維度」的目標、「卡池配置」的文字獎品）：
// 點卡片上任何不是按鈕的地方，都把游標放進那個文字欄位（放在文字最後面）。
//
// 原因（2026-11-21 實測）：這些卡片看起來整張就是一個輸入框，但真正的文字欄位只有中間一行高；
// 點到卡片上下的空白、或滑鼠移上去才出現的工具列（完成、上移、刪除…）旁邊的空隙，什麼都不會發生，
// 看起來就像「點了輸入框卻沒有游標」。工具列的按鈕本身照常可以按。

const INTERACTIVE = 'button, a, input, textarea, select, label, [contenteditable="true"], [role="button"]';
const TEXT_FIELD = 'textarea, input[type="text"], input:not([type])';

/** 當作卡片的 onMouseDown 使用 */
export function focusCardTextField(event) {
  if (event.button !== 0) return;
  const card = event.currentTarget;
  const target = event.target;
  if (!card || !target?.closest) return;
  const interactive = target.closest(INTERACTIVE);
  if (interactive && card.contains(interactive)) return;
  const field = card.querySelector(TEXT_FIELD);
  if (!field || field.disabled || field.readOnly) return;
  // 不讓這次按下滑鼠把焦點移到別處（例如 body），改成直接把焦點放進文字欄位
  event.preventDefault();
  field.focus();
  const end = field.value?.length ?? 0;
  try {
    field.setSelectionRange(end, end);
  } catch {
    // 有些欄位類型不支援設定游標位置，略過
  }
}
