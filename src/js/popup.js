const find = function(selector) {
	return document.querySelector(selector);
}

const DEFAULT_CONFIG = {
	date: '2026-10-18',
	city: '440300000000',
	offices: '4403040A1000',
	times: '9:00-10:00,10:00-11:00,11:00-11:30,13:00-13:30,13:30-14:00,14:00-14:30,14:30-15:30,15:30-16:30',
	mName: '', mId: '', mDegree: '大学', mJob: '专业技术人员', mPhone: '',
 fName: '', fId: '', fDegree: '大学', fJob: '其他从业人员', fPhone: '',
	notifyValue: '01',
	retryInterval: 800,
	retryMax: 30,
};

const Reserver = {
	bindEvent: function() {
		// Tab 切换
		document.querySelectorAll('.tab-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
				document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
				btn.classList.add('active');
				find(`#tab-${btn.dataset.tab}`).classList.add('active');
			}, false);
		});

		// 插件开关
		find('#cfg-enabled').addEventListener('change', (e) => {
			chrome.storage.sync.set({ marieEnabled: e.target.checked });
		}, false);

		// 保存配置
		find('#saveButton').addEventListener('click', () => this.saveConfig(), false);

		// 从首页开始
		find('#startHomeButton').addEventListener('click', () => {
			chrome.storage.sync.set({ marieEnabled: true }, () => {
				chrome.tabs.update({ url: 'http://www.gdhy.gov.cn' });
			});
		}, false);

		// 本地模拟测试（需先运行 node test/server.js）
		find('#localTestButton').addEventListener('click', () => {
			chrome.storage.sync.set({ marieEnabled: true }, () => {
				chrome.tabs.update({ url: 'http://localhost:8899/' });
			});
		}, false);

		// 手动触发
		find('#firstPageButton').addEventListener('click', () => this.requestManualFill('FILL_PAGE_2'), false);
		find('#secondPageButton').addEventListener('click', () => this.requestManualFill('FILL_PAGE_4'), false);
	},

	saveConfig: function() {
		const config = {
			date: find('#cfg-date').value,
			city: find('#cfg-city').value,
			offices: find('#cfg-offices').value,
			times: find('#cfg-times').value,
			mName: find('#cfg-m-name').value,
			mId: find('#cfg-m-id').value,
			mDegree: find('#cfg-m-degree').value,
			mJob: find('#cfg-m-job').value,
			mPhone: find('#cfg-m-phone').value,
			fName: find('#cfg-f-name').value,
			fId: find('#cfg-f-id').value,
			fDegree: find('#cfg-f-degree').value,
			fJob: find('#cfg-f-job').value,
			fPhone: find('#cfg-f-phone').value,
			retryInterval: parseInt(find('#cfg-retry-interval').value) || 800,
			retryMax: parseInt(find('#cfg-retry-max').value) || 30,
		};
		chrome.storage.sync.set({ marieConfig: config }, () => {
			const btn = find('#saveButton');
			btn.textContent = '已保存';
			setTimeout(() => btn.textContent = '保存配置', 1000);
		});
	},

	loadConfig: function() {
		chrome.storage.sync.get({ marieConfig: {}, marieEnabled: false }, (data) => {
			find('#cfg-enabled').checked = !!data.marieEnabled;
			const cfg = Object.assign({}, DEFAULT_CONFIG, data.marieConfig);
			find('#cfg-date').value = cfg.date || '';
			find('#cfg-city').value = cfg.city || '';
			find('#cfg-offices').value = cfg.offices || '';
			find('#cfg-times').value = cfg.times || '';
			find('#cfg-m-name').value = cfg.mName || '';
			find('#cfg-m-id').value = cfg.mId || '';
			find('#cfg-m-degree').value = cfg.mDegree || '';
			find('#cfg-m-job').value = cfg.mJob || '';
			find('#cfg-m-phone').value = cfg.mPhone || '';
			find('#cfg-f-name').value = cfg.fName || '';
			find('#cfg-f-id').value = cfg.fId || '';
			find('#cfg-f-degree').value = cfg.fDegree || '';
			find('#cfg-f-job').value = cfg.fJob || '';
			find('#cfg-f-phone').value = cfg.fPhone || '';
			find('#cfg-retry-interval').value = cfg.retryInterval || 800;
			find('#cfg-retry-max').value = cfg.retryMax || 30;
		});
	},

	requestManualFill: function(fillAction) {
		chrome.runtime.sendMessage({
			action: 'MANUAL_FILL_PAGE',
			fillAction: fillAction
		});
	},

	init: function() {
		this.bindEvent();
		this.loadConfig();
	}
};

Reserver.init();
