// ==UserScript==
// @name        ChessBotLichess
// @namespace   ChessBotPy
// @match       *://lichess.org/*
// @grant       none
// @version     1.5
// @author      FallDownTheSystem
// @description Lichess Spy
// ==/UserScript==

// A new window is opened to allow a websocket connection, since the main page has a restricted CSP
// this is just an alias to the document object of the main window
let doc = window.document;
if (window.opener != null) {
	doc = window.opener.document;
}

// Global state
let index = 0;
let white = true;
let move = '';
let activeTarget = '';
let uid = uuidv4();
let ws = null;

function uuidv4() {
	return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
		(c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
	);
}

function hotkey(e) {
	if (e.altKey && e.code === 'KeyW') {
		log('Playing as white');
		ws.send(JSON.stringify({ type: 'hotkey', playing: 1 }));
	} else if (e.altKey && e.code === 'KeyQ') {
		log('Playing as black');
		ws.send(JSON.stringify({ type: 'hotkey', playing: 0 }));
	} else if (e.altKey && e.code === 'KeyA') {
		log('Playing as Both');
		ws.send(JSON.stringify({ type: 'hotkey', playing: 2 }));
	} else if (e.altKey && e.code === 'KeyS') {
		log('Stopping');
		ws.send(JSON.stringify({ type: 'hotkey', playing: 3 }));
	}
}

function log(...args) {
	console.log(...args);
	body = document.querySelector('#console');
	body.innerHTML += `<pre>${args.join(' ')}</pre>`;
}

var observer = new MutationObserver(mutations => {
	attributeChanges = mutations.filter(x => x.type === 'attributes' && x.attributeName === 'class');
	if (attributeChanges.length > 0) {
		activeChanges = attributeChanges.filter(
			x => (x.target.nodeName === 'MOVE' || x.target.nodeName === 'M2') && x.target.classList.contains('active')
		);
		if (activeChanges.length == 0 && activeTarget != 'starting-position') {
			log(`Changed active target to: Starting position`);
			activeTarget = `starting-position`;
		}
	}
	for (let mutation of mutations) {
		// Process new nodes
		if (mutation.addedNodes.length) {
			for (node of mutation.addedNodes) {
				parsed = parseMove(node, false);
				if (parsed != null) {
					ws.send(JSON.stringify(parsed));
				}
			}
		}
		// Process 'active' change
		else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
			parseActiveStateChange(mutation.target);
		}
	}
});

function parseMove(node, history) {
	// First move (initializing div.moves)
	if (node.nodeName === 'DIV' && node.classList.contains('moves')) {
		index = parseInt(node.firstChild.firstChild.textContent);
		move = node.lastChild.firstChild.textContent;
		newMove = { type: 'move', index, white, move, history };
		log(`${index}.${white ? '  ' : '..'} ${move}`);
		white = !white;
		return newMove;
	}
	// New turn
	else if (node.nodeName === 'INDEX') {
		index = parseInt(node.firstChild.textContent);
	}
	// New move
	else if (node.nodeName === 'MOVE' || node.nodeName === 'M2') {
		move = node.firstChild.textContent;
		newMove = { type: 'move', index, white, move, history };
		log(`${index}.${white ? '  ' : '..'} ${move}`);
		white = !white;
		return newMove;
	}
	// Result (game ended)
	else if (node.classList.contains('result-wrap')) {
		log('Game ended!');
		return { type: 'result', status: 'ended' };
	}
}

function parseActiveStateChange(node) {
	if ((node.nodeName === 'MOVE' || node.nodeName === 'M2') && node.classList.contains('active')) {
		let index = 0;
		let move = node.firstChild.textContent;
		let white = true;
		if (node.previousSibling.nodeName === 'INDEX') {
			index = parseInt(node.previousSibling.firstChild.textContent);
		} else if (node.previousSibling.previousSibling.nodeName === 'INDEX') {
			index = parseInt(node.previousSibling.previousSibling.firstChild.textContent);
			white = false;
		}
		if (`${index}-${white}-${move}` != activeTarget) {
			activeTarget = `${index}-${white}-${move}`;
			log(`Changed active target to: ${index} ${white ? 'white' : 'black'} ${move}`);
			return { type: 'history', index, white, move };
		}
	}
}

function findGame() {
	// Parse initial moves, before watching for mutations
	let nodes = doc.querySelector('.moves'); // Live game
	if (nodes == null) {
		nodes = doc.querySelector('.tview2'); // Analysis view
	}

	if (nodes != null) {
		log('Parsing initial moves');
		initialMoves = [];
		// Get last item and don't mark it as history
		for (let node of nodes.children) {
			parsed = parseMove(node, true);
			if (parsed != null) {
				initialMoves.push(parsed);
			}
		}
		if (initialMoves.length > 0) {
			// Set last move as not history
			initialMoves[initialMoves.length - 1].history = false;
			ws.send(JSON.stringify({ type: 'initial', moves: initialMoves }));
		}
	} else {
		log('No intial moves to parse...');
	}

	if (doc.querySelector('.rmoves') != null) {
		observer.observe(doc.querySelector('.rmoves'), {
			attributes: true,
			childList: true,
			subtree: true,
		});
		log('Attached mutation observer on ".rmoves"');
	} else if (doc.querySelector('.tview2') != null) {
		observer.observe(doc.querySelector('.tview2'), {
			attributes: true,
			childList: true,
			subtree: true,
		});
		log('Attached mutation observer on ".tview2"');
	} else {
		log('No target found for mutation observer to attach to');
	}
}

const connect = url => {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		ws.onopen = () => resolve(ws);
		ws.onerror = err => reject(err);
	});
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const waitForElement = async selector => {
	while (true) {
		const element = document.querySelector(selector);
		if (element != null) {
			return element;
		}
		await sleep(100);
	}
};

const loadScript = url => {
	return new Promise((resolve, reject) => {
		const scriptElement = document.createElement('script');
		scriptElement.src = url;
		scriptElement.onload = event => resolve(event);
		scriptElement.onerror = err => reject(err);
		const head = document.querySelector('head');
		head.appendChild(scriptElement);
	});
};

const loadCSS = url => {
	return new Promise((resolve, reject) => {
		const linkElement = document.createElement('link');
		linkElement.rel = 'stylesheet';
		linkElement.type = 'text/css';
		linkElement.href = url;
		linkElement.media = 'all';
		linkElement.onload = event => resolve(event);
		linkElement.onerror = err => reject(err);
		const head = document.querySelector('head');
		head.appendChild(linkElement);
	});
};

const loadInlineScript = async code => {
	const scriptElement = document.createElement('script');
	const textNode = document.createTextNode(code);
	scriptElement.appendChild(textNode);
	const head = document.querySelector('head');
	head.appendChild(scriptElement);
	await sleep(1);
};

const main = async () => {
	if (window.location.href != 'https://lichess.org/.bot') {
		await Promise.race([waitForElement('.rmoves'), waitForElement('.tview2')]);
		popup = window.open('https://lichess.org/.bot', '_blank');
		window.addEventListener('beforeunload', function(event) {
			popup.close();
		});
		window.focus(); // Return back to main window (on FF at least)
		return;
	}
	debugger;
	window.document.title = `Client: ${window.opener.location.pathname}`;
	let body = document.getElementsByTagName('body')[0];
	body.innerHTML = `
	<div id="app">
		{{ message }}
		<button class="button">Button</button>
		<div id="console"></div>
	</div>
	<style>
		body {
			background: linear-gradient(rgb(46, 42, 36), rgb(22, 21, 18) 116px) no-repeat rgb(22, 21, 18);
			color: rgb(186, 186, 186);
			font-family: "Noto Sans", sans-serif;
			font-size: 14px;
		}
	</style>`;

	ws = await connect(`ws://127.0.0.1:5678/${uid}`);
	log('Connection estabished.');
	ws.onmessage = function(event) {
		console.log(JSON.parse(event.data));
	};

	await loadCSS('https://cdn.jsdelivr.net/npm/bulma@0.8.0/css/bulma.min.css');

	await loadScript('https://cdn.jsdelivr.net/npm/vue/dist/vue.js');

	await loadInlineScript(`
		var app = new Vue({
			el: '#app',
			data: {
				message: 'Hello Vue!'
			}
		})`);

	doc.addEventListener('visibilitychange', () => {
		ws.send(JSON.stringify({ type: 'visibility', visible: !doc.hidden }));
		log(`Game ${doc.hidden ? 'hidden' : 'visible'}`);
	});
	doc.addEventListener('keydown', hotkey);
	findGame();
};

main();
