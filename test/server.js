// Marie 本地模拟测试站
// 复刻 gdhy.gov.cn 预约流程 5 个页面的 DOM 结构和关键行为，用于安全地自动化测试插件
// 启动: node test/server.js  然后打开 http://localhost:8899
const http = require('http');
const PORT = 8899;

const STYLE = '<style>body{font-family:"Microsoft YaHei",sans-serif;margin:0;background:#f5f5f5;}header{background:#2c5aa0;color:#fff;padding:12px 24px;font-size:18px;}.page{max-width:900px;margin:24px auto;background:#fff;padding:24px;border-radius:6px;}table{border-collapse:collapse;width:100%;margin:12px 0;}th,td{border:1px solid #ddd;padding:6px 10px;font-size:13px;text-align:center;}th{background:#eef3fa;}.steps{color:#888;font-size:13px;margin-bottom:16px;}.steps b{color:#2c5aa0;}.note{background:#fff8e1;border:1px solid #ffe082;padding:8px 12px;font-size:12px;color:#795548;margin:12px 0;}#testResult{margin-top:16px;padding:12px;color:#fff;font-size:14px;border-radius:4px;background:#9e9e9e;}input[type=text],select{padding:4px 8px;margin:4px 0;}.btn_1{background:#2c5aa0;color:#fff;border:none;padding:8px 24px;cursor:pointer;margin-top:12px;}.querybtn{color:#5599ff;cursor:pointer;text-decoration:none;font-size:13px;}</style>';

function jqueryStub() {
  return [
    '(function(){',
    '  function J(sel){',
    '    if (typeof sel !== "string") { this.els = sel ? [sel] : []; }',
    '    else { this.els = Array.prototype.slice.call(document.querySelectorAll(sel)); }',
    '  }',
    '  J.prototype.val = function(v){',
    '    if (v === undefined) return this.els[0] ? this.els[0].value : undefined;',
    '    this.els.forEach(function(el){ el.value = v; });',
    '    return this;',
    '  };',
    '  J.prototype.attr = function(name, v){',
    '    if (v === undefined) return this.els[0] ? this.els[0].getAttribute(name) : undefined;',
    '    this.els.forEach(function(el){ el.setAttribute(name, v); });',
    '    return this;',
    '  };',
    '  J.prototype.trigger = function(type){',
    '    this.els.forEach(function(el){ el.dispatchEvent(new Event(type, { bubbles: true })); });',
    '    return this;',
    '  };',
    '  var $ = function(sel){ return new J(sel); };',
    '  window.jQuery = $;',
    '  window.$ = $;',
    '})();',
  ].join('\n');
}

function homePage() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>模拟首页</title>' + STYLE + '</head><body>' +
    '<header>广东省婚姻登记网上预约系统（本地模拟）</header>' +
    '<div class="page">' +
    '<h2>首页</h2>' +
    '<p>插件应自动点击下方入口链接（FILL_PAGE_1）。</p>' +
    '<a href="/wsyy/yyjh.jsp">婚姻登记网上预约入口</a>' +
    '<div class="note">手动测试项：<a href="/wsyy/yyjh.do?do=timeout">模拟会话超时页</a>（插件应显示红色栏并自动跳回本首页）</div>' +
    '</div></body></html>';
}

function page2() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>选择基本信息</title>' + STYLE + '</head><body>' +
    '<header>广东省婚姻登记网上预约系统（本地模拟）</header>' +
    '<div class="page">' +
    '<div class="steps"><b>1 选择基本信息</b> → 2 选择办理网点及时间 → 3 填写双方信息 → 4 预约完成</div>' +
    '<h2>第 1 步：选择基本信息</h2>' +
    '<p>插件应自动点击"下一步"按钮（FILL_PAGE_2）。</p>' +
    '<input type="button" class="btn_1" value="下一步" onclick="window.location=\'/wsyy/yyjh.do?do=nextOper\'">' +
    '</div></body></html>';
}

function page3() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>选择办理网点及时间</title>' + STYLE +
    '<script src="/jquery-stub.js"></script>' +
    '</head><body>' +
    '<header>广东省婚姻登记网上预约系统（本地模拟）</header>' +
    '<div class="page">' +
    '<div class="steps">1 选择基本信息 → <b>2 选择办理网点及时间</b> → 3 填写双方信息 → 4 预约完成</div>' +
    '<h2>第 2 步：选择办理网点及时间</h2>' +
    '<p>插件应自动填写日期和城市，然后点击"查询"（FILL_PAGE_3）。下方会显示查询函数实际读到的值，用于验证设值是否生效。</p>' +
    '<table><tr><th>*预约日期</th><td><input type="text" id="yyrq" name="yyrq"></td></tr>' +
    '<tr><th>*办理城市</th><td><select name="blcs"><option value="">请选择</option><option value="440300000000">深圳市</option><option value="440100000000">广州市</option></select></td></tr>' +
    '<tr><th>操作</th><td><a class="querybtn" href="javascript:void(0);" onclick="changeWdrqxx()">查询</a></td></tr></table>' +
    '<div id="readback" class="note">查询函数读到的值还没产生</div>' +
    '<script>' +
    // 复刻真实网站的关键行为：用 jQuery .attr('value') 读日期（读的是 HTML 属性而非 DOM 属性）
    'function changeWdrqxx() {' +
    '  var yyrq = jQuery("#yyrq").attr("value") || "";' +
    '  var blcs = jQuery("select[name=blcs]").val() || "";' +
    '  document.getElementById("readback").textContent = "查询函数读到: yyrq=[" + yyrq + "] blcs=[" + blcs + "]";' +
    '  if (!yyrq) { alert("请选择预约日期!"); return; }' +
    '  if (!blcs) { alert("请选择办理城市!"); return; }' +
    '  setTimeout(function(){ window.location = "/wsyy/common.do?do=getWdrqxx&yyrq=" + encodeURIComponent(yyrq) + "&blcs=" + encodeURIComponent(blcs) + "&ywlx=J&sflbsx="; }, 300);' +
    '}' +
    '</script>' +
    '</div></body></html>';
}

function page5(q) {
  var yyrq = q.get('yyrq') || '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>选择办理网点</title>' + STYLE +
    '<script src="/jquery-stub.js"></script>' +
    '</head><body>' +
    '<header>广东省婚姻登记网上预约系统（本地模拟）</header>' +
    '<div class="page">' +
    '<div class="steps">1 选择基本信息 → <b>2 选择办理网点及时间</b> → 3 填写双方信息 → 4 预约完成</div>' +
    '<h2>第 2 步：查询结果（预约日期 ' + yyrq + '）</h2>' +
    '<p>插件应自动选中福田区网点，等时间段异步加载后选中第一个可用时间段，显示绿色信息栏，3 秒后点击"下一步"（FILL_PAGE_5）。</p>' +
    '<h3>选择办理网点</h3>' +
    '<table><tr><th>选择</th><th>序号</th><th>所在市</th><th>登记处名称</th><th>剩余预约量</th></tr>' +
    '<tr><td><input type="radio" name="djjg" value="4403040A1000" onclick="loadTimeSlots(this.value)"></td><td>1</td><td>深圳市</td><td id="4403040A1000">深圳市福田区民政局婚姻登记处</td><td style="color:green;">3</td></tr>' +
    '<tr><td><input type="radio" name="djjg" value="4403030A1000" onclick="loadTimeSlots(this.value)"></td><td>2</td><td>深圳市</td><td id="4403030A1000">深圳市罗湖区民政局婚姻登记处</td><td style="color:green;">5</td></tr>' +
    '<tr><td><input type="radio" name="djjg" value="4403050A1000" onclick="loadTimeSlots(this.value)"></td><td>3</td><td>深圳市</td><td id="4403050A1000">深圳市南山区民政局婚姻登记处</td><td style="color:red;">0</td></tr>' +
    '</table>' +
    '<h3>选择预约时段</h3>' +
    '<table id="timeBox"><tr><td>请先选择办理网点</td></tr></table>' +
    '<div>您选择的办理网点是：<span id="selOffice"></span><br>您选择的预约时段是：<span id="selTime"></span></div>' +
    '<input type="button" class="btn_1" value="下一步" onclick="saveYywdrqxx()">' +
    '<script>' +
    'var YYRQ = "' + yyrq.replace(/"/g, '') + '";' +
    'var TIMES = ["9:00-10:00","10:00-11:00","11:00-11:30","13:00-13:30","13:30-14:00","14:00-14:30","14:30-15:30","15:30-16:30"];' +
    // 复刻真实网站：选网点后时间段通过 AJAX 异步加载（这里用 600ms 延迟模拟）
    'function loadTimeSlots(code) {' +
    '  document.getElementById("selOffice").textContent = code;' +
    '  var box = document.getElementById("timeBox");' +
    '  box.innerHTML = "<tr><td>时间段加载中...</td></tr>";' +
    '  setTimeout(function(){' +
    '    var html = "<tr><th>选择</th><th>序号</th><th>预约日期</th><th>预约时间段</th><th>剩余预约量</th></tr>";' +
    '    for (var i = 0; i < TIMES.length; i++) {' +
    '      html += "<tr><td><input type=\\"radio\\" name=\\"yysj\\" value=\\"" + TIMES[i] + "\\" onclick=\\"pickTime(this.value)\\"></td><td>" + (i+1) + "</td><td>" + YYRQ + "</td><td>" + TIMES[i] + "</td><td>" + ((i % 3) + 1) + "</td></tr>";' +
    '    }' +
    '    box.innerHTML = html;' +
    '  }, 600);' +
    '}' +
    'function pickTime(v) { document.getElementById("selTime").textContent = v; }' +
    'function saveYywdrqxx() {' +
    '  var djjg = document.querySelector("input[name=djjg]:checked");' +
    '  var yysj = document.querySelector("input[name=yysj]:checked");' +
    '  if (!djjg) { alert("请选择办理网点!"); return; }' +
    '  if (!yysj) { alert("请选择预约时间段!"); return; }' +
    '  window.location = "/wsyy/yyjh.do?do=preYyxxOper&yyrq=" + encodeURIComponent(YYRQ) + "&djjg=" + encodeURIComponent(djjg.value) + "&yysj=" + encodeURIComponent(yysj.value) + "&ydbllx=01";' +
    '}' +
    '</script>' +
    '</div></body></html>';
}

function page4(q) {
  var yyrq = q.get('yyrq') || '';
  var djjg = q.get('djjg') || '';
  var yysj = q.get('yysj') || '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>填写双方信息</title>' + STYLE +
    '<script src="/jquery-stub.js"></script>' +
    '</head><body>' +
    '<header>广东省婚姻登记网上预约系统（本地模拟）</header>' +
    '<div class="page">' +
    '<div class="steps">1 选择基本信息 → 2 选择办理网点及时间 → <b>3 填写双方信息</b> → 4 预约完成</div>' +
    '<h2>第 3 步：填写双方信息</h2>' +
    '<div class="note">本次预约：日期 ' + yyrq + ' | 网点代码 ' + djjg + ' | 时段 ' + yysj + '（插件底部信息栏应显示中文名称）</div>' +
    '<p>插件应自动填写全部字段、选择通知方式、点击获取验证码（FILL_PAGE_4）。6 秒后下方自动校验结果。</p>' +
    '<table>' +
    '<tr><th>男方姓名</th><td><input type="text" id="xmnan"></td><th>女方姓名</th><td><input type="text" id="xmnv"></td></tr>' +
    '<tr><th>男方证件号</th><td><input type="text" id="sfzjhmnan"></td><th>女方证件号</th><td><input type="text" id="sfzjhmnv"></td></tr>' +
    '<tr><th>男方文化程度</th><td><select id="whcdnan"><option value="">请选择</option><option value="研究生">研究生</option><option value="大学">大学</option><option value="本科">本科</option><option value="大专">大专</option></select></td>' +
    '<th>女方文化程度</th><td><select id="whcdnv"><option value="">请选择</option><option value="研究生">研究生</option><option value="大学">大学</option><option value="本科">本科</option><option value="大专">大专</option></select></td></tr>' +
    '<tr><th>男方职业</th><td><select id="zynan"><option value="">请选择</option><option value="专业技术人员">专业技术人员</option><option value="公务员">公务员</option><option value="其他从业人员">其他从业人员</option></select></td>' +
    '<th>女方职业</th><td><select id="zynv"><option value="">请选择</option><option value="专业技术人员">专业技术人员</option><option value="公务员">公务员</option><option value="其他从业人员">其他从业人员</option></select></td></tr>' +
    '<tr><th>男方手机号</th><td><input type="text" id="lxdhnan"></td><th>女方手机号</th><td><input type="text" id="lxdhnv"></td></tr>' +
    '<tr><th>短信通知</th><td colspan="3"><label><input type="radio" name="dxtzf" value="01"> 通知</label> <label><input type="radio" name="dxtzf" value="02"> 不通知</label> <button id="sms_get" onclick="sendSms()">获取验证码</button> <span id="smsResult"></span></td></tr>' +
    '</table>' +
    '<div id="testResult">等待自动校验...</div>' +
    '<script>' +
    // 这行字符串在 script 标签内：用于验证插件用 innerText 而不是 textContent 检测（textContent 会误判这里）
    'var SESSION_TIMEOUT_MSG = "会话超时，请重新申请！";' +
    'function sendSms() { document.getElementById("smsResult").textContent = "验证码已发送（模拟）"; }' +
    'setTimeout(function(){' +
    '  var fields = ["xmnan","sfzjhmnan","whcdnan","zynan","lxdhnan","xmnv","sfzjhmnv","whcdnv","zynv","lxdhnv"];' +
    '  var missing = [];' +
    '  for (var i = 0; i < fields.length; i++) {' +
    '    var el = document.getElementById(fields[i]);' +
    '    if (!el || !el.value) missing.push(fields[i]);' +
    '  }' +
    '  var notify = document.querySelector("input[name=dxtzf]:checked");' +
    '  var panel = document.getElementById("testResult");' +
    '  if (missing.length === 0 && notify) {' +
    '    panel.style.background = "#4CAF50";' +
    '    panel.textContent = "测试通过：10 个字段全部自动填写，通知方式已选择(" + notify.value + ")";' +
    '  } else {' +
    '    panel.style.background = "#f44336";' +
    '    panel.textContent = "测试失败：未填写字段[" + missing.join(",") + "]" + (notify ? "" : " 通知方式未选");' +
    '  }' +
    '}, 6000);' +
    '</script>' +
    '</div></body></html>';
}

function timeoutPage() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>会话超时</title>' + STYLE + '</head><body>' +
    '<header>广东省婚姻登记网上预约系统（本地模拟）</header>' +
    '<div class="page">' +
    '<h2>会话超时，请重新申请！</h2>' +
    '<p>请清理缓存后通过 http://www.gdhy.gov.cn 访问，<a href="/">点此返回到首页</a></p>' +
    '<p>（插件应显示红色信息栏并在 2 秒后自动跳回本地首页）</p>' +
    '</div></body></html>';
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost:' + PORT);
  const path = u.pathname;
  const q = u.searchParams;

  if (path === '/jquery-stub.js') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.end(jqueryStub());
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (path === '/') return res.end(homePage());
  if (path === '/wsyy/yyjh.jsp') return res.end(page2());
  if (path === '/wsyy/yyjh.do') {
    if (q.get('do') === 'nextOper') return res.end(page3());
    if (q.get('do') === 'preYyxxOper') return res.end(page4(q));
    if (q.get('do') === 'timeout') return res.end(timeoutPage());
  }
  if (path === '/wsyy/common.do' && q.get('do') === 'getWdrqxx') return res.end(page5(q));
  res.statusCode = 404;
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log('Marie 模拟测试站已启动: http://localhost:' + PORT);
});
