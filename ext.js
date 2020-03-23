let servers = null;

// Get servers set in options
chrome.storage.sync.get({
  servers: null,
}, function(items) {
  if (items.servers == null) {
    return
  }

  const servers = items.servers.split('\n')
  fetchMenuData(servers)
})

function fetchMenuData(servers) {
  for (const server of servers) {
    // Fetch menu data from server.
    fetch(server+'/menus')
      // If OK, turn to JSON
      .then(res => {
        if (res.status != 200) {
          return 
        }

        return res.json()
      })
      .then(res => {
        buildContextMenus(server, res)
      })
      .catch(err => {
        console.log('err:', err)
      })
  }
}

function buildContextMenus(server, menus) {
  for (const menu of menus) {
    const parent = chrome.contextMenus.create({ title: server, contexts:  menu.contexts }) 

    for (const ctx of menu.contexts) {
      for (const pattern of menu.patterns) {
        const options = {
          parentId: parent,
          title: menu.name,
          contexts: [ctx],
          onclick: postAction(server, menu.action),
        }

        if (ctx == 'page') {
          options.documentUrlPatterns = [pattern]
          options.onclick = postAction(server, menu.action, 'pageUrl')
        } else if (ctx == 'link') {
          options.targetUrlPatterns = [pattern]
          options.onclick = postAction(server, menu.action, 'linkUrl')
        }

        chrome.contextMenus.create(options)
      }
    }
  }
}

function postAction(server, action, linkKey) {
  return function(info, tab) {
    const link = encodeURIComponent(info[linkKey])
    const url = encodeURI(`${server}/action?action=${action}&link=${link}`)

    fetch(url, { method: 'POST' })
      .then(res => res.text())
      .then(text => {
        var browser = browser || chrome
        browser.notifications.create('', {
          "type": "basic",
          "iconUrl": browser.runtime.getURL("icon32.png"),
          "title": "Action complete",
          "message": text,
        })
      })
  }
}
