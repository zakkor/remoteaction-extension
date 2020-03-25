let saveBtn = document.getElementById('save')
let serversArea = document.getElementById('servers')

serversArea.onchange = function() {
	saveBtn.textContent = 'Save'
}

// Saves options to chrome.storage
function saveOptions() {
  const servers = serversArea.value

  chrome.storage.sync.set({ servers: servers }, function() {
    chrome.runtime.reload()
    window.close()
  })
}
saveBtn.addEventListener('click', saveOptions)

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.sync.get({
    servers: '',
  }, function(items) {
    serversArea.value = items.servers
    // Set save button text to either "save" or refresh
	if (serversArea.value == '') {
		saveBtn.textContent = 'Save'
	} else {
		saveBtn.textContent = 'Refresh'
	}
  })
}
document.addEventListener('DOMContentLoaded', restoreOptions)

