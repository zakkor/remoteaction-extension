const validContexts = ['link', 'selection']
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
  // Get all possible contexts for all our menus
  let contexts = []
  for (const menu of menus) {
    for (const ctx of menu.contexts) {
      // Validate context
      if (validContexts.indexOf(ctx) == -1) {
        notify(`Invalid context "${ctx}"`, 'Extension will not create any context menus')
        return
      }

      if (contexts.indexOf(ctx) != -1) {
        continue
      }

      contexts.push(ctx)
      // link also means page
      if (ctx == 'link') {
        contexts.push('page')
      }
    }
  }

  // Create root context menu for this server: is available for all possilbe contexts
  const title = `Send to ${server}`
  var parent = chrome.contextMenus.create({ title: title, contexts: contexts })

  for (const menu of menus) {
    const options = {
      title: menu.name,
      parentId: parent,
    }

    for (const ctx of menu.contexts) {
      switch (ctx) {
      case 'link':
        for (const pattern of menu.patterns) {
          // Add both link and page contexts
          chrome.contextMenus.create({ 
            ...options,
            contexts: ['page'],
            documentUrlPatterns: [pattern],
            onclick: postAction(server, menu.action, menu.regexes, 'pageUrl')
          })
          chrome.contextMenus.create({ 
            ...options,
            contexts: ['link'],
            targetUrlPatterns: [pattern],
            onclick: postAction(server, menu.action, menu.regexes, 'linkUrl')
          })
        }
        break

      case 'selection':
        chrome.contextMenus.create({ 
          ...options,
          contexts: ['selection'],
          onclick: postAction(server, menu.action, menu.regexes, 'selectionText')
        })
        break
      }
    }
  }
}

function postAction(server, action, regexes, dataKey) {
  return function(info, tab) {
    const data = encodeURIComponent(info[dataKey])
    const url = encodeURI(`${server}/action?action=${action}&data=${data}`)

    if (regexes.length > 0) {
      let matched = false
      for (const regex of regexes) {
        if (data.match(regex)) {
          matched = true
          break
        }
      }
      if (!matched) {
        notify('Action cannot be sent', 'Data does not match clicked action')
        return
      }
    }

    fetch(url, { method: 'POST' })
      .then(res => res.text())
      .then(text => {
        notify('Action complete', text)
      })
  }
}

function notify(title, message) {
  var browser = browser || chrome
  browser.notifications.create('', {
    "type": "basic",
    "iconUrl": browser.runtime.getURL("icon32.png"),
    "title": title,
    "message": message,
  })
}
