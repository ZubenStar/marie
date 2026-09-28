<p align="center"><img width="100" src="./images/logo.png" alt="Marie Logo"></p>
<h1 align="center">Marie</h1>
<p align="center">
  <a target="_blank" href="https://kyrieliu.cn"><img src="https://img.shields.io/badge/Powered-kyrieliu-red" alt="Powered by kyrieliu"></a>
  <a href="javascript:void(0)"><img src="https://img.shields.io/badge/Version-2.0.0-blue" alt="version"></a>
  <a href="javascript:void(0)"><img src="https://img.shields.io/badge/License-MIT-blueviolet" alt="license"></a>
</p>

## 介绍

Marie 是一个用来让「广东省结婚预约流程」更快的 Chrome 浏览器插件（Manifest V3），让使用者**快人一步，大大增加抢到好日子的概率**。

只能在 [广东省民政局的 PC 端官网](https://www.gdhy.gov.cn/wsyy/index.jsp) 上使用。

### 自动化流程

| 步骤 | 页面 URL 特征 | 自动操作 |
|------|-------------|---------|
| Page 1 | 首页（`main.jsp` / `index.jsp`） | 自动点击进入「婚姻登记预约流程」 |
| Page 2 | `yyjh.jsp` | 自动点击「下一步」 |
| Page 3 | `yyjh.do?do=nextOper` | 自动填写预约日期和办理城市，执行查询 |
| Page 4 | `common.do?do=getWdrqxx` | 等待网点列表 AJAX 渲染，按优先级选网点和时段，确认 3 秒后点击下一步 |
| Page 5 | `yyjh.do?do=preYyxxOper` | 自动填写双方个人信息、选通知方式、点获取验证码（带填写结果诊断） |

> 注意：代码内部的消息编号与表格顺序不完全一致——`FILL_PAGE_4` 对应表格 Page 5（填双方信息），`FILL_PAGE_5` 对应表格 Page 4（选网点）。

## 安装

1. 打开 Chrome，地址栏输入 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选择本项目根目录
4. 安装成功后工具栏出现 Marie 图标

### 修改代码后如何生效

| 改的文件 | 刷新方式 |
|---------|---------|
| `marriage.js` / `background.js` / `manifest.json` | `chrome://extensions` 点 Marie 卡片的刷新按钮，然后刷新预约网页 |
| `popup.html` / `popup.js` / `popup.css` | 关闭弹窗重新打开即可 |

## 使用方法

### 1. 配置信息

点击 Chrome 工具栏的 Marie 图标，在「配置」Tab 中填写：

- **预约日期**：目标日期，如 `2026-10-18`
- **办理城市代码**：统计用区划代码，如 `440300000000`（深圳市）
- **网点代码**：逗号分隔，如 `4403040A1000`（福田区）
- **时间段**：逗号分隔，按优先级排序
- **双方信息**：姓名、身份证号、文化程度、职业、手机号
- **重试设置**：间隔(ms) 和最大次数

点「保存配置」即可，配置通过 `chrome.storage.sync` 持久化，不需要改代码。

### 2. 插件开关

Popup 顶部有插件开关：
- **关闭**（默认）：页面加载不会自动执行，仅手动按钮可用
- **开启**：页面加载自动执行全流程

开关切换即时生效。

### 3. 从首页开始

「操作」Tab 顶部有「从首页开始」按钮——点击后自动打开首页并启用插件开关，从 Page 1 开始自动走全流程。适合会话超时后一键恢复。

### 4. 手动触发

「操作」Tab 还提供两个手动按钮：
- **基本信息**：手动触发 Page 2 的自动填充
- **人员信息**：手动触发 Page 5 的自动填充

### 5. 本地模拟测试

仓库内置本地模拟站（复刻 5 个页面的 DOM 结构和关键行为：jQuery `.attr('value')` 读值、网点时段 AJAX 加载、会话超时页等），可在不触碰真实预约的情况下安全调试全流程：

```bash
node test/server.js
```

启动后点击「操作」Tab 的「本地模拟测试」按钮（自动开启插件并打开 `http://localhost:8899`），插件会自动走完全部页面。

### 6. 会话超时自动恢复

插件会自动检测页面是否显示"会话超时"或"请重新申请"。检测到后：
1. 页面顶部显示红色信息栏「会话超时，正在返回首页重新开始...」
2. 等待 2 秒后自动跳转回首页
3. 首页加载后自动从 Page 1 重新开始流程

不需要手动处理。

### 7. 信息栏

| 位置 | 颜色 | 何时显示 | 内容 |
|------|------|---------|------|
| 页面顶部 | 红色 | 会话超时 | 「会话超时，正在返回首页...」 |
| 页面顶部 | 绿色 | 网点+时间都选到 | 网点名称 + 时间段 |
| 页面顶部 | 红色 | 网点或时间未选到 | 未选到 + 重试进度 |
| 页面顶部 | 绿色/橙色 | 双方信息填写完成后 | 填写结果：已填 X/10、设置失败/未找到的具体字段 |
| 页面顶部 | 红色 | 未配置双方姓名/证件号 | 配置不完整提示，停止填写 |
| 页面底部 | 深灰 | 所有后续页面 | 上次选的网点+时间+日期（10分钟过期） |

## 如何查询网点代码

在预约网站的「选择办理网点」页面，按 `F12` 打开控制台，输入：

```javascript
document.querySelectorAll('input[type="radio"][name="djjg"]').forEach(r => { var td = document.getElementById(r.value); console.log(r.value, '|', td ? td.textContent.trim() : ''); })
```

输出格式：`网点代码 | 网点名称`，找到目标网点对应的代码填到 Popup 里。

### 深圳市各区网点代码（实测）

| 代码 | 网点名称 |
|------|---------|
| `4403030A1000` | 罗湖区民政局婚姻登记处 |
| `4403040A1000` | 深圳市福田区民政局婚姻登记处 |
| `4403050A1000` | 南山区民政局婚姻登记处 |
| `4403060A1000` | 宝安区民政局婚姻登记处 |
| `4403070A1000` | 龙岗区民政局婚姻登记处 |
| `4403080A1000` | 盐田区民政局婚姻登记处 |
| `4403090A1000` | 深圳市龙华区民政局婚姻登记处 |
| `4403100A1000` | 深圳市坪山区民政局婚姻登记处 |
| `4403110A1000` | 深圳市光明区民政局婚姻登记处 |
| `4403960A1000` | 深圳市大鹏新区婚姻登记处 |
| `4403980A1000` | 深圳市深汕特别合作区婚姻登记处 |

> 城市代码：深圳市 `440300000000`，广州市 `440100000000`。

## 项目结构

```
marie/
├── manifest.json              # Chrome 扩展配置（MV3）
├── popup.html                 # 弹窗 UI（配置表单 + 操作按钮）
├── background/
│   └── background.js          # Service Worker，页面路由 + 主世界代码执行
├── src/
│   ├── content_scripts/
│   │   └── marriage.js        # Content Script，页面自动化逻辑
│   ├── css/
│   │   └── popup.css          # 弹窗样式
│   └── js/
│       └── popup.js           # 弹窗逻辑，读写 chrome.storage
├── test/
│   └── server.js              # 本地模拟测试站（node test/server.js）
└── images/
```

## 技术要点

### CSP 绕过

广东省民政局网站有 CSP 限制，`<a href="javascript:...">` 的 `.click()` 会触发 CSP 拦截。同时 content script 运行在隔离世界，`window[fnName]` 访问不到页面定义的函数。

解决方案：`safeClick` 提取 `javascript:` 后的代码，通过 `chrome.runtime.sendMessage` 发给 background，background 用 `chrome.scripting.executeScript({ world: 'MAIN' })` 在页面的主世界 `eval` 执行。

### jQuery 读值兼容

Page 3 的查询函数用 `jQuery('#yyrq').attr('value')` 读日期（读的是 HTML 属性而非 DOM 属性），只设置 `.value` 会读到空值。解决方案是在主世界三重设值：`setAttribute('value', ...)` + `jQuery().attr()` + `jQuery().val()`，然后再 `eval` 查询按钮的代码。

### 异步 radio 渲染

Page 4 中选中网点后，时间段列表是 AJAX 动态加载的，`waitForElement` 轮询等待 radio 出现（最长 15 秒）后再操作。

### 竞态修复

`init()` 先同步注册 `load` 和 `onMessage` 监听器，配置加载用 `configReady` Promise，所有 `FILL_PAGE` 消息处理都 `await configReady` 确保配置加载完才执行。

### 会话超时检测

页面加载时检查 `document.body.innerText` 是否包含"会话超时"——用 `innerText` 而非 `textContent`，避免 `<script>` 标签内的"会话超时"字符串造成误判；同时检查页面是否存在预约表单元素（`#xmnan`、`#yyrq` 等），两个条件同时满足（可见文字含超时且无表单元素）才判定为超时。检测到后显示红色信息栏，2 秒后发 `REDIRECT_HOME` 消息给 background，background 用 `chrome.tabs.update` 跳转首页，首页加载后自动从 Page 1 重新开始。

## 注意事项

1. 双方的「人员类别」、「国家或地区」默认为"内地居民"、"中国"，未提供自定义
2. 网站使用了 `window.showModalDialog`（现代 Chrome 已移除），"预约速查"按钮会报错，但不影响主流程
3. 会话超时由插件自动检测和恢复，不需要手动处理
4. 抢号前建议提前几天确认目标日期在可预约范围内

## License

MIT
