import { describe, it, expect } from 'vitest';
import {
  actualTicketDeduction,
  historyRemovalImpact,
  deleteSubTaskMessage,
  deleteMajorTaskMessage,
  revertCompletionImpact,
  revertCompletionMessage,
  completeMajorTaskMessage,
  deleteGoalMessage,
  deleteAchievementMessage,
  deleteRuleMessage,
  hasUnsavedNoteChanges,
} from '../src/domain/confirmations.js';

const baseData = () => ({
  lotteryTickets: 50,
  majorTasks: [{ id: 'm1', title: '讀書計畫', goalId: 'g1' }],
  archivedTasks: [{ id: 'm2', title: '舊計畫', goalId: 'g1' }],
  subTasks: [
    { id: 'd1', majorTaskId: 'm1', title: '每天讀書', type: 'daily', completionCount: 3 },
    { id: 'o1', majorTaskId: 'm1', title: '買書', type: 'precise', completed: false },
  ],
  archivedSubTasks: [
    { id: 'a1', majorTaskId: 'm1', title: '報名', type: 'precise', completed: true },
    { id: 'aw', majorTaskId: 'm2', title: '舊的每週', type: 'weekly', completed: true, completionCount: 4 },
  ],
  // 新的在前（和 completeSubTaskData 寫入的順序相同）
  taskHistory: [
    { taskId: 'd1', rewardTickets: 2 },
    { taskId: 'd1', rewardTickets: 2 },
    { taskId: 'd1' }, // 舊紀錄沒有 rewardTickets，當作 1 張
    { taskId: 'a1', rewardTickets: 5 },
    { taskId: 'aw', rewardTickets: 1 },
  ],
});

describe('actualTicketDeduction：最多扣到 0 張', () => {
  it('持有足夠時照扣', () => expect(actualTicketDeduction(5, 50)).toBe(5));
  it('持有不足時只扣到 0', () => expect(actualTicketDeduction(5, 3)).toBe(3));
  it('持有量不是數字時當作 0', () => expect(actualTicketDeduction(5, undefined)).toBe(0));
});

describe('historyRemovalImpact：刪除任務會刪掉的紀錄與券數', () => {
  it('依 taskId 加總，舊紀錄沒有 rewardTickets 時算 1 張', () => {
    expect(historyRemovalImpact(baseData().taskHistory, ['d1'])).toEqual({ records: 3, tickets: 5 });
  });
  it('rewardTickets 為 0 的紀錄算 0 張', () => {
    expect(historyRemovalImpact([{ taskId: 'x', rewardTickets: 0 }], ['x'])).toEqual({ records: 1, tickets: 0 });
  });
});

describe('deleteSubTaskMessage', () => {
  it('寫出任務名稱、紀錄筆數與扣券數', () => {
    const msg = deleteSubTaskMessage(baseData(), 'd1');
    expect(msg).toContain('「每天讀書」');
    expect(msg).toContain('3 筆完成紀錄');
    expect(msg).toContain('扣回 5 張抽卡券');
    expect(msg).toContain('無法復原');
  });
  it('沒有完成紀錄時說明不會扣券', () => {
    const msg = deleteSubTaskMessage(baseData(), 'o1');
    expect(msg).toContain('沒有完成紀錄');
    expect(msg).not.toContain('扣回');
  });
  it('已完成區的任務也找得到', () => {
    expect(deleteSubTaskMessage(baseData(), 'a1')).toContain('「報名」');
  });
  it('持有的券不夠扣時，說明實際只會扣到 0', () => {
    const data = { ...baseData(), lotteryTickets: 2 };
    const msg = deleteSubTaskMessage(data, 'd1');
    expect(msg).toContain('應扣 5 張');
    expect(msg).toContain('只有 2 張');
  });
});

describe('deleteMajorTaskMessage', () => {
  it('包含進行中與已完成的任務及其紀錄', () => {
    const msg = deleteMajorTaskMessage(baseData(), 'm1');
    expect(msg).toContain('「讀書計畫」');
    expect(msg).toContain('3 個任務');
    expect(msg).toContain('4 筆完成紀錄');
    expect(msg).toContain('扣回 10 張抽卡券');
  });
  it('已完成的計畫也適用', () => {
    const msg = deleteMajorTaskMessage(baseData(), 'm2');
    expect(msg).toContain('「舊計畫」');
    expect(msg).toContain('1 個任務');
    expect(msg).toContain('扣回 1 張抽卡券');
  });
  it('沒有任務的計畫', () => {
    const data = { ...baseData(), majorTasks: [{ id: 'empty', title: '空' }] };
    expect(deleteMajorTaskMessage(data, 'empty')).toContain('沒有任務');
  });
});

describe('revertCompletionImpact：與 revertTaskCompletion 的規則一致', () => {
  it('進行中的每日任務：刪最新一筆紀錄、扣那筆的券、次數減 1', () => {
    expect(revertCompletionImpact(baseData(), 'd1')).toMatchObject({
      records: 1,
      tickets: 2,
      movesBackToActive: false,
      countChange: { from: 3, to: 2 },
    });
  });
  it('已歸檔的一次性任務：刪一筆紀錄、扣券、搬回進行中', () => {
    expect(revertCompletionImpact(baseData(), 'a1')).toMatchObject({
      records: 1,
      tickets: 5,
      movesBackToActive: true,
      countChange: null,
    });
  });
  it('已歸檔的每日／每週任務：只搬回進行中，不刪紀錄也不扣券', () => {
    expect(revertCompletionImpact(baseData(), 'aw')).toMatchObject({ records: 0, tickets: 0, movesBackToActive: true });
  });
  it('進行中的一次性任務（例如在已完成計畫裡撤銷過）若還有紀錄，仍會再扣一次', () => {
    const data = { ...baseData(), taskHistory: [{ taskId: 'o1', rewardTickets: 3 }] };
    expect(revertCompletionImpact(data, 'o1')).toMatchObject({ records: 1, tickets: 3, movesBackToActive: false });
  });
});

describe('revertCompletionMessage', () => {
  it('每日任務：寫出扣券與次數變化', () => {
    const msg = revertCompletionMessage(baseData(), 'd1');
    expect(msg).toContain('「每天讀書」');
    expect(msg).toContain('1 筆完成紀錄');
    expect(msg).toContain('扣回 2 張抽卡券');
    expect(msg).toContain('從 3 次變成 2 次');
  });
  it('已歸檔的每週任務：說明紀錄與券都不變', () => {
    const msg = revertCompletionMessage(baseData(), 'aw');
    expect(msg).toContain('都不會變動');
  });
});

describe('revertCompletionMessage：計畫已完成、舊資料重複的情況', () => {
  it('計畫還在進行中：說會回到進行中', () => {
    const impact = revertCompletionImpact(baseData(), 'a1');
    expect(impact.archivedPlan).toBeNull();
    expect(revertCompletionMessage(baseData(), 'a1')).toContain('這個任務會回到進行中');
  });

  it('計畫已經完成：不說「回到進行中」，改說要先恢復計畫', () => {
    const msg = revertCompletionMessage(baseData(), 'aw');
    expect(revertCompletionImpact(baseData(), 'aw').archivedPlan).toMatchObject({ id: 'm2' });
    expect(msg).toContain('「舊計畫」已經完成');
    expect(msg).toContain('恢復計畫');
    expect(msg).not.toContain('這個任務會回到進行中');
  });

  it('同一個 id 同時在進行中（每日任務）和「已完成」區：只改進行中那份的次數，已完成那份不動', () => {
    const data = baseData();
    data.archivedSubTasks.push({ id: 'd1', majorTaskId: 'm1', title: '每天讀書', type: 'daily', completed: true });
    const impact = revertCompletionImpact(data, 'd1');
    // 已歸檔那份是每日任務 → 和 revertTaskCompletion 一樣不刪紀錄、不扣券
    expect(impact).toMatchObject({ records: 0, tickets: 0, movesBackToActive: false, countChange: { from: 3, to: 2 }, duplicate: true });
    const msg = revertCompletionMessage(data, 'd1');
    expect(msg).toContain('都不會變動');
    expect(msg).toContain('從 3 次變成 2 次');
    expect(msg).toContain('它不會變動');
    expect(msg).not.toContain('回到進行中');
  });

  it('同一個 id 同時在進行中（一次性任務）和「已完成」區：已完成那份搬回去，進行中會有兩份', () => {
    const data = baseData();
    data.subTasks.push({ id: 'a1', majorTaskId: 'm1', title: '報名', type: 'precise', completed: false });
    const impact = revertCompletionImpact(data, 'a1');
    expect(impact).toMatchObject({ records: 1, tickets: 5, movesBackToActive: true, countChange: null, duplicate: true });
    expect(revertCompletionMessage(data, 'a1')).toContain('撤銷後進行中會有兩份');
  });
});

describe('completeMajorTaskMessage', () => {
  it('說明進行中任務會一起歸檔、不刪紀錄不扣券', () => {
    const msg = completeMajorTaskMessage(baseData(), 'm1');
    expect(msg).toContain('「讀書計畫」');
    expect(msg).toContain('2 個任務會跟著計畫一起收起來');
    expect(msg).toContain('不會刪除任何完成紀錄');
    // 「買書」還沒做完：不算進成就；恢復計畫時兩個任務會一起回來
    expect(msg).toContain('其中 1 個一次性任務還沒完成');
    expect(msg).toContain('這 2 個任務會一起回到進行中');
    expect(msg).not.toContain('只會拿回計畫本身');
  });
});

describe('deleteGoalMessage', () => {
  it('提到屬於這個目標的計畫數（含已完成的計畫）', () => {
    const msg = deleteGoalMessage(baseData(), { id: 'g1', title: '考證照' });
    expect(msg).toContain('「考證照」');
    expect(msg).toContain('2 個計畫');
  });
  it('已達成的目標不提計畫', () => {
    const msg = deleteGoalMessage(baseData(), { id: 'g1', title: '考證照' }, { archived: true });
    expect(msg).toContain('已達成的目標');
    expect(msg).not.toContain('個計畫');
  });
});

describe('deleteAchievementMessage', () => {
  it('已領取的成就會提醒領取狀態也會消失', () => {
    expect(deleteAchievementMessage({ title: '百日', claimed: true })).toContain('領取狀態');
    expect(deleteAchievementMessage({ title: '百日', claimed: false })).not.toContain('領取狀態');
  });
  it('沒有名稱時用替代文字', () => {
    expect(deleteAchievementMessage({ title: '  ' })).toContain('未命名成就');
  });
});

describe('deleteRuleMessage', () => {
  it('空白守則不必確認', () => {
    expect(deleteRuleMessage({ content: '   ' })).toBeNull();
    expect(deleteRuleMessage(undefined)).toBeNull();
  });
  it('長內容只顯示前 30 字', () => {
    const msg = deleteRuleMessage({ content: 'あ'.repeat(40) });
    expect(msg).toContain(`「${'あ'.repeat(30)}……」`);
  });
});

describe('hasUnsavedNoteChanges', () => {
  it('沒改就不算', () => {
    expect(hasUnsavedNoteChanges({ title: 'a', content: 'b' }, { title: 'a', content: 'b' })).toBe(false);
  });
  it('新筆記欄位是 undefined 與空字串視為相同', () => {
    expect(hasUnsavedNoteChanges({ id: 'n' }, { id: 'n', title: '', content: '' })).toBe(false);
  });
  it('改了主題或內容就算', () => {
    expect(hasUnsavedNoteChanges({ title: 'a', content: 'b' }, { title: 'a2', content: 'b' })).toBe(true);
    expect(hasUnsavedNoteChanges({ title: 'a', content: 'b' }, { title: 'a', content: 'b!' })).toBe(true);
  });
});

describe('舊紀錄的負數或文字發券數', async () => {
  const { completionRewardTickets } = await import('../src/domain/tasks.js');
  it('讀紀錄時負數當 0、文字數字轉成數字、沒有欄位當 1', () => {
    expect(completionRewardTickets({ rewardTickets: -3 })).toBe(0);
    expect(completionRewardTickets({ rewardTickets: '3' })).toBe(3);
    expect(completionRewardTickets({})).toBe(1);
    expect(completionRewardTickets({ rewardTickets: 'abc' })).toBe(0);
  });
});
