const DEFAULT_INFO = {
  maleInfo: {
    name: { value: '', editor: '#xmnan', },
    id: { value: '', editor: '#sfzjhmnan', },
    degree: { value: '大学', editor: '#whcdnan', },
    job: { value: '专业技术人员', editor: '#zynan', },
    phone: { value: '', editor: '#lxdhnan', },
  },

  femaleInfo: {
    name: { value: '', editor: '#xmnv', },
    id: { value: '', editor: '#sfzjhmnv', },
    degree: { value: '大学', editor: '#whcdnv', },
    job: { value: '其他从业人员', editor: '#zynv', },
    phone: { value: '', editor: '#lxdhnv', },
  },

  address: {
    date: '2026-10-18',
    city: '440300000000',
    officeList: ['4403040A1000'],
    timeList: [
      '9:00-10:00', '10:00-11:00', '11:00-11:30',
      '13:00-13:30', '13:30-14:00', '14:00-14:30',
      '14:30-15:30', '15:30-16:30',
    ],
  },

  // 深圳市各区婚姻登记处代码 → 名称
  officeNames: {
    '4403100A1000': '深圳市坪山区民政局婚姻登记处',
    '4403980A1000': '深圳市深汕特别合作区婚姻登记处',
    '4403070A1000': '龙岗区民政局婚姻登记处',
    '4403110A1000': '深圳市光明区民政局婚姻登记处',
    '4403050A1000': '南山区民政局婚姻登记处',
    '4403960A1000': '深圳市大鹏新区婚姻登记处',
    '4403060A1000': '宝安区民政局婚姻登记处',
    '4403090A1000': '深圳市龙华区民政局婚姻登记处',
    '4403080A1000': '盐田区民政局婚姻登记处',
    '4403030A1000': '罗湖区民政局婚姻登记处',
    '4403040A1000': '深圳市福田区民政局婚姻登记处',
  },

  notifyValue: '01',

  // 点「下一步」前的确认延时(ms)：先等页面回显所选网点/时段，最多等这么久
  confirmDelay: 1000,

  retry: {
    enabled: true,
    interval: 800,
    maxAttempts: 30,
  },
};

let info = DEFAULT_INFO;
let configLoaded = false;
const configReady = new Promise((resolve) => {
  chrome.storage.sync.get({ marieConfig: null }, (data) => {
    if (data.marieConfig) {
      const cfg = data.marieConfig;
      info = {
        maleInfo: {
          name: { value: cfg.mName || '', editor: '#xmnan' },
          id: { value: cfg.mId || '', editor: '#sfzjhmnan' },
          degree: { value: cfg.mDegree || '大学', editor: '#whcdnan' },
          job: { value: cfg.mJob || '专业技术人员', editor: '#zynan' },
          phone: { value: cfg.mPhone || '', editor: '#lxdhnan' },
        },
        femaleInfo: {
          name: { value: cfg.fName || '', editor: '#xmnv' },
          id: { value: cfg.fId || '', editor: '#sfzjhmnv' },
          degree: { value: cfg.fDegree || '大学', editor: '#whcdnv' },
          job: { value: cfg.fJob || '其他从业人员', editor: '#zynv' },
          phone: { value: cfg.fPhone || '', editor: '#lxdhnv' },
        },
        address: {
          date: cfg.date || DEFAULT_INFO.address.date,
          city: cfg.city || DEFAULT_INFO.address.city,
          officeList: (cfg.offices || '4403040A1000').split(',').map(s => s.trim()).filter(Boolean),
          timeList: (cfg.times || '').split(',').map(s => s.trim()).filter(Boolean),
        },
        officeNames: DEFAULT_INFO.officeNames,
        notifyValue: cfg.notifyValue || '01',
        confirmDelay: cfg.confirmDelay || DEFAULT_INFO.confirmDelay,
        retry: {
          enabled: true,
          interval: cfg.retryInterval || 800,
          maxAttempts: cfg.retryMax || 30,
        },
      };
    }
    configLoaded = true;
    resolve();
  });
});

// https://www.gdhy.gov.cn/yyjh.do?do=preYyxxOper&yyrq=2022-05-19&djjg=4403040A1000&yysj=16:30-17:00&ydbllx=01

const find = (selector) => {
  const el = document.querySelector(selector);
  return el;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 计时打点：便于量化各阶段耗时（控制台过滤 [Marie][t]） ----
const T0 = performance.now();
const mark = (label, extra) => {
  const dt = Math.round(performance.now() - T0);
  console.log('[Marie][t] ' + label + ' +' + dt + 'ms' + (extra ? ' ' + extra : ''));
};

// 等待元素出现并满足条件。用 MutationObserver 替代 100ms 轮询，
// 检测延迟从平均 ~50ms 降到亚帧级（DOM 变更后在本次任务内即回调）。
const waitFor = (selector, predicate, timeout = 5000) => {
  return new Promise((resolve) => {
    const ok = (el) => !!el && (!predicate || predicate(el));

    const first = document.querySelector(selector);
    if (ok(first)) return resolve(first);

    let done = false;
    let obs = null;
    let timer = null;

    const cleanup = () => {
      if (obs) obs.disconnect();
      if (timer) clearTimeout(timer);
      document.removeEventListener('DOMContentLoaded', onDom, false);
    };
    const finish = (el) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(el);
    };
    const onDom = () => {
      const el = document.querySelector(selector);
      if (ok(el)) finish(el);
    };

    // attributeFilter 只盯 disabled：目标 radio 由 disabled → 可选时也能及时捕获
    obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (ok(el)) finish(el);
    });
    obs.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });
    document.addEventListener('DOMContentLoaded', onDom, false);

    timer = setTimeout(() => finish(null), timeout);
  });
};

// ---- 主世界数据桥（见 src/content_scripts/bridge.js） ----
// 隔离世界点击内联 onclick / javascript: 元素会被扩展 CSP 拦，也访问不到页面定义的函数。
// 旧方案是把代码字符串发给 background 再用 scripting.executeScript 在主世界 eval（三跳）。
// 桥改为 postMessage 直连 + 结构化数据，省掉 background 往返，也不再需要 eval。
const BRIDGE_REQ = '__marie_req__';
const BRIDGE_RES = '__marie_res__';
const BRIDGE_READY_ATTR = 'data-marie-bridge';

let bridgeSeq = 0;
const bridgePending = new Map();

window.addEventListener('message', (ev) => {
  if (ev.source !== window) return; // 只接受同窗口回包
  const msg = ev.data;
  if (!msg || msg.__marie !== BRIDGE_RES) return; // 命名空间校验
  const settle = bridgePending.get(msg.id);
  if (!settle) return;
  bridgePending.delete(msg.id);
  settle(msg);
}, false);

const bridgeReady = () => {
  const root = document.documentElement;
  return !!(root && root.getAttribute(BRIDGE_READY_ATTR) === '1');
};

// 桥的就绪标记写在共享 DOM 上，不依赖两条 content_scripts 条目的注入顺序
const waitBridgeReady = (timeout) => {
  return new Promise((resolve) => {
    if (bridgeReady()) return resolve(true);

    let done = false;
    let obs = null;
    let timer = null;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (obs) obs.disconnect();
      if (timer) clearTimeout(timer);
      resolve(v);
    };

    if (document.documentElement) {
      obs = new MutationObserver(() => {
        if (bridgeReady()) finish(true);
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: [BRIDGE_READY_ATTR] });
    }
    timer = setTimeout(() => finish(bridgeReady()), timeout);
  });
};

// 桥没随 manifest 注入时（老版本 Chrome 等），让 background 用 scripting 补注一次
const injectBridgeViaBackground = () => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'INJECT_BRIDGE' }, () => resolve());
  });
};

const postToBridge = (op, payload, timeout) => {
  return new Promise((resolve) => {
    const id = ++bridgeSeq;
    const timer = setTimeout(() => {
      bridgePending.delete(id);
      resolve(null);
    }, timeout);

    bridgePending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });

    try {
      window.postMessage({ __marie: BRIDGE_REQ, id: id, op: op, payload: payload }, '*');
    } catch (e) {
      clearTimeout(timer);
      bridgePending.delete(id);
      resolve(null);
    }
  });
};

// 调用主世界操作。返回 {ok:true,...} / {ok:false,reason} / null（桥完全不可用）
const callMainWorld = async (op, payload, timeout = 1500) => {
  let ready = await waitBridgeReady(600);
  if (!ready) {
    mark('主世界桥未就绪，补注一次');
    await injectBridgeViaBackground();
    ready = await waitBridgeReady(1500);
  }
  if (!ready) {
    console.warn('[Marie] 主世界桥不可用，无法执行:', op);
    return null;
  }
  return postToBridge(op, payload, timeout);
};

// 旧路径兜底：把代码字符串交给 background 在主世界 eval
const execCodeInPage = (code) => {
  chrome.runtime.sendMessage({ action: 'EXEC_IN_PAGE', code: code });
};

const extractClickCode = (el) => {
  if (!el) return null;
  const onclickCode = el.getAttribute('onclick');
  if (onclickCode) return onclickCode;

  const href = el.getAttribute('href') || '';
  if (href.indexOf('javascript:') === 0) {
    const code = href.slice(11).trim();
    if (code && code !== 'void(0)') return code;
  }
  return null;
};

// 点击元素。优先走主世界桥（无 background 往返）；
// 桥不可用、或元素只有 href="javascript:..."（主世界触发该导航可能被页面 CSP 拦）时回退旧路径。
const safeClickSelector = async (selector) => {
  const el = document.querySelector(selector);
  if (!el) return false;

  const res = await callMainWorld('click', { sel: selector });
  if (res && res.ok) return true;

  const code = extractClickCode(el);
  if (code) {
    execCodeInPage(code);
    return true;
  }

  try {
    el.click();
    return true;
  } catch (e) {
    return false;
  }
};

const sendMessage = chrome.runtime.sendMessage;
const onMessage = chrome.runtime.onMessage;

const Page = {
  retryCount: 0,

  detectSessionTimeout() {
    // 先做廉价的表单元素探测：只要页面存在预约表单元素，就一定是正常页面，立即早退。
    // （原顺序是先算 document.body.innerText 强制布局重排、再查表单，白付一次重排开销）
    var hasForm = !!document.querySelector('#xmnan, #sfzjhmnan, #yyrq, input[name="djjg"], select[name="blcs"], input[name="dxtzf"]');
    if (hasForm) return false;

    // 用 innerText 而不是 textContent：
    // textContent 会把 <script> 标签里的 JS 字符串（如网站自己的 "会话超时" 提示代码）也算进去，造成误判
    // innerText 只包含渲染出来的可见文字
    var text = document.body ? document.body.innerText : '';
    var hasTimeout = text.indexOf('会话超时') >= 0;
    if (hasTimeout) {
      console.log('[Marie] 可见文字含"会话超时", URL=', window.location.href);
    }
    return hasTimeout;
  },

  redirectToHome() {
    this.showSessionErrorBar();
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'REDIRECT_HOME' });
    }, 2000);
  },

  showSessionErrorBar() {
    var old = document.getElementById('marie-status');
    if (old) old.remove();
    var bar = document.createElement('div');
    bar.id = 'marie-status';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;padding:10px 16px;font-size:14px;color:#fff;background:#f44336;text-align:center;';
    bar.textContent = 'Marie | 会话超时，正在返回首页重新开始...';
    document.body.appendChild(bar);
  },

  autoClickEntryButton() {
    mark('Page1 点击入口');
    safeClickSelector('a[href="/wsyy/yyjh.jsp"]');
  },

  autoClickNextButton() {
    mark('Page2 点击下一步');
    safeClickSelector('input[class="btn_1"]');
  },

  async autoFillTimeAndBase() {
    const dateVal = info.address.date;
    const cityVal = info.address.city;

    this.showInfoBar('正在设置日期和城市并查询...');
    mark('Page3 开始');

    // 等表单渲染出来再设值：否则会静默失败，站点随后自己弹 alert() 冻结页面
    const dateEl = await waitFor('#yyrq', null, 5000);
    if (!dateEl) {
      this.showInfoBar('未找到预约日期输入框(#yyrq)，已停止查询以避免页面弹窗卡死', '#f44336');
      mark('Page3 中止：未找到 #yyrq');
      return;
    }

    const res = await callMainWorld('setDateCity', { date: dateVal, city: cityVal });
    mark('Page3 设值并触发查询', res ? JSON.stringify(res) : '(桥不可用)');

    if (!res || !res.ok) {
      this.showInfoBar('设置日期/城市失败：' + (res ? res.reason : '主世界桥不可用，请重新加载扩展'), '#f44336');
    }
  },

  showInfoBar(text, color) {
    var old = document.getElementById('marie-status');
    if (old) old.remove();
    var bar = document.createElement('div');
    bar.id = 'marie-status';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;padding:8px 16px;font-size:13px;color:#fff;background:' + (color || '#2196F3') + ';';
    bar.textContent = 'Marie | ' + text;
    document.body.appendChild(bar);
  },

  appendInfoBar(text) {
    var bar = document.getElementById('marie-status');
    if (bar) {
      bar.textContent += ' | ' + text;
    } else {
      this.showInfoBar(text);
    }
  },

  // 等页面把所选网点/时段回显出来（真实站点若没有这些回显元素，则自然等满超时）
  waitSelectionEcho(timeout) {
    return new Promise((resolve) => {
      const check = () => {
        const o = document.getElementById('selOffice');
        const t = document.getElementById('selTime');
        return !!((o && o.textContent.trim()) || (t && t.textContent.trim()));
      };

      if (check()) return resolve(true);

      let done = false;
      let obs = null;
      const finish = (v) => {
        if (done) return;
        done = true;
        if (obs) obs.disconnect();
        clearTimeout(timer);
        resolve(v);
      };

      const root = document.body || document.documentElement;
      if (root) {
        obs = new MutationObserver(() => {
          if (check()) finish(true);
        });
        obs.observe(root, { childList: true, subtree: true, characterData: true });
      }
      const timer = setTimeout(() => finish(false), timeout);
    });
  },

  // 点「下一步」前的确认等待：先等页面回显所选网点/时段（通常 <200ms），
  // 最多等到 confirmDelay（可配置），并保证至少 settle 200ms 给站点自己的事件处理留时间。
  async waitConfirmReady() {
    const delay = Math.max(200, info.confirmDelay || 1000);
    const minSettle = 200;
    const started = Date.now();

    const echoed = await Promise.race([
      this.waitSelectionEcho(delay),
      sleep(delay).then(() => false),
    ]);

    const elapsed = Date.now() - started;
    if (elapsed < minSettle) await sleep(minSettle - elapsed);

    mark('Page5 确认等待结束', 'echo=' + echoed + ' 用时 ' + (Date.now() - started) + 'ms');
  },

  async autoFillOfficeAndTime() {
    mark('Page5 开始');
    await waitFor('input[type="radio"][name="djjg"]', null, 10000);
    mark('Page5 网点列表就绪');

    const officeList = info.address.officeList;
    let selectedOfficeCode = '';
    let selectedOfficeName = '';

    // 配置的网点按优先级取第一个可用
    for (let i = 0; i < officeList.length; i++) {
      const el = find(`input[type="radio"][name="djjg"][value="${officeList[i]}"]`);
      if (el && !el.disabled) {
        selectedOfficeCode = officeList[i];
        break;
      }
    }

    if (!selectedOfficeCode) {
      const fallback = find('input[type="radio"][name="djjg"]:not([disabled])');
      if (fallback) selectedOfficeCode = fallback.value;
    }

    if (!selectedOfficeCode) {
      this.showStatusBar(false, '', false, '');
      if (info.retry.enabled && this.retryCount < info.retry.maxAttempts) {
        this.retryCount++;
        setTimeout(() => location.reload(), info.retry.interval);
      }
      return;
    }

    const nameTd = find(`td[id="${selectedOfficeCode}"]`);
    selectedOfficeName = nameTd ? nameTd.textContent.trim() : selectedOfficeCode;

    const officeRes = await callMainWorld('selectRadio', { name: 'djjg', value: selectedOfficeCode });
    mark('Page5 网点已选', selectedOfficeName + ' ' + (officeRes ? JSON.stringify(officeRes) : '(桥不可用)'));

    if (!officeRes || !officeRes.ok) {
      this.showInfoBar('选中网点失败：' + (officeRes ? officeRes.reason : '主世界桥不可用，请重新加载扩展'), '#f44336');
      return;
    }

    this.showInfoBar('已选网点: ' + selectedOfficeName + '，等待时间段加载...');

    // 时段是选网点后 AJAX 动态加载的。
    // 原来做法是「等任意时段出现 + 固定睡 800ms」，既慢又可能在目标时段渲染出来前退化成 fallback；
    // 现在改为直接等「配置里的目标时段」出现且可选。
    const timeList = info.address.timeList;
    let targetTime = '';

    for (let i = 0; i < timeList.length; i++) {
      const el = find(`input[type="radio"][name="yysj"][value="${timeList[i]}"]`);
      if (el && !el.disabled) {
        targetTime = timeList[i];
        break;
      }
    }

    if (!targetTime && timeList.length) {
      await waitFor(
        `input[type="radio"][name="yysj"][value="${timeList[0]}"]`,
        (el) => !el.disabled,
        15000
      );
      mark('Page5 目标时段出现');
      for (let i = 0; i < timeList.length; i++) {
        const el = find(`input[type="radio"][name="yysj"][value="${timeList[i]}"]`);
        if (el && !el.disabled) {
          targetTime = timeList[i];
          break;
        }
      }
    }

    if (!targetTime) {
      // 配置的时段都没渲染出来 → 退化到第一个可用时段
      const fallback = find('input[type="radio"][name="yysj"]:not([disabled])');
      if (fallback) targetTime = fallback.value;
    }

    let selectedTime = false;
    if (targetTime) {
      const timeRes = await callMainWorld('selectRadio', { name: 'yysj', value: targetTime });
      selectedTime = !!(timeRes && timeRes.ok && timeRes.checked);
      mark('Page5 时段已选', targetTime + ' ' + (timeRes ? JSON.stringify(timeRes) : '(桥不可用)'));
    }

    this.showStatusBar(true, selectedOfficeName, selectedTime, targetTime);

    if (selectedTime) {
      chrome.storage.sync.set({
        marieLastSelect: {
          office: selectedOfficeName,
          time: targetTime,
          date: info.address.date,
          ts: Date.now(),
        }
      });

      await this.waitConfirmReady();

      // 点「下一步」前断言两个 radio 都已登记选中：
      // 否则站点会自己弹 alert("请选择办理网点/时间段") 冻结页面
      const officeChecked = find('input[name="djjg"]:checked');
      const timeChecked = find('input[name="yysj"]:checked');
      if (!officeChecked || !timeChecked) {
        this.showInfoBar('网点/时段未登记选中，已跳过点击「下一步」', '#f44336');
        mark('Page5 中止：未登记选中');
        return;
      }

      mark('Page5 点击下一步');
      await safeClickSelector('input[class="btn_1"]');
      return;
    }

    if (info.retry.enabled && this.retryCount < info.retry.maxAttempts) {
      this.retryCount++;
      setTimeout(() => location.reload(), info.retry.interval);
    }
  },

  showStatusBar(selectedOffice, officeName, selectedTime, timeValue) {
    var old = document.getElementById('marie-status');
    if (old) old.remove();

    var bar = document.createElement('div');
    bar.id = 'marie-status';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;padding:8px 16px;font-size:13px;color:#fff;display:flex;align-items:center;gap:12px;';

    var officeText = selectedOffice ? '网点: ' + officeName : '网点: 未选到';
    var timeText = selectedTime ? '时间: ' + timeValue : '时间: 未选到';

    bar.style.background = (selectedOffice && selectedTime) ? '#4CAF50' : '#f44336';
    bar.textContent = 'Marie | ' + officeText + ' | ' + timeText;
    if (!selectedOffice || !selectedTime) {
      bar.textContent += ' | 重试中... (' + (this.retryCount + 1) + '/' + info.retry.maxAttempts + ')';
    }

    document.body.appendChild(bar);
  },

  showLastSelectBar() {
    // 先从 URL 提取选择信息（preYyxxOper 页面 URL 带参数）
    var params = new URLSearchParams(window.location.search);
    var urlDate = params.get('yyrq');
    var urlOffice = params.get('djjg');
    var urlTime = params.get('yysj');

    if (urlDate && urlOffice && urlTime) {
      var officeName = (info.officeNames && info.officeNames[urlOffice]) || urlOffice;
      var nameTd = find('td[id="' + urlOffice + '"]');
      if (nameTd) officeName = nameTd.textContent.trim();

      var old = document.getElementById('marie-last-select');
      if (old) old.remove();
      var bar = document.createElement('div');
      bar.id = 'marie-last-select';
      bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:999999;padding:8px 16px;font-size:13px;color:#fff;background:#4CAF50;';
      bar.textContent = 'Marie | 已选: ' + officeName + ' | ' + urlTime + ' | ' + urlDate;
      document.body.appendChild(bar);
      return;
    }

    // 否则从 storage 读取
    chrome.storage.sync.get({ marieLastSelect: null }, (data) => {
      if (!data.marieLastSelect) return;
      var s = data.marieLastSelect;
      if (Date.now() - s.ts > 600000) return;
      var old = document.getElementById('marie-last-select');
      if (old) old.remove();
      var bar = document.createElement('div');
      bar.id = 'marie-last-select';
      bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:999999;padding:6px 16px;font-size:12px;color:#fff;background:#333;';
      bar.textContent = 'Marie | 已选: ' + s.office + ' | ' + s.time + ' | ' + s.date;
      document.body.appendChild(bar);
    });
  },

  async autoFillCoupleInfoForm() {
    var m = info.maleInfo;
    var f = info.femaleInfo;

    // 核心信息未配置时立即停止：用空值触发真实页面的校验事件，
    // 老式政务网站会弹 alert() 冻结页面（表现为"卡死"）
    var missingCfg = [];
    if (!m.name.value) missingCfg.push('男方姓名');
    if (!m.id.value) missingCfg.push('男方证件号');
    if (!f.name.value) missingCfg.push('女方姓名');
    if (!f.id.value) missingCfg.push('女方证件号');
    if (missingCfg.length) {
      this.showInfoBar('配置不完整，缺少: ' + missingCfg.join('、') + '。请点击插件图标补全并保存后再试', '#f44336');
      return;
    }

    this.showInfoBar('正在填写双方信息...');
    mark('Page4 开始填表');

    // 等表单渲染出来再填（原来是固定 sleep 500ms）
    const formEl = await waitFor('#xmnan', null, 5000);
    if (!formEl) {
      this.showInfoBar('未找到双方信息表单(#xmnan)，已停止填写', '#f44336');
      mark('Page4 中止：未找到表单');
      return;
    }
    mark('Page4 表单就绪');

    var notifyValue = info.notifyValue;
    var hasPhone = !!(m.phone.value || f.phone.value);

    // 结构化传参（不再把用户配置插值进代码字符串，消除引号注入/语法错误隐患）
    var fields = [
      { sel: '#xmnan', val: m.name.value, label: '男方姓名' },
      { sel: '#sfzjhmnan', val: m.id.value, label: '男方证件号' },
      { sel: '#whcdnan', val: m.degree.value, label: '男方文化程度' },
      { sel: '#zynan', val: m.job.value, label: '男方职业' },
      { sel: '#lxdhnan', val: m.phone.value, label: '男方手机号' },
      { sel: '#xmnv', val: f.name.value, label: '女方姓名' },
      { sel: '#sfzjhmnv', val: f.id.value, label: '女方证件号' },
      { sel: '#whcdnv', val: f.degree.value, label: '女方文化程度' },
      { sel: '#zynv', val: f.job.value, label: '女方职业' },
      { sel: '#lxdhnv', val: f.phone.value, label: '女方手机号' },
    ];

    var res = await callMainWorld('fillFields', { fields: fields, notifyValue: notifyValue });
    mark('Page4 填表完成', res ? ('已填 ' + res.filled.length + '/10') : '(桥不可用)');

    if (!res || !res.ok) {
      this.showInfoBar('填写失败：' + (res ? res.reason : '主世界桥不可用，请重新加载扩展'), '#f44336');
      return;
    }

    // 结果状态栏改在隔离世界渲染（DOM 两世界共享），省掉一次主世界往返
    var okAll = res.missing.length === 0 && res.failed.length === 0;
    this.showInfoBar(
      '已填 ' + res.filled.length + '/10' +
      (res.failed.length ? ' | 设置失败: ' + res.failed.join('、') : '') +
      (res.missing.length ? ' | 未找到: ' + res.missing.join('、') : '') +
      ' | 通知方式: ' + (res.notifyOk ? '已选' : '未选'),
      okAll ? '#4CAF50' : '#FF9800'
    );

    // 获取验证码：仅在配置了手机号时才点，避免真实页面弹"请输入手机号"卡住
    if (!hasPhone) {
      this.appendInfoBar('未配置手机号，未自动点击"获取验证码"');
      return;
    }

    // 原来是固定 setTimeout 800ms，改为等按钮出现就点
    const smsBtn = await waitFor('#sms_get', null, 3000);
    if (smsBtn) {
      await safeClickSelector('#sms_get');
      mark('Page4 已点获取验证码');
    } else {
      this.appendInfoBar('未找到获取验证码按钮(#sms_get)');
    }
  },

  bindEvent: function() {
    const that = this;
    const onPageLoad = () => {
      document.documentElement.setAttribute('data-marie', 'loaded');
      mark('load 事件');
      console.log('[Marie] 页面加载完成, URL=', window.location.href);
      var isTimeout = false;
      try {
        isTimeout = that.detectSessionTimeout();
      } catch (e) {
        console.error('[Marie] detectSessionTimeout 出错(忽略,继续正常流程):', e);
      }
      if (isTimeout) {
        console.log('[Marie] 判定为会话超时页,将跳回首页');
        that.redirectToHome();
        return;
      }
      try {
        that.showLastSelectBar();
      } catch (e) {
        console.error('[Marie] showLastSelectBar 出错(忽略):', e);
      }
      console.log('[Marie] 发送 PAGE_LOAD 到 background');
      sendMessage({ action: 'PAGE_LOAD' });
      document.documentElement.setAttribute('data-marie', 'page-load-sent');
    };

    // 如果页面已经加载完（脚本注入晚了），立即执行；否则等 load 事件
    if (document.readyState === 'complete') {
      onPageLoad();
    } else {
      window.addEventListener('load', onPageLoad, false);
    }

    onMessage.addListener(function(req, sender, sendResponse) {
      const { action } = req;
      mark('收到消息', action);
      if (action === 'FILL_PAGE_1') {
        sendResponse('ok');
        that.autoClickEntryButton();
      } else if (action === 'FILL_PAGE_2') {
        sendResponse('ok');
        that.autoClickNextButton();
      } else if (action === 'FILL_PAGE_3') {
        sendResponse('ok');
        configReady.then(() => that.autoFillTimeAndBase());
      } else if (action === 'FILL_PAGE_4') {
        sendResponse('ok');
        that.showInfoBar('收到填写指令，正在加载配置...');
        configReady.then(() => that.autoFillCoupleInfoForm());
      } else if (action === 'FILL_PAGE_5') {
        sendResponse('ok');
        configReady.then(() => that.autoFillOfficeAndTime());
      } else {
        sendResponse('unknown action');
      }
    });
  },

  init: function() {
    // 跨世界可见的注入标记（模拟站诊断角标用）
    document.documentElement.setAttribute('data-marie', 'injected');
    mark('content script 注入');
    this.bindEvent();
  },
};

Page.init();
