const onMessage = chrome.runtime.onMessage;
let currentPageInfo = null; // 存储当前页面信息

// 缓存插件开关：原来每次 PAGE_LOAD 都读一次 sync storage，等于每次页面导航都多一跳。
// enabledReady 保证 Service Worker 冷启动时首次读取完成前不会误判为「关闭」；
// 之后由 storage.onChanged 维持缓存新鲜度。
let marieEnabledCache = null;
const enabledReady = new Promise((resolve) => {
	chrome.storage.sync.get({ marieEnabled: false }, (data) => {
		marieEnabledCache = !!data.marieEnabled;
		resolve();
	});
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'sync' && changes.marieEnabled) {
		marieEnabledCache = !!changes.marieEnabled.newValue;
	}
});

// 根据页面URL判断并执行相应的自动化操作
function handlePageAction(tabId, url) {
	let action = null;

	// 去掉 query string 和 hash
	var path = url.split('?')[0].split('#')[0];

	if (path === 'http://www.gdhy.gov.cn' || path === 'http://www.gdhy.gov.cn/' ||
	    path === 'https://www.gdhy.gov.cn' || path === 'https://www.gdhy.gov.cn/' ||
	    path === 'http://www.gdhy.gov.cn/index.jsp' || path === 'https://www.gdhy.gov.cn/index.jsp' ||
	    path === 'http://www.gdhy.gov.cn/wsyy/index.jsp' || path === 'https://www.gdhy.gov.cn/wsyy/index.jsp' ||
	    path === 'http://localhost:8899' || path === 'http://localhost:8899/' ||
	    path.indexOf('main.jsp') > 0) {
		action = 'FILL_PAGE_1';
	} else if (path.indexOf('yyjh.jsp') > 0) {
		action = 'FILL_PAGE_2';
	} else if (url.indexOf('yyjh.do?do=nextOper') > 0) {
		action = 'FILL_PAGE_3';
	} else if (url.indexOf('yyjh.do?do=preYyxxOper') > 0) {
		action = 'FILL_PAGE_4';
	} else if (url.indexOf('common.do?do=getWdrqxx') > 0) {
		action = 'FILL_PAGE_5';
	}
	
	console.log('[Marie bg] 路由结果:', action, 'URL=', url);
	if (action) {
		chrome.tabs.sendMessage(tabId, { action }, (response) => {
			if (chrome.runtime.lastError) {
				console.error('[Marie bg] 发送失败:', chrome.runtime.lastError.message);
			}
		});
	}
}

// 监听来自content script的消息
onMessage.addListener(function(req, sender, sendResponse){
	let action = req.action;
	
	switch (action){
		case 'PAGE_LOAD':
			// 当页面加载时，存储页面信息
			currentPageInfo = {
				tabId: sender.tab.id,
				url: sender.tab.url,
				timestamp: Date.now()
			};

			// 检查插件开关（内存缓存，冷启动首读由 enabledReady 兜住）
			enabledReady.then(() => {
				console.log('[Marie bg] PAGE_LOAD, 开关=', marieEnabledCache, 'URL=', sender.tab.url);
				if (marieEnabledCache) {
					handlePageAction(sender.tab.id, sender.tab.url);
				}
			});

			sendResponse('ok');
			break;
		case 'GET_CURRENT_PAGE_INFO':
			// popup可以请求当前页面信息
			sendResponse(currentPageInfo);
			break;
		case 'MANUAL_FILL_PAGE':
			// 处理来自popup的手动填充请求
			chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				if (tabs[0]) {
					chrome.tabs.sendMessage(tabs[0].id, { action: req.fillAction }, (response) => {});
				}
			});
			sendResponse('手动填充指令已发送');
			break;
		case 'INJECT_BRIDGE':
			// 兜底：manifest 的 world:"MAIN" 内容脚本未注入时，补注一次主世界桥。
			// bridge.js 自带 __marieBridgeInstalled 守卫，重复注入是空操作。
			chrome.scripting.executeScript({
				target: { tabId: sender.tab.id },
				world: 'MAIN',
				files: ['src/content_scripts/bridge.js']
			}).then(() => {
				sendResponse('ok');
			}).catch(function(err) {
				sendResponse('error: ' + err.message);
			});
			return true;
		case 'EXEC_IN_PAGE':
			chrome.scripting.executeScript({
				target: { tabId: sender.tab.id },
				world: 'MAIN',
				func: function(code) {
					try { (0, eval)(code); } catch(e) { console.error('EXEC_IN_PAGE error:', e); }
				},
				args: [req.code]
			}).then(() => {
				sendResponse('ok');
			}).catch(function(err) {
				sendResponse('error: ' + err.message);
			});
			return true;
		case 'REDIRECT_HOME':
			// 本地测试时跳回本地首页，真实环境跳回官网首页
			var homeUrl = (sender.tab.url && sender.tab.url.indexOf('localhost') >= 0)
				? 'http://localhost:8899/'
				: 'http://www.gdhy.gov.cn';
			chrome.tabs.update(sender.tab.id, { url: homeUrl });
			sendResponse('ok');
			break;
		default:
			return;
	}
	
	// 确保异步操作正确处理
	return true;
});
