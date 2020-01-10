// ==UserScript==
// @name        ChessBotLichess
// @namespace   ChessBotPy
// @match       *://lichess.org/*
// @grant       none
// @version     1.6
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
	body.innerHTML += `<p>${args.join(' ')}</p>`;
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

const findGame = async () => {
	// Parse initial moves, before watching for mutations
	await Promise.race([waitForElement('move'), waitForElement('m2')]);
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
};

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
		const element = doc.querySelector(selector);
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
	window.document.title = `Client: ${window.opener.location.pathname}`;

	await loadCSS('https://unpkg.com/tailwindcss@^1.0/dist/tailwind.min.css');
	await loadCSS(
		'https://fonts.googleapis.com/css?family=Nunito:300,300i,400,400i,600,600i,700,700i|Open+Sans:300,300i,400,400i,600,600i,700,700i&display=swap'
	);
	await loadScript('https://cdn.jsdelivr.net/npm/vue/dist/vue.js');

	let body = document.getElementsByTagName('body')[0];
	body.classList.add('bg-gray-900');
	body.innerHTML = `
	<div id="app" class="font-sans text-gray-100">
		<div id="layout">
			<div id="main" class="bg-gray-800 rounded-lg p-3">
				<h1 class="font-display text-5xl">
					Main
				</h1>
				<button class="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow">
					Button
				</button>
			</div>
			<div id="board" class="bg-gray-800 rounded-lg p-3">
				<h1 class="font-display text-5xl">
					Board
				</h1>
			</div>
			<div id="console" class="font-mono bg-gray-800 rounded-lg p-3">
				<h1 class="font-display text-5xl">
					Console
				</h1>
			</div>
			<div id="settings" class="bg-gray-800 rounded-lg p-3">
				<h1 class="font-display text-5xl">
					Settings
				</h1>
			</div>
		</div>
	</div>
	<style>
		#layout {
			display: grid;
			height: 100vh;
			padding: 12px;
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 1fr 1fr;
			grid-gap: 12px;
			grid-template-areas:
				"main board"
				"settings console";
		}
		@media (max-width: 1240px) {
			#layout {
				grid-template-columns: 1fr;
				grid-template-rows: 1fr;
				grid-template-areas:
					"main"
					"settings"
					"board"
					"console";
			}
		}
		#main {
			grid-area: main;
		}
		#board {
			grid-area: board;
		}
		#settings {
			grid-area: settings;
		}
		#console {
			grid-area: console;
			overflow-y: scroll;
		}
		.font-sans {
			font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji" !important;
		}
		.font-serif {
			font-family: Georgia, Cambria, "Times New Roman", Times, serif !important;
		}
		.font-mono {
			font-family: Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
		}
		.font-display {
			font-family: 'Nunito', 'Open Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji" !important;
		}
	</style>`;

	try {
		ws = await connect(`ws://127.0.0.1:5678/${uid}`);
	} catch {
		log('Failed to connect, make sure the server is running.');
	}
	log('Connection estabished.');
	ws.onmessage = function(event) {
		console.log(JSON.parse(event.data));
	};

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
	await findGame();
};

main();
