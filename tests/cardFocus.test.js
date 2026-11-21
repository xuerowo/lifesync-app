import { describe, it, expect, vi } from 'vitest';
import { focusCardTextField } from '../src/utils/cardFocus.js';

const makeCard = ({ field } = {}) => {
  const card = {
    contains: (node) => node === card || node?.inCard === true,
    querySelector: () => field ?? null,
  };
  return card;
};
const node = (interactive, inCard = true) => ({ inCard, closest: () => (interactive ? interactive : null) });
const makeField = (value = '測試') => ({ value, disabled: false, readOnly: false, focus: vi.fn(), setSelectionRange: vi.fn() });
const mouseDown = (card, target, button = 0) => ({ button, currentTarget: card, target, preventDefault: vi.fn() });

describe('focusCardTextField：點卡片上不是按鈕的地方，把游標放進文字欄位', () => {
  it('點空白：焦點進文字欄位、游標在最後', () => {
    const field = makeField('測試獎品');
    const card = makeCard({ field });
    const event = mouseDown(card, node(null));
    focusCardTextField(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(field.focus).toHaveBeenCalled();
    expect(field.setSelectionRange).toHaveBeenCalledWith(4, 4);
  });

  it('點按鈕或文字欄位本身：不插手', () => {
    const field = makeField();
    const card = makeCard({ field });
    const button = { inCard: true };
    const event = mouseDown(card, node(button));
    focusCardTextField(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(field.focus).not.toHaveBeenCalled();
  });

  it('卡片外層的按鈕不算（只看卡片裡面的）', () => {
    const field = makeField();
    const card = makeCard({ field });
    const outerButton = { inCard: false };
    const event = mouseDown(card, node(outerButton));
    focusCardTextField(event);
    expect(field.focus).toHaveBeenCalled();
  });

  it('右鍵、沒有文字欄位、欄位停用時不做事', () => {
    const field = makeField();
    const right = mouseDown(makeCard({ field }), node(null), 2);
    focusCardTextField(right);
    expect(field.focus).not.toHaveBeenCalled();

    const none = mouseDown(makeCard({}), node(null));
    focusCardTextField(none);
    expect(none.preventDefault).not.toHaveBeenCalled();

    const disabled = { ...makeField(), disabled: true };
    const ev = mouseDown(makeCard({ field: disabled }), node(null));
    focusCardTextField(ev);
    expect(disabled.focus).not.toHaveBeenCalled();
  });
});
