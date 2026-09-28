// Marie 主世界数据桥（manifest content_scripts, world: "MAIN", run_at: "document_start"）
//
// 背景：广东省民政局的站点大量使用内联 onclick 与 <a href="javascript:...">。
// 隔离世界的内容脚本点击这类元素会被扩展 CSP 拦，而页面定义的函数（如 changeWdrqxx）
// 在隔离世界也访问不到。原方案是把 onclick/href 里的代码字符串发给 background，
// 再由 chrome.scripting.executeScript 在主世界 eval —— 每次要三跳（SW 可能冷启动 100ms+），
// 且把用户配置插值进代码字符串存在引号注入隐患。
//
// 本桥改为：只接收**结构化数据**，不使用 eval，用原生 DOM / jQuery API 完成操作。
// 与隔离世界通过 window.postMessage 通信，省掉 background 往返。
//
// 安全：只接受 event.source === window 且带 __marie 命名空间与 id 的消息。
// 注意：页面自身的脚本也能监听到这些消息（含 fillFields 里的姓名/证件号），
// 但页面本身就是这些数据的接收方，不构成新增暴露面。

(function () {
  if (window.__marieBridgeInstalled) return; // 扩展重载后防重复注入
  window.__marieBridgeInstalled = true;

  var REQ = '__marie_req__';
  var RES = '__marie_res__';
  var READY = '__marie_ready__';
  var READY_ATTR = 'data-marie-bridge';

  // jQuery 是页面脚本，document_start 时尚未加载 —— 必须每次调用时惰性获取
  function jq() {
    return window.jQuery || window.$ || null;
  }

  function query(sel) {
    try {
      return document.querySelector(sel);
    } catch (e) {
      return null;
    }
  }

  // 转义属性选择器里的值
  function esc(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function errMsg(e) {
    return String((e && e.message) || e);
  }

  var OPS = {
    // 点击元素。优先用原生 .click()：由主世界派发的事件会正常执行页面自己的内联 handler。
    // 唯一例外是「只有 href="javascript:..." 且没有 onclick」的元素 ——
    // 主世界触发该导航仍可能被页面 CSP 拦，交回隔离世界走 background 兜底。
    click: function (p) {
      var el = query(p.sel);
      if (!el) return { ok: false, reason: 'not-found' };

      var href = el.getAttribute('href') || '';
      var hasOnclick = !!el.getAttribute('onclick');
      if (!hasOnclick && href.indexOf('javascript:') === 0) {
        var code = href.slice(11).trim();
        if (code && code !== 'void(0)') return { ok: false, reason: 'needsFallback' };
      }

      try {
        el.click();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'click-error', message: errMsg(e) };
      }
    },

    // 日期 + 城市三重设值后触发查询。
    // 站点用 jQuery('#yyrq').attr('value') 读日期（读 HTML 属性而非 DOM 属性），
    // 所以 setAttribute + attr + val 三步都不能少。
    setDateCity: function (p) {
      var date = p.date;
      var city = p.city;

      var d = document.getElementById('yyrq');
      if (d) {
        d.value = date;
        d.setAttribute('value', date);
      }
      var s = document.querySelector("select[name='blcs']");
      if (s) s.value = city;

      var j = jq();
      if (j) {
        j('#yyrq').attr('value', date);
        j('#yyrq').val(date);
        j("select[name='blcs']").val(city);
      }

      // 直接 click 查询按钮，让页面自己的内联 onclick（changeWdrqxx）执行
      var q = document.querySelector('a.querybtn');
      var triggered = false;
      if (q) {
        try {
          q.click();
          triggered = true;
        } catch (e) {
          /* 忽略：由隔离世界根据回读结果判断 */
        }
      }

      return { ok: true, hasDate: !!d, hasCity: !!s, queryTriggered: triggered };
    },

    // 选中 radio 并触发 jQuery 事件（站点靠 change 触发 AJAX 加载时段列表）。
    // 点击前重新 querySelector 取引用，避免列表被整块 innerHTML 重渲染后引用失效。
    selectRadio: function (p) {
      var sel = 'input[type="radio"][name="' + esc(p.name) + '"][value="' + esc(p.value) + '"]';
      var r = query(sel);
      if (!r) return { ok: false, reason: 'not-found' };

      try {
        r.checked = true;
        r.click();
        var j = jq();
        if (j) {
          j(r).trigger('change');
          j(r).trigger('click');
        }
        return { ok: true, checked: !!r.checked };
      } catch (e) {
        return { ok: false, reason: 'radio-error', message: errMsg(e) };
      }
    },

    // 逐字段填值。语义与原主世界代码完全一致：
    //  - 元素不存在 → missing
    //  - el.value 设不进（select 选项值不匹配）→ 用 jQuery .val() 兜底
    //  - 仍不相等 → failed
    //  - 有 jQuery 时 trigger('change')；仅当值非空才 trigger('blur')，避免空值触发站点校验弹窗
    fillFields: function (p) {
      var fields = p.fields || [];
      var filled = [];
      var failed = [];
      var missing = [];
      var j = jq();

      for (var i = 0; i < fields.length; i++) {
        var item = fields[i];
        try {
          var el = query(item.sel);
          if (!el) {
            missing.push(item.label);
            continue;
          }
          el.value = item.val;
          if (el.value !== item.val && j) {
            try {
              j(el).val(item.val);
            } catch (e) { /* 忽略 */ }
          }
          if (el.value !== item.val) {
            failed.push(item.label);
            continue;
          }
          if (j) {
            try {
              j(el).trigger('change');
            } catch (e) { /* 忽略 */ }
            if (item.val) {
              try {
                j(el).trigger('blur');
              } catch (e) { /* 忽略 */ }
            }
          }
          filled.push(item.label);
        } catch (e) {
          failed.push(item.label);
        }
      }

      var notifyOk = false;
      try {
        var r = document.querySelector('input[name="dxtzf"][value="' + esc(p.notifyValue) + '"]');
        if (r) {
          r.checked = true;
          r.click();
          if (j) {
            try {
              j(r).trigger('change');
            } catch (e) { /* 忽略 */ }
          }
          notifyOk = !!r.checked;
        } else {
          missing.push('通知方式');
        }
      } catch (e) {
        failed.push('通知方式');
      }

      return { ok: true, filled: filled, failed: failed, missing: missing, notifyOk: notifyOk };
    },
  };

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return; // 只接受同窗口消息（顺带过滤 iframe）
    var msg = ev.data;
    if (!msg || msg.__marie !== REQ) return; // 命名空间校验

    var res;
    try {
      var op = OPS[msg.op];
      res = op ? op(msg.payload || {}) : { ok: false, reason: 'unknown-op' };
    } catch (e) {
      res = { ok: false, reason: 'op-threw', message: errMsg(e) };
    }

    res.__marie = RES;
    res.id = msg.id;
    try {
      window.postMessage(res, '*');
    } catch (e) { /* 忽略 */ }
  }, false);

  // 就绪信号写在共享 DOM 上：两条 content_scripts 条目的注入顺序不保证，
  // 隔离世界读属性即可，无需依赖时序握手。
  function markReady() {
    if (!document.documentElement) return false;
    document.documentElement.setAttribute(READY_ATTR, '1');
    return true;
  }

  if (!markReady()) {
    document.addEventListener('readystatechange', function onState() {
      if (markReady()) document.removeEventListener('readystatechange', onState);
    }, false);
  }

  // postMessage 就绪通知仅作双保险（隔离世界若尚未挂监听会收不到，以 DOM 属性为准）
  try {
    window.postMessage({ __marie: READY }, '*');
  } catch (e) { /* 忽略 */ }
})();
