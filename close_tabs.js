var stateChanged = true;
var tabUrl = new Object();
var urlList = new Object();
var domains = [];
var dupUrls = [];

var autoClose;
var currentWindowOnly;
var sortTabs;

function loadConfigs() {

	chrome.storage.sync.get({
		autoClose: false,
		currentWindowOnly: false,
		sortTabs: false
	}, function (items) {
		autoClose = items.autoClose;
		currentWindowOnly = items.currentWindowOnly;
		sortTabs = items.sortTabs;
	});
}

function initTabUrl(tabs) {
	tabUrl = new Object();

	for (var i = 0; i < tabs.length; i++)
		tabUrl[tabs[i].id] = { url: tabs[i].url, title: tabs[i].title };
}

function init() {

	loadConfigs();

	chrome.tabs.query({
		// currentWindow: currentWindowOnly
	}, function (tabs) {
		initTabUrl(tabs);
	});
};

function setIcon(type) {

	if (type == 'inactive')
		chrome.browserAction.setIcon({
			path: "icon_128_gs.png"
		});
	else
		chrome.browserAction.setIcon({
			path: "icon_128.png"
		});
}

function setBadge(msg) {

	chrome.browserAction.setBadgeBackgroundColor({
		color: [0, 0, 0, 0]
	});

	chrome.browserAction.setBadgeText({
		text: msg
	});

}

function setTitle(msg) {

	chrome.browserAction.setTitle({
		title: msg
	})
}

function updateUrlList() {

	urlList = new Object();

	for (var tabId in tabUrl) {

		url = tabUrl[tabId].url;

		if (url in urlList)
			urlList[url].count += 1;
		else
			urlList[url] = { count: 1, title: tabUrl[tabId].title };
	}

}

function getDomain(url) {
	return url.replace('http://','').replace('https://','').split(/[/?#]/)[0];
}

function updateDomains() {
	
	domains = [];
	var domainsList = new Object();

	for (var url in urlList) {
		var domain = getDomain(url);
		if (domain in domainsList)
			domainsList[domain] += 1;
		else
			domainsList[domain] = 1;
	}

	for (domain in domainsList) {
		domains.push({ domain: domain, count: domainsList[domain] });
	}
}

function getTopDomains() {
	var topDomains = domains.sort(function(a, b) { return a.count - b.count; })
		.reverse()
		.filter(function(a) { return a.count >= 5; })
		.map(function(a) { return a.count.toString().concat(" : ").concat(a.domain); });

	if (topDomains.length > 0)
		return "## Top Domains\n".concat(topDomains.join('\n')).concat('\n');
	
	return '';
}

function refreshBadge() {

	if (!stateChanged) return;

	updateUrlList();
	updateDomains();

	var tabCount = 0;
	var urlCount = 0;
	dupUrls = [];

	for (var url in urlList) {
		if (urlList[url] == undefined)
			continue;

		var count = urlList[url].count;
		tabCount += count;
		urlCount++;

		if (count > 1)
			dupUrls.push(count.toString().concat(" : ").concat(urlList[url].title.substr(0, 50)));
			// dupUrls.push({})
	}

	var diff = tabCount - urlCount;

	var title = 'Tabs: '.concat(tabCount.toString());
	title = title.concat(' || Duplicates: ').concat(diff.toString()).concat('\n');
	title = title.concat(getTopDomains());

	if (diff > 0) {
		setIcon('active');
		setBadge(diff.toString());
		setTitle(title.concat('## Duplicate sites\n').concat(dupUrls.sort().reverse().join('\n')));
	} else {
		setIcon('inactive');
		setBadge('');
		setTitle(title);
	}

	stateChanged = false;
}

chrome.runtime.onInstalled.addListener(function (details) {

	init();

	setInterval(function () { refreshBadge(); }, 500);
});

chrome.runtime.onStartup.addListener(function (details) {

	init();

	setInterval(function () { refreshBadge(); }, 500);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {

	tabUrl[tabId] = { url: tab.url, title: tab.title };

	stateChanged = true;
});

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {

	delete tabUrl[tabId];

	stateChanged = true;
});

chrome.tabs.onReplaced.addListener(function (addedTabId, removedTabId) {

	delete tabUrl[removedTabId];

	stateChanged = true;
});

chrome.storage.onChanged.addListener(function (changes, areaName) {

	if (areaName == 'sync') {
		init();

		stateChanged = true;
	}
});

chrome.browserAction.onClicked.addListener(function () {

	console.log('onClick: ', autoClose, currentWindowOnly, sortTabs);

	chrome.tabs.query({
		// currentWindow: currentWindowOnly
	}, function (tabs) {

		if (sortTabs) {
			tabs.sort(function (a, b) {
				if (a.windowId != b.windowId)
					return a.windowId - b.windowId;

				return (a.url.toLowerCase() <= b.url.toLowerCase() ? -1 : 1);
			});
		}

		var urls = new Object();
		var newIndex = 0;
		var winId = -1;

		for (var i = 0; i < tabs.length; i++) {

			if (sortTabs && winId != tabs[i].windowId) {
				winId = tabs[i].windowId;
				newIndex = 0;
			}

			var currentTab = tabs[i];
			var url = currentTab.url;
			var otherTab = urls[url];

			if (url in urls) {

				if (!otherTab.pinned && (currentTab.pinned || currentTab.active)) {
					chrome.tabs.remove(otherTab.id);
					urls[tabs[i].url] = currentTab;
				} else
					chrome.tabs.remove(currentTab.id);
			} else {
				urls[tabs[i].url] = currentTab;
				if (sortTabs)
					chrome.tabs.move(currentTab.id, { index: newIndex++ });
			}

		}

		stateChanged = true;
	});
});
