let tabUrl = {};
let urlList = {};
let domains = [];
let dupUrls = [];

let autoClose = false;
let currentWindowOnly = false;
let sortTabs = false;

// Function to log messages for debugging
function logDebug(message) {
  // In a real extension, you might want to use chrome.runtime.lastError
  // or send messages to a dedicated logging service.
  // For development, console.log is usually sufficient.
  console.log(`[CloseTabs Extension] ${new Date().toLocaleTimeString()}: ${message}`);
}

async function loadConfigs() {
  try {
    const items = await chrome.storage.sync.get({
      autoClose: false,
      currentWindowOnly: false,
      sortTabs: false,
    });
    autoClose = items.autoClose;
    currentWindowOnly = items.currentWindowOnly;
    sortTabs = items.sortTabs;
    logDebug('Configuration loaded successfully.');
  } catch (error) {
    console.error('Failed to load configurations:', error);
  }
}

async function init() {
  logDebug('Initializing extension...');
  await loadConfigs();
  try {
    // Ensure we are querying active tabs.
    // Consider adding 'status: "complete"' if you only want fully loaded tabs.
    const tabs = await chrome.tabs.query(currentWindowOnly ? { currentWindow: true } : {});
    tabUrl = {};
    for (const tab of tabs) {
      if (tab.url) { // Ensure tab has a URL before processing
        tabUrl[tab.id] = { url: tab.url, title: tab.title || 'No Title' }; // Add default title
      }
    }
    logDebug(`Initial tabs queried: ${tabs.length}`);
    refreshBadge();
  } catch (error) {
    console.error('Error during init tab query:', error);
    // Optionally, reset badge to indicate an error state
    chrome.action.setBadgeText({ text: 'Err' });
    chrome.action.setTitle({ title: 'Error during initialization' });
    chrome.action.setIcon({ path: "icon_128_gs.png" }); // Gray icon for error
  }
}

function updateUrlList() {
  urlList = {};
  for (const tabId in tabUrl) {
    const tabInfo = tabUrl[tabId];
    if (tabInfo && tabInfo.url) { // Ensure tabInfo and its URL exist
      const url = tabInfo.url;
      if (url in urlList) {
        urlList[url].count += 1;
      } else {
        urlList[url] = { count: 1, title: tabInfo.title };
      }
    }
  }
  logDebug('URL list updated.');
}

function getDomain(url) {
  try {
    // Using URL API for more robust domain extraction
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (e) {
    console.warn(`Could not parse URL for domain: ${url}`, e);
    return ''; // Return empty string for invalid URLs
  }
}

function updateDomains() {
  domains = [];
  const domainMap = {};
  for (const url in urlList) {
    const domain = getDomain(url);
    if (domain) { // Only add if domain is valid
      domainMap[domain] = (domainMap[domain] || 0) + 1;
    }
  }
  for (const domain in domainMap) {
    domains.push({ domain, count: domainMap[domain] });
  }
  logDebug('Domains updated.');
}

function getTopDomains() {
  return domains
    .sort((a, b) => b.count - a.count)
    .filter(d => d.count >= 5)
    .map(d => `${d.count} : ${d.domain}`)
    .join('\n');
}

function refreshBadge() {
  try {
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
        dupUrls.push(`${count} : ${urlList[url].title ? urlList[url].title.slice(0, 50) : url.slice(0,50)}`);
      }
    }

    const diff = tabCount - urlCount;

    // Set badge text
    chrome.action.setBadgeText({ text: diff > 0 ? diff.toString() : '' });

    // Set title
    let titleText = `Tabs: ${tabCount} || Duplicates: ${diff}\n`;
    const topDomains = getTopDomains();
    if (topDomains) {
      titleText += `Top Domains:\n${topDomains}\n`;
    }
    if (diff > 0) {
      titleText += `Duplicate Sites:\n${dupUrls.sort().reverse().join('\n')}`;
    }
    chrome.action.setTitle({ title: titleText });

    // Set icon
    chrome.action.setIcon({
      path: diff > 0 ? "icon_128.png" : "icon_128_gs.png"
    });
    logDebug(`Badge refreshed. Duplicates: ${diff}`);
  } catch (error) {
    console.error('Error refreshing badge:', error);
    chrome.action.setBadgeText({ text: 'Err' }); // Indicate an error state
    chrome.action.setTitle({ title: 'Error refreshing badge' });
    chrome.action.setIcon({ path: "icon_128_gs.png" });
  }
}

// Listen to tab events
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  logDebug(`Tab updated: ${tabId}, URL: ${tab.url}`);
  if (tab.url) {
    tabUrl[tabId] = { url: tab.url, title: tab.title || 'No Title' };
    refreshBadge();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  logDebug(`Tab removed: ${tabId}`);
  delete tabUrl[tabId];
  refreshBadge();
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  logDebug(`Tab replaced: added ${addedTabId}, removed ${removedTabId}`);
  delete tabUrl[removedTabId];
  // The added tab will trigger onUpdated, so we might not need to query it here.
  // However, ensure the new tab's info is eventually captured.
  // Calling refreshBadge is sufficient as onUpdated for addedTabId will follow.
  refreshBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  logDebug(`Storage changed in ${areaName}.`);
  if (areaName === 'sync') {
    init(); // Re-initialize if configuration changes
  }
});

// Main click action
chrome.action.onClicked.addListener(async () => {
  logDebug('Extension icon clicked. Processing tabs...');
  await loadConfigs(); // Reload configs just in case
  try {
    const tabs = await chrome.tabs.query(currentWindowOnly ? { currentWindow: true } : {});

    // Sort tabs if enabled
    if (sortTabs) {
      tabs.sort((a, b) => {
        if (a.windowId !== b.windowId) return a.windowId - b.windowId;
        return a.url.toLowerCase().localeCompare(b.url.toLowerCase());
      });
      logDebug('Tabs sorted.');
    }

    const urlMap = {};
    const tabsToRemove = []; // Collect tabs to remove
    const originalTabIds = new Set(tabs.map(tab => tab.id)); // Keep track of tabs that existed at the start

    for (const tab of tabs) {
      const url = tab.url;
      if (!url) { // Skip tabs without a URL (e.g., new tab pages before content loads)
        logDebug(`Skipping tab ${tab.id} due to missing URL.`);
        continue;
      }

      const existing = urlMap[url];
      if (existing) {
        logDebug(`Duplicate found for URL: ${url}. Existing tab: ${existing.id}, Current tab: ${tab.id}`);
        // Prioritize keeping pinned or active tabs
        if (!existing.pinned && (tab.pinned || tab.active)) {
          // If the existing one is not pinned, and the current one is (or active), remove existing
          tabsToRemove.push(existing.id);
          urlMap[url] = tab; // Keep the current (better) tab
          logDebug(`Marked existing tab ${existing.id} for removal, keeping ${tab.id}.`);
        } else {
          // Otherwise, remove the current tab (duplicate)
          tabsToRemove.push(tab.id);
          logDebug(`Marked current tab ${tab.id} for removal, keeping ${existing.id}.`);
        }
      } else {
        urlMap[url] = tab; // First occurrence, keep it
      }
    }

    // Now remove all marked duplicate tabs
    if (tabsToRemove.length > 0) {
      logDebug(`Attempting to remove ${tabsToRemove.length} duplicate tabs.`);
      await chrome.tabs.remove(tabsToRemove);
    } else {
      logDebug('No duplicate tabs to remove.');
    }

    // After removing, re-initialize to update the state correctly
    await init();
    logDebug('Duplicate tab closing process complete.');
  } catch (error) {
    console.error('Error during main click action:', error);
    chrome.action.setBadgeText({ text: 'Err' });
    chrome.action.setTitle({ title: 'Error during duplicate closing' });
    chrome.action.setIcon({ path: "icon_128_gs.png" });
  }
});


// On startup and install
chrome.runtime.onStartup.addListener(() => {
  logDebug('Extension started up.');
  init();
});

chrome.runtime.onInstalled.addListener(() => {
  logDebug('Extension installed or updated.');
  init();
});

// Immediately initialize when the service worker script loads
init();