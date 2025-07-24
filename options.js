// Saves options to chrome.storage
function saveOptions() {
  // var autoClose = document.getElementById('autoclose').checked;
  // var curWindow = document.getElementById('currentwindow').checked;
  var sortTabs = document.getElementById('sortTabs').checked;

  chrome.storage.sync.set({
    // autoClose: autoClose,
    // currentWindowOnly: curWindow,
    sortTabs: sortTabs
  }, function () {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function () {
      status.textContent = '';
    }, 750);
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.sync.get({
    // autoClose: false,
    // currentWindowOnly: false,
    sortTabs: false
  }, function (items) {
    // document.getElementById('autoclose').value = items.autoClose;
    // document.getElementById('currentwindow').checked = items.currentWindowOnly;
    document.getElementById('sortTabs').checked = items.sortTabs;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);