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

// 等待动态加载的元素出现（AJAX 渲染的 radio 等）
const waitForElement = (selector, timeout = 5000) => {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(check, 100);
    };
    check();
  });
};

// CSP 会拦截 javascript: URL 的导航，content script 隔离世界也访问不到页面的全局函数
// 通过 background 的 chrome.scripting 在页面主世界 eval 原始代码
const safeClick = (el) => {
  if (!el) return false;

  // 方式1：有 onclick 属性，提取代码在主世界 eval（隔离世界调 onclick 读不到 jQuery 状态）
  const onclickCode = el.getAttribute('onclick');
  if (onclickCode) {
    chrome.runtime.sendMessage({ action: 'EXEC_IN_PAGE', code: onclickCode });
    return true;
  }

  // 方式2：href="javascript:..." 提取代码，交由 background 在主世界 eval
  const href = el.getAttribute('href') || '';
  if (href.indexOf('javascript:') === 0) {
    const code = href.slice(11).trim();
    if (code && code !== 'void(0)') {
      chrome.runtime.sendMessage({ action: 'EXEC_IN_PAGE', code });
      return true;
    }
  }

  // 方式3：普通元素（input/button 等）直接 click
  el.click();
  return true;
};
const sendMessage = chrome.runtime.sendMessage;
const onMessage = chrome.runtime.onMessage;

const Page = {
  retryCount: 0,

  detectSessionTimeout() {
    // 用 innerText 而不是 textContent：
    // textContent 会把 <script> 标签里的 JS 字符串（如网站自己的 "会话超时" 提示代码）也算进去，造成误判
    // innerText 只包含渲染出来的可见文字
    var text = document.body ? document.body.innerText : '';
    var hasTimeout = text.indexOf('会话超时') >= 0;
    // 页面上存在预约表单元素，说明是正常页面，绝不判定为超时
    var hasForm = !!document.querySelector('#xmnan, #sfzjhmnan, #yyrq, input[name="djjg"], select[name="blcs"], input[name="dxtzf"]');
    if (hasTimeout) {
      console.log('[Marie] 可见文字含"会话超时", hasForm=', hasForm, 'URL=', window.location.href);
    }
    return hasTimeout && !hasForm;
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
    const button = find('a[href="/wsyy/yyjh.jsp"]');
    safeClick(button);
  },

  autoClickNextButton() {
    const nextButton = find('input[class="btn_1"]');
    safeClick(nextButton);
  },

  async autoFillTimeAndBase() {
    const dateVal = info.address.date;
    const cityVal = info.address.city;

    this.showInfoBar('正在设置日期和城市并查询...');

    await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'EXEC_IN_PAGE',
        code: `
          var d = document.getElementById('yyrq');
          if (d) {
            d.value = '${dateVal}';
            d.setAttribute('value', '${dateVal}');
          }
          var s = document.querySelector("select[name='blcs']");
          if (s) { s.value = '${cityVal}'; }
          var jq = window.jQuery || window.$;
          if (jq) {
            jq('#yyrq').attr('value', '${dateVal}');
            jq('#yyrq').val('${dateVal}');
            jq("select[name='blcs']").val('${cityVal}');
          }
          var q = document.querySelector('a.querybtn');
          if (q) {
            var oc = q.getAttribute('onclick');
            if (oc) { try { eval(oc); } catch(e) { console.error('query error:', e); } }
          }
        `
      }, () => resolve());
    });
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

  async autoFillOfficeAndTime() {
    await waitForElement('input[type="radio"][name="djjg"]', 10000);
    await new Promise(r => setTimeout(r, 500));

    const officeList = info.address.officeList;
    let selectedOffice = false;
    let selectedOfficeName = '';
    let selectedOfficeCode = '';

    for (let i = 0; i < officeList.length; i++) {
      const officeEditor = find(`input[type="radio"][name="djjg"][value="${officeList[i]}"]`);
      if (officeEditor && !officeEditor.disabled) {
        selectedOffice = true;
        selectedOfficeCode = officeList[i];
        var nameTd = find(`td[id="${officeList[i]}"]`);
        selectedOfficeName = nameTd ? nameTd.textContent.trim() : officeList[i];
        break;
      }
    }

    if (!selectedOffice) {
      const fallback = find('input[type="radio"][name="djjg"]:not([disabled])');
      if (fallback) {
        selectedOffice = true;
        selectedOfficeCode = fallback.value;
        var nameTd = find(`td[id="${fallback.value}"]`);
        selectedOfficeName = nameTd ? nameTd.textContent.trim() : fallback.value;
      }
    }

    if (!selectedOffice) {
      this.showStatusBar(false, '', false, '');
      if (info.retry.enabled && this.retryCount < info.retry.maxAttempts) {
        this.retryCount++;
        setTimeout(() => location.reload(), info.retry.interval);
      }
      return;
    }

    // 在主世界点击 radio 并触发 jQuery 事件，确保 AJAX 时间段加载
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'EXEC_IN_PAGE',
        code: `
          var r = document.querySelector('input[type="radio"][name="djjg"][value="${selectedOfficeCode}"]');
          if (r) {
            r.checked = true;
            r.click();
            var jq = window.jQuery || window.$;
            if (jq) { jq(r).trigger('change'); jq(r).trigger('click'); }
          }
        `
      }, () => resolve());
    });

    this.showInfoBar('已选网点: ' + selectedOfficeName + '，等待时间段加载...');

    // 选了网点后，时间段是 AJAX 动态加载的，需要等待
    await waitForElement('input[type="radio"][name="yysj"]', 15000);
    await new Promise(r => setTimeout(r, 800));

    const timeList = info.address.timeList;
    let selectedTime = false;
    let selectedTimeValue = '';
    let selectedTimeCode = '';

    for (let i = 0; i < timeList.length; i++) {
      const timeEditor = find(`input[type="radio"][name="yysj"][value="${timeList[i]}"]`);
      if (timeEditor && !timeEditor.disabled) {
        selectedTime = true;
        selectedTimeValue = timeList[i];
        selectedTimeCode = timeList[i];
        break;
      }
    }

    if (!selectedTime) {
      const fallback = find('input[type="radio"][name="yysj"]:not([disabled])');
      if (fallback) {
        selectedTime = true;
        selectedTimeValue = fallback.value;
        selectedTimeCode = fallback.value;
      }
    }

    // 在主世界点击时间 radio
    if (selectedTimeCode) {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'EXEC_IN_PAGE',
          code: `
            var r = document.querySelector('input[type="radio"][name="yysj"][value="${selectedTimeCode}"]');
            if (r) {
              r.checked = true;
              r.click();
              var jq = window.jQuery || window.$;
              if (jq) { jq(r).trigger('change'); jq(r).trigger('click'); }
            }
          `
        }, () => resolve());
      });
    }

    this.showStatusBar(selectedOffice, selectedOfficeName, selectedTime, selectedTimeValue);

    if (selectedOffice && selectedTime) {
      chrome.storage.sync.set({
        marieLastSelect: {
          office: selectedOfficeName,
          time: selectedTimeValue,
          date: info.address.date,
          ts: Date.now(),
        }
      });
      await new Promise(r => setTimeout(r, 3000));
      const nextButton = find('input[class="btn_1"]');
      safeClick(nextButton);
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
    // 等真实页面框架完成初始化再设值
    await new Promise(r => setTimeout(r, 500));

    var notifyValue = info.notifyValue;
    var hasPhone = !!(m.phone.value || f.phone.value);

    // 在主世界逐字段设值，每个字段独立 try/catch，并把 成功/失败/缺失 结果写回页面顶部状态栏
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'EXEC_IN_PAGE',
        code: `
          (function(){
            var filled = [], failed = [], missing = [];
            var jq = window.jQuery || window.$;
            var fields = [
              {sel: '#xmnan', val: '${m.name.value}', label: '男方姓名'},
              {sel: '#sfzjhmnan', val: '${m.id.value}', label: '男方证件号'},
              {sel: '#whcdnan', val: '${m.degree.value}', label: '男方文化程度'},
              {sel: '#zynan', val: '${m.job.value}', label: '男方职业'},
              {sel: '#lxdhnan', val: '${m.phone.value}', label: '男方手机号'},
              {sel: '#xmnv', val: '${f.name.value}', label: '女方姓名'},
              {sel: '#sfzjhmnv', val: '${f.id.value}', label: '女方证件号'},
              {sel: '#whcdnv', val: '${f.degree.value}', label: '女方文化程度'},
              {sel: '#zynv', val: '${f.job.value}', label: '女方职业'},
              {sel: '#lxdhnv', val: '${f.phone.value}', label: '女方手机号'},
            ];
            for (var i = 0; i < fields.length; i++) {
              var item = fields[i];
              try {
                var el = document.querySelector(item.sel);
                if (!el) { missing.push(item.label); continue; }
                el.value = item.val;
                // select 下拉框若选项值不匹配，el.value 会设不进去
                if (el.value !== item.val && jq) {
                  try { jq(el).val(item.val); } catch(e) {}
                }
                if (el.value !== item.val) { failed.push(item.label); continue; }
                if (jq) {
                  try { jq(el).trigger('change'); } catch(e) {}
                  // 仅对有值的字段触发 blur，避免空值校验弹窗
                  if (item.val) { try { jq(el).trigger('blur'); } catch(e) {} }
                }
                filled.push(item.label);
              } catch (e) {
                failed.push(item.label);
              }
            }
            var notifyOk = false;
            try {
              var r = document.querySelector('input[name="dxtzf"][value="${notifyValue}"]');
              if (r) {
                r.checked = true;
                r.click();
                if (jq) { try { jq(r).trigger('change'); } catch(e) {} }
                notifyOk = r.checked;
              } else {
                missing.push('通知方式');
              }
            } catch(e) { failed.push('通知方式'); }

            var okAll = missing.length === 0 && failed.length === 0;
            try {
              var old = document.getElementById('marie-status');
              if (old) old.remove();
              var bar = document.createElement('div');
              bar.id = 'marie-status';
              bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;padding:8px 16px;font-size:13px;color:#fff;background:' + (okAll ? '#4CAF50' : '#FF9800') + ';';
              bar.textContent = 'Marie | 已填 ' + filled.length + '/10' +
                (failed.length ? ' | 设置失败: ' + failed.join('、') : '') +
                (missing.length ? ' | 未找到: ' + missing.join('、') : '') +
                ' | 通知方式: ' + (notifyOk ? '已选' : '未选');
              document.body.appendChild(bar);
            } catch(e) {}
            console.log('[Marie page4] filled=', filled, 'failed=', failed, 'missing=', missing, 'notifyOk=', notifyOk);
          })();
        `
      }, () => resolve());
    });

    // 获取验证码：仅在配置了手机号时才点，避免真实页面弹"请输入手机号"卡住
    setTimeout(() => {
      if (!hasPhone) {
        this.appendInfoBar('未配置手机号，未自动点击"获取验证码"');
        return;
      }
      const getCodeButton = find('#sms_get');
      if (getCodeButton) {
        safeClick(getCodeButton);
      } else {
        this.appendInfoBar('未找到获取验证码按钮(#sms_get)');
      }
    }, 800);
  },

  bindEvent: function() {
    const that = this;
    const onPageLoad = () => {
      document.documentElement.setAttribute('data-marie', 'loaded');
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
      console.log('[Marie] 收到消息:', action);
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
    this.bindEvent();
  },
};

Page.init();
