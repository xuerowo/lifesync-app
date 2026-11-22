// 焦點診斷記錄：「點輸入框沒有游標、打不了字」發生時，按 Ctrl+Shift+F12 把當下的狀態存成檔案。
//
// 平常不開（不記錄任何東西）。用 Ctrl+Shift+F11 開啟後（設定會記住，或用 LIFESYNC_DEBUG=1 啟動），
// 只在記憶體裡保留最近幾十筆事件，不寫檔、不送出；按 Ctrl+Shift+F12 時才把下面這些寫進資料資料夾的 diagnostics\：
// - 頁面有沒有鍵盤焦點、目前的元素
// - 最近幾次按滑鼠時實際點到的元素，以及它往上每一層的 z-index、pointer-events 等（看是不是被透明的東西蓋住）
// - 最近的焦點進出、視窗焦點、輸入法組字事件
// - 最近卡住畫面超過 50 毫秒的工作（long task）、反應很慢的點擊或按鍵
// - 最近輸入框被移除／重新建立的次數（React 重新掛載會讓輸入框失去焦點）
// - 番茄鐘是不是在跑
// 按鍵只記「是不是一般字元」，不記打了什麼字；輸入框的內容也不記。
// 使用方式見 docs/manual-checks.md「F2」。

const RING_LIMIT = 40;

/** 記錄的目標（通常是 window）：要用到 PerformanceObserver、MutationObserver 等全域的東西 */
export type FocusDiagnosticsTarget = Window & typeof globalThis;

/**
 * 讀元素描述時用到的欄位。傳進來的可能是元素、document 或 null，也可能是測試的假物件，
 * 所以每個欄位都可能沒有。
 */
type NodeLike = Partial<Element> & Partial<Pick<HTMLElement, 'isContentEditable'>>;

/** 會影響點擊的樣式 */
type StyleLike = Pick<CSSStyleDeclaration, 'position' | 'zIndex' | 'pointerEvents' | 'opacity' | 'visibility'>;

/** ancestorChain 每一層的內容 */
export interface ChainEntry {
  el: string | null;
  position?: string;
  zIndex?: string;
  pointerEvents?: string;
  opacity?: string;
  visibility?: string;
}

/** 固定長度的紀錄：超過上限就丟掉最舊的 */
export function createRing<T>(limit = RING_LIMIT): { push(item: T): void; list(): T[] } {
  const items: T[] = [];
  return {
    push(item) {
      items.push(item);
      if (items.length > limit) items.splice(0, items.length - limit);
    },
    list: () => items.slice(),
  };
}

const cut = (text: string, max: number): string => (typeof text === 'string' && text.length > max ? `${text.slice(0, max)}…` : text);

/** 用一行文字描述一個元素（標籤、id、class 前幾個、placeholder），不含使用者輸入的內容 */
export function describeElement(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  // 上面已經排除不是物件的；欄位都可能沒有，NodeLike 每個欄位都是可有可無
  const el = value as NodeLike;
  if (el.nodeType === 9) return '#document';
  const tag = (el.tagName || el.nodeName || '?').toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const className = typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '';
  const classes = className.trim() ? `.${className.trim().split(/\s+/).slice(0, 12).join('.')}` : '';
  const placeholder = el.getAttribute?.('placeholder');
  return cut(`${tag}${id}${classes}${placeholder ? `[placeholder="${placeholder}"]` : ''}`, 300);
}

/** 從元素往上列出每一層的描述與會影響點擊的樣式 */
export function ancestorChain(
  el: unknown,
  getStyle: (node: Element) => StyleLike | null | undefined,
  max = 30,
): ChainEntry[] {
  const chain: ChainEntry[] = [];
  // el 可能是任何東西：迴圈條件只接受 nodeType 是 1（元素）的
  for (let node = el as NodeLike | null | undefined; node && node.nodeType === 1 && chain.length < max; node = node.parentElement) {
    let style: StyleLike | null | undefined = null;
    try {
      // nodeType 是 1 表示它是元素
      style = getStyle(node as Element);
    } catch {
      style = null;
    }
    chain.push({
      el: describeElement(node),
      ...(style
        ? {
            position: style.position,
            zIndex: style.zIndex,
            pointerEvents: style.pointerEvents,
            opacity: style.opacity,
            visibility: style.visibility,
          }
        : {}),
    });
  }
  return chain;
}

const isTextField = (node: NodeLike | null | undefined): boolean | undefined =>
  node?.nodeType === 1 && (node.nodeName === 'INPUT' || node.nodeName === 'TEXTAREA' || node.isContentEditable);

/** 一個節點（含它裡面）有幾個輸入框 */
export function countTextFields(value: unknown): number {
  // 傳進來的是 MutationObserver 給的節點（可能是文字節點）；只處理 nodeType 是 1（元素）的
  const node = value as NodeLike | null | undefined;
  if (!node || node.nodeType !== 1) return 0;
  let count = isTextField(node) ? 1 : 0;
  if (node.getElementsByTagName) {
    count += node.getElementsByTagName('input').length + node.getElementsByTagName('textarea').length;
  }
  return count;
}

/** 一次按滑鼠的紀錄；after 是 100 毫秒後補上的焦點狀態 */
interface ClickEntry {
  t: number;
  x: number;
  y: number;
  hasFocus: boolean;
  activeBefore: string | null;
  hit: ChainEntry[];
  after?: { hasFocus: boolean; active: string | null };
}

interface FocusEventEntry {
  t: number;
  type: string;
  el?: string | null;
  to?: string | null;
}

interface KeyEventEntry {
  t: number;
  key: string;
  isComposing: boolean;
  defaultPrevented: boolean;
  hasFocus: boolean;
  el: string | null;
}

interface SlowEventEntry {
  t: number;
  name: string;
  waitMs: number;
  handlerMs: number;
  totalMs: number;
  el: string | null;
}

/** 開始記錄；回傳 { snapshot, stop } */
export function startFocusRecorder(target: FocusDiagnosticsTarget) {
  const doc = target.document;
  const getStyle = (el: Element) => target.getComputedStyle(el);
  const now = () => Math.round(target.performance.now());
  const clicks = createRing<ClickEntry>(10);
  const focusEvents = createRing<FocusEventEntry>();
  const keyEvents = createRing<KeyEventEntry>(20);
  const longTasks = createRing<{ t: number; ms: number }>(20);
  const slowEvents = createRing<SlowEventEntry>(20);
  const fieldMutations = createRing<{ t: number; added: number; removed: number }>();
  const cleanups: (() => void)[] = [];
  let fieldsAdded = 0;
  let fieldsRemoved = 0;

  const listen = <E extends Event>(obj: EventTarget, type: string, fn: (e: E) => void, options = true) => {
    // 呼叫端照事件名稱寫對應的事件型別（pointerdown → PointerEvent……），瀏覽器實際傳的就是那種事件
    const listener = fn as EventListener;
    obj.addEventListener(type, listener, options);
    cleanups.push(() => obj.removeEventListener(type, listener, options));
  };

  listen(target, 'pointerdown', (e: PointerEvent) => {
    const entry: ClickEntry = {
      t: now(),
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      hasFocus: doc.hasFocus(),
      activeBefore: describeElement(doc.activeElement),
      hit: ancestorChain(e.target, getStyle),
    };
    clicks.push(entry);
    // 點完之後焦點有沒有到點的地方
    target.setTimeout(() => {
      entry.after = { hasFocus: doc.hasFocus(), active: describeElement(doc.activeElement) };
    }, 100);
  });
  listen(doc, 'focusin', (e: FocusEvent) => focusEvents.push({ t: now(), type: 'focusin', el: describeElement(e.target) }));
  listen(doc, 'focusout', (e: FocusEvent) =>
    focusEvents.push({ t: now(), type: 'focusout', el: describeElement(e.target), to: describeElement(e.relatedTarget) }),
  );
  listen(target, 'focus', (e: FocusEvent) => {
    if (e.target === target) focusEvents.push({ t: now(), type: 'window-focus' });
  });
  listen(target, 'blur', (e: FocusEvent) => {
    if (e.target === target) focusEvents.push({ t: now(), type: 'window-blur' });
  });
  listen(doc, 'visibilitychange', () => focusEvents.push({ t: now(), type: `visibility-${doc.visibilityState}` }));
  listen(doc, 'compositionstart', (e: CompositionEvent) => focusEvents.push({ t: now(), type: 'ime-start', el: describeElement(e.target) }));
  listen(doc, 'compositionend', (e: CompositionEvent) => focusEvents.push({ t: now(), type: 'ime-end', el: describeElement(e.target) }));
  listen(target, 'keydown', (e: KeyboardEvent) => {
    keyEvents.push({
      t: now(),
      // 不記打了什麼字，只記是不是一般字元
      key: e.key && e.key.length === 1 ? '(字元)' : e.key,
      isComposing: e.isComposing,
      defaultPrevented: e.defaultPrevented,
      hasFocus: doc.hasFocus(),
      el: describeElement(e.target),
    });
  });

  const observers: { disconnect(): void }[] = [];
  // durationThreshold（event 紀錄的門檻）比較新，TypeScript 內建的型別還沒有
  const observe = (
    type: string,
    options: PerformanceObserverInit & { durationThreshold?: number },
    fn: (entry: PerformanceEntry) => void,
  ) => {
    try {
      const observer = new target.PerformanceObserver((list) => list.getEntries().forEach(fn));
      observer.observe({ type, buffered: true, ...options });
      observers.push(observer);
    } catch {
      // 不支援這種紀錄就略過
    }
  };
  observe('longtask', {}, (entry) => longTasks.push({ t: Math.round(entry.startTime), ms: Math.round(entry.duration) }));
  observe('event', { durationThreshold: 100 }, (performanceEntry) => {
    // 'event' 類型的紀錄就是 PerformanceEventTiming
    const entry = performanceEntry as PerformanceEventTiming;
    slowEvents.push({
      t: Math.round(entry.startTime),
      name: entry.name,
      // 等主執行緒有空才開始處理的時間（畫面忙碌）
      waitMs: Math.round(entry.processingStart - entry.startTime),
      handlerMs: Math.round(entry.processingEnd - entry.processingStart),
      // 從按下到畫面更新的總時間
      totalMs: Math.round(entry.duration),
      el: describeElement(entry.target),
    });
  });

  if (target.MutationObserver && doc.body) {
    const mutationObserver = new target.MutationObserver((records) => {
      let added = 0;
      let removed = 0;
      for (const record of records) {
        record.addedNodes.forEach((node) => (added += countTextFields(node)));
        record.removedNodes.forEach((node) => (removed += countTextFields(node)));
      }
      if (added || removed) {
        fieldsAdded += added;
        fieldsRemoved += removed;
        fieldMutations.push({ t: now(), added, removed });
      }
    });
    mutationObserver.observe(doc.body, { childList: true, subtree: true });
    observers.push(mutationObserver);
  }

  const readPomodoro = () => {
    try {
      return {
        status: target.localStorage.getItem('pomodoroStatus'),
        isPaused: target.localStorage.getItem('pomodoroIsPaused'),
      };
    } catch {
      return null;
    }
  };

  const snapshot = () => {
    const lastClick = clicks.list().at(-1);
    let atLastClickNow = null;
    if (lastClick) {
      // 現在同一個位置最上層是什麼（可能和當時不同，例如提示已經消失）
      atLastClickNow = ancestorChain(doc.elementFromPoint(lastClick.x, lastClick.y), getStyle, 8);
    }
    return {
      pageTime: now(),
      hasFocus: doc.hasFocus(),
      visibility: doc.visibilityState,
      activeElement: ancestorChain(doc.activeElement, getStyle, 8),
      activeElementConnected: Boolean(doc.activeElement?.isConnected),
      viewport: { width: target.innerWidth, height: target.innerHeight, devicePixelRatio: target.devicePixelRatio },
      pomodoro: readPomodoro(),
      clicks: clicks.list(),
      atLastClickNow,
      focusEvents: focusEvents.list(),
      keyEvents: keyEvents.list(),
      longTasks: longTasks.list(),
      slowEvents: slowEvents.list(),
      textFieldMutations: { totalAdded: fieldsAdded, totalRemoved: fieldsRemoved, recent: fieldMutations.list() },
    };
  };

  const stop = () => {
    cleanups.forEach((fn) => fn());
    observers.forEach((observer) => observer.disconnect());
  };

  return { snapshot, stop };
}

/**
 * 接上主程序：記錄開關、按下 Ctrl+Shift+F12 時回傳狀態。
 * 沒有 Electron 的 api（瀏覽器模式）時什麼都不做。
 */
export function installFocusDiagnostics(target: FocusDiagnosticsTarget | null | undefined): void {
  const api = target?.electronAPI;
  if (!target || !api || typeof api.onFocusDiagnosticsRequest !== 'function') return;
  let recorder: ReturnType<typeof startFocusRecorder> | null = null;
  const setEnabled = (enabled: boolean) => {
    if (enabled && !recorder) recorder = startFocusRecorder(target);
    if (!enabled && recorder) {
      recorder.stop();
      recorder = null;
    }
  };
  api.onFocusDiagnosticsToggle((enabled) => setEnabled(enabled === true));
  api.onFocusDiagnosticsRequest((requestId) => {
    let result: Record<string, unknown>;
    try {
      result = recorder
        ? { recording: true, ...recorder.snapshot() }
        : {
            recording: false,
            hasFocus: target.document.hasFocus(),
            activeElement: describeElement(target.document.activeElement),
          };
    } catch (error) {
      // 丟出來的不一定是 Error；不是物件時 message 讀到 undefined，改用 error 本身
      result = { error: String((error as { message?: unknown } | null | undefined)?.message || error) };
    }
    api.sendFocusDiagnostics(requestId, result);
  });
  api
    .isFocusDiagnosticsEnabled()
    .then((enabled) => setEnabled(enabled === true))
    .catch(() => {});
}
