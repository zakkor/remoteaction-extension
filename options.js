// Saves options to chrome.storage
function saveOptions() {
  const servers = document.getElementById('servers').value

  chrome.storage.sync.set({ servers: servers }, function() {
    chrome.runtime.reload()
    window.close()
  })
}
document.getElementById('save').addEventListener('click', saveOptions)

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.sync.get({
    servers: '',
  }, function(items) {
    document.getElementById('servers').value = items.servers
  })
}
document.addEventListener('DOMContentLoaded', restoreOptions)

