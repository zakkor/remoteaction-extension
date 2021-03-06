const validContexts = ['link', 'selection']
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
		'link': ['link', 'page', 'frame', 'image', 'video', 'audio'],
	}

	// Get all possible contexts for all our menus
	let contexts = []
	for (const menu of menus) {
		// Validate context
		if (validContexts.indexOf(menu.context) == -1) {
			notify(`Invalid context "${menu.context}"`, 'Extension will not create any context menus')
			return
		}

		const pushUnique = c => {
			if (contexts.indexOf(c) != -1) {
				return
			}
			contexts.push(c)
		}

		if (menu.context in contextMap) {
			contextMap[menu.context].forEach(pushUnique)
		} else {
			pushUnique(menu.context)
		}
	}

	// Create root context menu for this server: is available for all possible contexts
	const title = `Send to ${cleanURL.replace(/(^\w+:|^)\/\//, '')}`
	var parent = chrome.contextMenus.create({ title: title, contexts: contexts })

	for (const menu of menus) {
		let patterns = null
		if (menu.patterns != null) {
			patterns = menu.patterns.map(p => p.url).filter(url => !!url);
		}

		for (const action of menu.actions) {
			switch (menu.context) {
				case 'link':
					// Add both link and page contexts
					chrome.contextMenus.create({
						parentId: parent,
						title: action.name + ' (Page)',
						contexts: ['page'],
						documentUrlPatterns: patterns,
						onclick: postFromContextInfo(url, action.action, menu.patterns, 'pageUrl')
					})
					chrome.contextMenus.create({
						parentId: parent,
						title: action.name,
						contexts: ['link', 'frame', 'image', 'video', 'audio'],
						targetUrlPatterns: patterns,
						onclick: postFromContextInfo(url, action.action, menu.patterns, 'linkUrl')
					})
					break

				case 'selection':
					chrome.contextMenus.create({
						parentId: parent,
						title: action.name,
						contexts: ['selection'],
						onclick: postFromContextInfo(url, action.action, menu.patterns, 'selectionText')
					})
			}
		}
	}
}

function postFromContextInfo(serverURL, action, patterns, infoKey) {
	return function (info, tab) {
		const data = encodeURIComponent(info[infoKey])
		const reqURL = `/action?action=${action}&data=${data}`

		if (!!patterns) {
			let matched = false
			for (const pattern of patterns) {
				if (data.match(pattern.regex)) {
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
