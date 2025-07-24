let tabUrl = {};
let urlList = {};
let domains = [];
let dupUrls = [];

let autoClose = false;
let currentWindowOnly = false;
let sortTabs = false;

async function loadConfigs() {
  const items = await chrome.storage.sync.get({
    autoClose: false,
    currentWindowOnly: false,
    sortTabs: false,
  });
  autoClose = items.autoClose;
  currentWindowOnly = items.currentWindowOnly;
  sortTabs = items.sortTabs;
}

async function init() {
  await loadConfigs();
  const tabs = await chrome.tabs.query(currentWindowOnly ? { currentWindow: true } : {});
  tabUrl = {};
  for (const tab of tabs) {
    tabUrl[tab.id] = { url: tab.url, title: tab.title };
  }
  refreshBadge();
}

function updateUrlList() {
  urlList = {};
  for (const tabId in tabUrl) {
    const url = tabUrl[tabId].url;
    if (url in urlList) {
      urlList[url].count += 1;
    } else {
      urlList[url] = { count: 1, title: tabUrl[tabId].title };
    }
  }
}

function getDomain(url) {
  return url.replace(/^https?:\/\//, '').split(/[/?#]/)[0];
}

function updateDomains() {
  domains = [];
  const domainMap = {};
  for (const url in urlList) {
    const domain = getDomain(url);
    domainMap[domain] = (domainMap[domain] || 0) + 1;
  }
  for (const domain in domainMap) {
    domains.push({ domain, count: domainMap[domain] });
  }
}

function getTopDomains() {
  return domains
    .sort((a, b) => b.count - a.count)
    .filter(d => d.count >= 5)
    .map(d => `${d.count} : ${d.domain}`)
    .join('\n');
}

function refreshBadge() {
  updateUrlList();
  updateDomains();

  let tabCount = 0;
  let urlCount = 0;
  dupUrls = [];

  for (const url in urlList) {
    const count = urlList[url].count;
    tabCount += count;
    urlCount++;
    if (count > 1) {
      dupUrls.push(`${count} : ${urlList[url].title.slice(0, 50)}`);
    }
  }

  const diff = tabCount - urlCount;

  chrome.action.setBadgeText({ text: diff > 0 ? diff.toString() : '' });

  chrome.action.setTitle({
    title:
      `Tabs: ${tabCount} || Duplicates: ${diff}\n` +
      (getTopDomains() ? `Top Domains:\n${getTopDomains()}\n` : '') +
      (diff > 0 ? `Duplicate Sites:\n${dupUrls.sort().reverse().join('\n')}` : '')
  });

  chrome.action.setIcon({
    path: diff > 0 ? "icon_128.png" : "icon_128_gs.png"
  });
}

// Listen to tab events
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url) {
    tabUrl[tabId] = { url: tab.url, title: tab.title };
    refreshBadge();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabUrl[tabId];
  refreshBadge();
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  delete tabUrl[removedTabId];
  refreshBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    init();
  }
});

// Main click action
chrome.action.onClicked.addListener(async () => {
  await loadConfigs();
  const tabs = await chrome.tabs.query(currentWindowOnly ? { currentWindow: true } : {});

  if (sortTabs) {
    tabs.sort((a, b) => {
      if (a.windowId !== b.windowId) return a.windowId - b.windowId;
      return a.url.toLowerCase().localeCompare(b.url.toLowerCase());
    });
  }

  const urlMap = {};
  for (const tab of tabs) {
    const url = tab.url;
    const existing = urlMap[url];
    if (existing) {
      if (!existing.pinned && (tab.pinned || tab.active)) {
        await chrome.tabs.remove(existing.id);
        urlMap[url] = tab;
      } else {
        await chrome.tabs.remove(tab.id);
      }
    } else {
      urlMap[url] = tab;
    }
  }

  await init();
});

// On startup and install
chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(init);
