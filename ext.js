const validContexts = ['link', 'selection', 'request']
let servers = null

// Keep track of requests so we can send them if needed.
let requests = []
chrome.webRequest.onBeforeRequest.addListener(
	req => { requests.push(req.url) },
	{ urls: ["<all_urls>"] }
)

// Get servers set in options
chrome.storage.sync.get({
	servers: null,
}, function (items) {
	if (items.servers == null) {
		return
	}

	const servers = items.servers.split('\n')
	fetchMenuData(servers)
})

// Parses 'user:pass@' out of URL.
// Returns Authorization header string to append in a Headers object, or null if no credentials were present, and the cleaned string.
function credentialsFromURL(url) {
	const r = /:\/\/(.*:.*)@/
	const m = url.match(r)
	if (!m) {
		return { credentials: null, cleanURL: url }
	}

	// First group
	const cred = m[1]
	const clean = url.replace(r, '://')
	return { credentials: 'Basic ' + btoa(cred), cleanURL: clean }
}

function fetchMenuData(servers) {
	for (const url of servers) {
		// Add authentication
		const auth = credentialsFromURL(url)
		let headers = new Headers()
		if (auth.credentials) {
			headers.append('Authorization', auth.credentials)
		}

		// Fetch menu data from server.
		fetch(auth.cleanURL + '/menus', { headers: headers })
			// If OK, turn to JSON
			.then(res => {
				if (!res.ok) {
					throw Error(res.statusText)
				}

				return res.json()
			})
			.then(res => {
				buildContextMenus(url, auth.cleanURL, res)
			})
			.catch(err => {
				notify('RemoteAction error', err.message)
				throw err
			})
	}
}

function buildContextMenus(url, cleanURL, menus) {
	const contextMap = {
		'link': ['link', 'page'],
		'request': ['page'],
	}

	// Get all possible contexts for all our menus
	let contexts = []
	for (const menu of menus) {
		for (const ctx of menu.contexts) {
			// Validate context
			if (validContexts.indexOf(ctx) == -1) {
				notify(`Invalid context "${ctx}"`, 'Extension will not create any context menus')
				return
			}

			const pushUnique = c => {
				if (contexts.indexOf(c) != -1) {
					return
				}
				contexts.push(c)
			}

			if (ctx in contextMap) {
				contextMap[ctx].forEach(pushUnique)
			} else {
				pushUnique(ctx)
			}
		}
	}

	// Create root context menu for this server: is available for all possible contexts
	const title = `Send to ${cleanURL.replace(/(^\w+:|^)\/\//, '')}`
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
							onclick: postFromContextInfo(url, menu.action, menu.regexes, 'pageUrl')
						})
						chrome.contextMenus.create({
							...options,
							contexts: ['link'],
							targetUrlPatterns: [pattern],
							onclick: postFromContextInfo(url, menu.action, menu.regexes, 'linkUrl')
						})
					}
					break

				case 'selection':
					chrome.contextMenus.create({
						...options,
						contexts: ['selection'],
						onclick: postFromContextInfo(url, menu.action, menu.regexes, 'selectionText')
					})
					break

				case 'request':
					for (const pattern of menu.patterns) {
						chrome.contextMenus.create({
							...options,
							contexts: ['page'],
							documentUrlPatterns: [pattern],
							onclick: postWatchedRequest(url, menu.action, menu.regexes)
						})
					}
					break
			}
		}
	}
}

function postWatchedRequest(serverURL, action, regexes) {
	return function (info, tab) {
		let data = null
		for (const req of requests) {
			for (const regex of regexes) {
				if (req.match(regex)) {
					data = encodeURIComponent(req)
					break
				}
			}
		}
		if (!data) {
			notify('Action cannot be sent', 'No requests match the pattern')
		}

		const reqURL = `/action?action=${action}&data=${data}`
		postAction(serverURL, reqURL)
	}
}

function postFromContextInfo(serverURL, action, regexes, infoKey) {
	return function (info, tab) {
		const data = encodeURIComponent(info[infoKey])
		const reqURL = `/action?action=${action}&data=${data}`

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

		postAction(serverURL, reqURL)
	}
}

function postAction(serverURL, reqURL) {
	const auth = credentialsFromURL(serverURL)
	let headers = new Headers()
	if (auth.credentials) {
		headers.append('Authorization', auth.credentials)
	}

	const url = encodeURI(`${auth.cleanURL}${reqURL}`)
	fetch(url, { method: 'POST', headers: headers })
		.then(res => res.text())
		.then(text => {
			notify('Action complete', text)
		})
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
