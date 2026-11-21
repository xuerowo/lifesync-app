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

/** 固定長度的紀錄：超過上限就丟掉最舊的 */
export function createRing(limit = RING_LIMIT) {
  const items = [];
  return {
    push(item) {
      items.push(item);
      if (items.length > limit) items.splice(0, items.length - limit);
    },
    list: () => items.slice(),
  };
}

const cut = (text, max) => (typeof text === 'string' && text.length > max ? `${text.slice(0, max)}…` : text);

/** 用一行文字描述一個元素（標籤、id、class 前幾個、placeholder），不含使用者輸入的內容 */
export function describeElement(el) {
  if (!el || typeof el !== 'object') return null;
  if (el.nodeType === 9) return '#document';
  const tag = (el.tagName || el.nodeName || '?').toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const className = typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '';
  const classes = className.trim() ? `.${className.trim().split(/\s+/).slice(0, 12).join('.')}` : '';
  const placeholder = el.getAttribute?.('placeholder');
  return cut(`${tag}${id}${classes}${placeholder ? `[placeholder="${placeholder}"]` : ''}`, 300);
}

/** 從元素往上列出每一層的描述與會影響點擊的樣式 */
export function ancestorChain(el, getStyle, max = 30) {
  const chain = [];
  for (let node = el; node && node.nodeType === 1 && chain.length < max; node = node.parentElement) {
    let style = null;
    try {
      style = getStyle(node);
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

const isTextField = (node) =>
  node?.nodeType === 1 && (node.nodeName === 'INPUT' || node.nodeName === 'TEXTAREA' || node.isContentEditable);

/** 一個節點（含它裡面）有幾個輸入框 */
export function countTextFields(node) {
  if (!node || node.nodeType !== 1) return 0;
  let count = isTextField(node) ? 1 : 0;
  if (node.getElementsByTagName) {
    count += node.getElementsByTagName('input').length + node.getElementsByTagName('textarea').length;
  }
  return count;
}

/** 開始記錄；回傳 { snapshot, stop } */
export function startFocusRecorder(target) {
  const doc = target.document;
  const getStyle = (el) => target.getComputedStyle(el);
  const now = () => Math.round(target.performance.now());
  const clicks = createRing(10);
  const focusEvents = createRing();
  const keyEvents = createRing(20);
  const longTasks = createRing(20);
  const slowEvents = createRing(20);
  const fieldMutations = createRing();
  const cleanups = [];
  let fieldsAdded = 0;
  let fieldsRemoved = 0;

  const listen = (obj, type, fn, options = true) => {
    obj.addEventListener(type, fn, options);
    cleanups.push(() => obj.removeEventListener(type, fn, options));
  };

  listen(target, 'pointerdown', (e) => {
    const entry = {
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
  listen(doc, 'focusin', (e) => focusEvents.push({ t: now(), type: 'focusin', el: describeElement(e.target) }));
  listen(doc, 'focusout', (e) =>
    focusEvents.push({ t: now(), type: 'focusout', el: describeElement(e.target), to: describeElement(e.relatedTarget) }),
  );
  listen(target, 'focus', (e) => {
    if (e.target === target) focusEvents.push({ t: now(), type: 'window-focus' });
  });
  listen(target, 'blur', (e) => {
    if (e.target === target) focusEvents.push({ t: now(), type: 'window-blur' });
  });
  listen(doc, 'visibilitychange', () => focusEvents.push({ t: now(), type: `visibility-${doc.visibilityState}` }));
  listen(doc, 'compositionstart', (e) => focusEvents.push({ t: now(), type: 'ime-start', el: describeElement(e.target) }));
  listen(doc, 'compositionend', (e) => focusEvents.push({ t: now(), type: 'ime-end', el: describeElement(e.target) }));
  listen(target, 'keydown', (e) => {
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

  const observers = [];
  const observe = (type, options, fn) => {
    try {
      const observer = new target.PerformanceObserver((list) => list.getEntries().forEach(fn));
      observer.observe({ type, buffered: true, ...options });
      observers.push(observer);
    } catch {
      // 不支援這種紀錄就略過
    }
  };
  observe('longtask', {}, (entry) => longTasks.push({ t: Math.round(entry.startTime), ms: Math.round(entry.duration) }));
  observe('event', { durationThreshold: 100 }, (entry) =>
    slowEvents.push({
      t: Math.round(entry.startTime),
      name: entry.name,
      // 等主執行緒有空才開始處理的時間（畫面忙碌）
      waitMs: Math.round(entry.processingStart - entry.startTime),
      handlerMs: Math.round(entry.processingEnd - entry.processingStart),
      // 從按下到畫面更新的總時間
      totalMs: Math.round(entry.duration),
      el: describeElement(entry.target),
    }),
  );

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
export function installFocusDiagnostics(target) {
  const api = target?.electronAPI;
  if (typeof api?.onFocusDiagnosticsRequest !== 'function') return;
  let recorder = null;
  const setEnabled = (enabled) => {
    if (enabled && !recorder) recorder = startFocusRecorder(target);
    if (!enabled && recorder) {
      recorder.stop();
      recorder = null;
    }
  };
  api.onFocusDiagnosticsToggle((enabled) => setEnabled(enabled === true));
  api.onFocusDiagnosticsRequest((requestId) => {
    let result;
    try {
      result = recorder
        ? { recording: true, ...recorder.snapshot() }
        : {
            recording: false,
            hasFocus: target.document.hasFocus(),
            activeElement: describeElement(target.document.activeElement),
          };
    } catch (error) {
      result = { error: String(error?.message || error) };
    }
    api.sendFocusDiagnostics(requestId, result);
  });
  api
    .isFocusDiagnosticsEnabled()
    .then((enabled) => setEnabled(enabled === true))
    .catch(() => {});
}
