// 計畫與任務的排列順序（純函式；主程序、畫面都會用到，不可 import 瀏覽器或 Electron 專用模組）。
//
// 2026-11-22 起，進行中的計畫（majorTasks）和計畫裡的任務（subTasks）都由使用者自己排順序：
// - 每一筆有一個數字欄位 sortOrder，畫面照它由小到大排。
// - 新增的計畫、任務放最上面：sortOrder 取同一組裡最小的再減 1。
// - 拖曳換位置時，通常只改被拖的那一筆（取新位置前後兩筆的中間值）；數值擠在一起時才整組重新編號。
// 用數字欄位、不用陣列的先後，是為了以後電腦和手機同步時能逐筆合併。
//
// 舊資料沒有 sortOrder：讀檔時（normalizeData）照「升級前畫面上的順序」補上，升級後畫面不會亂跳。
// - 計畫：升級前是自動排序（有優先任務的在前 → 今天還能做的任務多的在前 → 開始日期早的在前 → 建立早的在前）。
// - 任務：升級前就是陣列裡的先後。
// 之後才出現、沒有 sortOrder 的（例如舊版程式新增的），一律放在那一組的最上面。

const hasOrder = (item) => typeof item?.sortOrder === 'number' && Number.isFinite(item.sortOrder);

/** 依 sortOrder 由小到大排；沒有 sortOrder 的排最前面，彼此維持原本先後（不改動傳入的陣列） */
export function sortBySortOrder(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = hasOrder(a.item) ? a.item.sortOrder : -Infinity;
      const bo = hasOrder(b.item) ? b.item.sortOrder : -Infinity;
      if (ao !== bo) return ao < bo ? -1 : 1;
      return a.index - b.index;
    })
    .map((x) => x.item);
}

/** 放到這一組最上面要用的 sortOrder */
export function topSortOrder(items) {
  const orders = (Array.isArray(items) ? items : []).filter(hasOrder).map((t) => t.sortOrder);
  return orders.length > 0 ? Math.min(...orders) - 1 : 0;
}

const pad2 = (n) => String(n).padStart(2, '0');
const localDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * 升級前「進行中的計畫」的自動排序（只用來幫舊資料補 sortOrder）。
 * 規則照搬 2026-11-22 以前 TasksView.jsx 的排序。
 */
export function legacyPlanSort(majorTasks, subTasks, now = new Date()) {
  const subs = Array.isArray(subTasks) ? subTasks : [];
  const todayStr = localDateStr(now);
  const currentDay = now.getDay();

  const highestPriority = (planId) => {
    const p = subs.filter((s) => s?.majorTaskId === planId && s.isPriority);
    if (p.length === 0) return Infinity;
    return Math.min(...p.map((s) => s.priorityOrder || Infinity));
  };
  const activeUnfinished = (planId) => subs.filter((s) => {
    if (s?.majorTaskId !== planId) return false;
    if (s.type === 'daily' || s.type === 'weekly') {
      const doneToday = typeof s.lastCompletedAt === 'string' && s.lastCompletedAt.startsWith(todayStr);
      const wrongDay = s.type === 'weekly' && !(Array.isArray(s.days) && s.days.includes(currentDay));
      return !doneToday && !wrongDay;
    }
    return !s.completed;
  }).length;

  return (Array.isArray(majorTasks) ? majorTasks : [])
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const a = x.item || {};
      const b = y.item || {};
      const pa = highestPriority(a.id);
      const pb = highestPriority(b.id);
      if (pa !== pb) return pa - pb;
      const ca = activeUnfinished(a.id);
      const cb = activeUnfinished(b.id);
      if (ca !== cb) return cb - ca;
      const sa = String(a.startDate ?? '');
      const sb = String(b.startDate ?? '');
      if (sa !== sb) return sa.localeCompare(sb);
      const ta = new Date(a.createdAt || 0).getTime() || 0;
      const tb = new Date(b.createdAt || 0).getTime() || 0;
      if (ta !== tb) return ta - tb;
      return x.index - y.index;
    })
    .map((x) => x.item);
}

// 幫 ordered（已經照想要的先後排好）裡沒有 sortOrder 的項目補上：放在有 sortOrder 的項目前面
function fillMissing(ordered, existing) {
  const missing = ordered.filter((t) => t && typeof t === 'object' && !hasOrder(t));
  if (missing.length === 0) return new Map();
  const start = topSortOrder(existing) - (existing.some(hasOrder) ? missing.length - 1 : 0);
  return new Map(missing.map((t, i) => [t, start + i]));
}

const applyOrders = (list, orders) =>
  orders.size === 0 ? list : list.map((t) => (orders.has(t) ? { ...t, sortOrder: orders.get(t) } : t));

/** 進行中的計畫補上 sortOrder（沒有缺的就原樣回傳同一個陣列） */
export function fillPlanSortOrders(majorTasks, subTasks, now = new Date()) {
  if (!Array.isArray(majorTasks) || majorTasks.every((t) => !t || typeof t !== 'object' || hasOrder(t))) return majorTasks;
  const orders = fillMissing(legacyPlanSort(majorTasks, subTasks, now), majorTasks);
  return applyOrders(majorTasks, orders);
}

/** 計畫裡的任務補上 sortOrder，每個計畫各自一組（沒有缺的就原樣回傳同一個陣列） */
export function fillTaskSortOrders(subTasks) {
  if (!Array.isArray(subTasks) || subTasks.every((t) => !t || typeof t !== 'object' || hasOrder(t))) return subTasks;
  const groups = new Map();
  for (const t of subTasks) {
    if (!t || typeof t !== 'object') continue;
    const key = t.majorTaskId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const orders = new Map();
  for (const group of groups.values()) {
    for (const [t, o] of fillMissing(group, group)) orders.set(t, o);
  }
  return applyOrders(subTasks, orders);
}

/**
 * 拖曳換位置：把 activeId 移到 overId 的位置，回傳 Map(id → 新的 sortOrder)。
 * items：同一組的全部項目（例如全部進行中的計畫）。
 * visibleIds：畫面上看得到、可以拖的那些（篩選維度時只有一部分）；看不到的項目彼此先後不變。
 * 通常只改被拖的那一筆：sortOrder 設成新位置前後兩筆的中間值（以後兩台裝置同步時，各自拖動不同項目才不會互相衝突）。
 * 前後兩筆的值太接近、或有項目沒有 sortOrder 時，才整組重新編號成 0、1、2……
 * 找不到 activeId／overId 或位置沒變時回傳空的 Map。
 */
export function reorderSortOrders(items, visibleIds, activeId, overId) {
  const result = reorderedList(items, visibleIds, activeId, overId);
  if (!result) return new Map();
  const index = result.findIndex((t) => t.id === activeId);
  const before = result[index - 1];
  const after = result[index + 1];
  const neighboursOk = (!before || hasOrder(before)) && (!after || hasOrder(after));
  if (neighboursOk) {
    let value;
    if (before && after) value = (before.sortOrder + after.sortOrder) / 2;
    else if (before) value = before.sortOrder + 1;
    else if (after) value = after.sortOrder - 1;
    else value = 0;
    const roomy = (!before || value - before.sortOrder > 1e-6) && (!after || after.sortOrder - value > 1e-6);
    if (roomy) return new Map([[activeId, value]]);
  }
  return new Map(result.map((t, i) => [t.id, i]));
}

// 換位置之後整組的新先後（找不到或沒移動時回傳 null）。
// 只有被拖的那一筆換位置：往上拖就插到目標前面、往下拖就插到目標後面，其他項目（包括看不到的）彼此先後不變。
function reorderedList(items, visibleIds, activeId, overId) {
  if (activeId === overId) return null;
  const ordered = sortBySortOrder(items).filter((t) => t && typeof t === 'object');
  const visible = new Set(visibleIds ?? ordered.map((t) => t.id));
  const from = ordered.findIndex((t) => t.id === activeId);
  const to = ordered.findIndex((t) => t.id === overId);
  if (from < 0 || to < 0 || !visible.has(activeId) || !visible.has(overId)) return null;
  const result = [...ordered];
  const [item] = result.splice(from, 1);
  const overIndex = result.findIndex((t) => t.id === overId);
  result.splice(from < to ? overIndex + 1 : overIndex, 0, item);
  return result;
}

/**
 * 番茄鐘清單等「跨計畫」的任務列表：照計畫的順序、再照計畫裡任務的順序排，和計畫清單看到的一致。
 * 找不到所屬計畫的任務排在最後，彼此維持原本先後。
 */
export function sortTasksLikePlanList(subTasks, majorTasks) {
  const planRank = new Map(sortBySortOrder(majorTasks).map((p, i) => [p?.id, i]));
  const taskRank = new Map(sortBySortOrder(subTasks).map((t, i) => [t, i]));
  return (Array.isArray(subTasks) ? subTasks : [])
    .map((t, index) => ({ t, index }))
    .sort((a, b) => {
      const pa = planRank.has(a.t?.majorTaskId) ? planRank.get(a.t.majorTaskId) : Infinity;
      const pb = planRank.has(b.t?.majorTaskId) ? planRank.get(b.t.majorTaskId) : Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
      const ta = taskRank.get(a.t) ?? a.index;
      const tb = taskRank.get(b.t) ?? b.index;
      if (ta !== tb) return ta - tb;
      return a.index - b.index;
    })
    .map((x) => x.t);
}

/** 把 reorderSortOrders 的結果套回陣列（沒變的項目沿用原本的物件） */
export function applySortOrders(list, orders) {
  if (!orders || orders.size === 0) return list;
  return list.map((t) => (t && orders.has(t.id) && t.sortOrder !== orders.get(t.id) ? { ...t, sortOrder: orders.get(t.id) } : t));
}
