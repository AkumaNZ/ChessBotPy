// ==UserScript==
// @name        ChessBotPy
// @namespace   ChessBotPy
// @match       *://lichess.org/*
// @grant       none
// @version     1.7
// @author      FallDownTheSystem
// @description ChessBotPy Client
// ==/UserScript==

// A new window is opened to allow a websocket connection, since the main page has a restricted CSP
// this is just an alias to the document object of the main window
let doc = window.document;
if (window.opener != null) {
	doc = window.opener.document;
}
// asd
// Global state
let index = 0;
let white = true;
let move = '';
let activeTarget = '';
let uid = uuidv4();
let ws = null;
let app = null;

function uuidv4() {
	return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
		(c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
	);
}

function hotkey(e) {
	if (e.altKey && e.code === 'KeyW') {
		logToConsole('Playing as white');
		ws.send(JSON.stringify({ type: 'hotkey', data: 1 }));
	} else if (e.altKey && e.code === 'KeyQ') {
		logToConsole('Playing as black');
		ws.send(JSON.stringify({ type: 'hotkey', data: 0 }));
	} else if (e.altKey && e.code === 'KeyA') {
		logToConsole('Playing as Both');
		ws.send(JSON.stringify({ type: 'hotkey', data: 2 }));
	} else if (e.altKey && e.code === 'KeyS') {
		logToConsole('Stopping');
		ws.send(JSON.stringify({ type: 'hotkey', data: 3 }));
	}
}

function logToConsole(...args) {
	console.log(...args);
	app.messages.push(args.join(' '));
}

var observer = new MutationObserver(mutations => {
	attributeChanges = mutations.filter(x => x.type === 'attributes' && x.attributeName === 'class');
	if (attributeChanges.length > 0) {
		activeChanges = attributeChanges.filter(
			x => (x.target.nodeName === 'MOVE' || x.target.nodeName === 'M2') && x.target.classList.contains('active')
		);
		if (activeChanges.length == 0 && activeTarget != 'starting-position') {
			logToConsole(`Changed active target to: Starting position`);
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
		newMove = { type: 'move', data: { index, white, move, history } };
		logToConsole(`${index}.${white ? '  ' : '..'} ${move}`);
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
		newMove = { type: 'move', data: { index, white, move, history } };
		logToConsole(`${index}.${white ? '  ' : '..'} ${move}`);
		white = !white;
		return newMove;
	}
	// Result (game ended)
	else if (node.classList.contains('result-wrap')) {
		logToConsole('Game ended!');
		return { type: 'result', data: 'ended' };
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
			logToConsole(`Changed active target to: ${index} ${white ? 'white' : 'black'} ${move}`);
			return { type: 'history', data: { index, white, move } };
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
		logToConsole('Parsing initial moves');
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
			ws.send(JSON.stringify({ type: 'initial', data: initialMoves }));
		}
	} else {
		logToConsole('No intial moves to parse...');
	}

	if (doc.querySelector('.rmoves') != null) {
		observer.observe(doc.querySelector('.rmoves'), {
			attributes: true,
			childList: true,
			subtree: true,
		});
		logToConsole('Attached mutation observer on ".rmoves"');
	} else if (doc.querySelector('.tview2') != null) {
		observer.observe(doc.querySelector('.tview2'), {
			attributes: true,
			childList: true,
			subtree: true,
		});
		logToConsole('Attached mutation observer on ".tview2"');
	} else {
		logToConsole('No target found for mutation observer to attach to');
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

	await loadCSS('http://127.0.0.1:8080/dist/tailwind.css');
	await loadCSS(
		'https://fonts.googleapis.com/css?family=Nunito:300,300i,400,400i,600,600i,700,700i|Open+Sans:300,300i,400,400i,600,600i,700,700i&display=swap'
	);
	await loadScript('https://cdn.jsdelivr.net/npm/vue/dist/vue.js');

	let body = document.getElementsByTagName('body')[0];
	body.classList.add('bg-gray-900');
	// To make sure PurgeCSS generates html classes
	// <html></html>
	body.innerHTML = `
	<div id="app" class="font-sans text-gray-100">
		<div id="layout">
			<div id="main" class="bg-gray-800 p-3">

				<div class="inline-flex flex-col mr-10">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Playing as</span>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input 
							type="radio" name="side" value="1" v-model="playingAs" 
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">White</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input 
							type="radio" name="side" value="0" v-model="playingAs" 
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Black</span>
					</label>
				</div>

				<div class="inline-flex flex-col mr-10">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Run engine for</span>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input 
							type="radio" name="run-engine" value="3" v-model="runEngineFor"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">None</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input
							type="radio" name="run-engine" value="0" v-model="runEngineFor"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Me</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input
							type="radio" name="run-engine" value="1" v-model="runEngineFor"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Opponent</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input
							type="radio" name="run-engine" value="2" v-model="runEngineFor"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Both</span>
					</label>
				</div>

				<div class="inline-flex flex-col mr-10">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Limit</span>
					<label class="checkbox inline-flex cursor-pointer relative mb-2">
						<input
							type="checkbox" v-model="useDepth"
							class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Depth</span>
					</label>
					<label class="checkbox inline-flex cursor-pointer relative mb-2">
						<input
							type="checkbox" v-model="useTime"
							class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Time</span>
					</label>
				</div>

				<div class="inline-flex flex-col mr-10">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Engine</span>
					<label for="engine-path">
						Path
					</label>
					<input
						type="text" v-model="enginePath" @change="handleEnginePath"
						class="appearance-none bg-gray-900 text-gray-400 rounded py-3 px-4 mb-3 focus:outline-none border border-none focus:border-solid border-indigo-500" 
					>
				</div>

			</div>

			<div id="board" class="bg-gray-800 p-3" v-html="board">
			</div>

			<div id="console" class="font-mono bg-gray-800 p-3">
				<pre v-for='message in messages'>{{message}}</pre>
			</div>

			<div id="settings" class="bg-gray-800 p-3">
				<button class="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow">
					Settings
				</button>
				<label class="checkbox inline-flex cursor-pointer relative">
					<input type="checkbox" class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none">
					<span class="ml-2">Check Me</span>
				</label>
			</label>
			</div>
		</div>
	</div>

	<style>
		#layout {
			display: grid;
			grid-gap: 2px;
			height: 100vh;
			padding: 2px;
			grid-template-columns: 12fr;
			grid-template-rows: 50vh 50vh 50vh 50vh;
			grid-template-areas:
				"main"
				"engine"
				"board"
				"console";
		}

		@media (min-width: 1024px) {
			#layout {
				grid-template-columns: 6fr 6fr;
				grid-template-rows: 1fr 1fr;
				grid-template-areas:
					"main board"
					"engine console";
			}
		}

		#main {
			grid-area: main;
		}

		#board {
			grid-area: board;
		}

		#board > svg {
			height: 100%;
		}

		#settings {
			grid-area: engine;
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
		
		.checkbox > input:checked {
			background-color: #667eea;
		}
		
		.checkbox > input:checked + span::before {
			content: '✓';
			color: white;
			font-weight: bolder;
			position: absolute;
			left: 0.4rem;
		}

		.radio > input:checked {
			background-color: #667eea;
		}
		
		.radio > input:checked + span::before {
			content: '';
			display: block;
			background: white;
			width: 0.6rem;
			height: 0.6rem;
			border-radius: 9999px;
			position: absolute;
			left: 0.45rem;
			top: 0.45rem;
		}
		// Generated tailwindcss goes here

		</style>`;

	app = new Vue({
		el: '#app',
		data: {
			board: '',
			messages: [],
			enginePath: '',
			playingAs: 0,
			runEngineFor: 0,
			useDepth: true,
			depth: 8,
			useTime: false,
			time: 0,
		},
		methods: {
			handleEnginePath(event) {
				let path = event.target.value;
				path = path.replace(/\\/g, '/');
				this.enginePath = path;
				logToConsole('Changed engine path to:', path);
				ws.send(JSON.stringify({ type: 'setting', data: { key: 'engine_path', value: path } }));
			},
		},
	});

	try {
		ws = await connect(`ws://127.0.0.1:5678/${uid}`);
	} catch {
		logToConsole('Failed to connect. Make sure the server is running and refresh the page.');
		return;
	}
	logToConsole('Connection estabished.');
	ws.onmessage = function(event) {
		data = JSON.parse(event.data);
		switch (data.target) {
			case 'board':
				app.board = data.message;
				break;
			case 'error':
				logToConsole(data.message);
				break;
			case 'setting':
				const { key, value } = data.message;
				if (Array.isArray(app.$data[key])) {
					app.$data[key].push(value);
				} else {
					switch (typeof app.$data[key]) {
						case 'string':
						case 'object':
							app.$data[key] = value;
							break;
						case 'number':
							app.$data[key] = parseInt(value);
							break;
						case 'boolean':
							app.$data[key] = value == 'true';
							break;
						default:
							logToConsole('Unknown data type', key, value);
							break;
					}
				}
				break;
			default:
				logToConsole('Received unknown message type, see console for details');
				console.log(data);
		}
	};

	doc.addEventListener('visibilitychange', () => {
		ws.send(JSON.stringify({ type: 'visibility', data: !doc.hidden }));
		logToConsole(`Game ${doc.hidden ? 'hidden' : 'visible'}`);
	});
	doc.addEventListener('keydown', hotkey);
	await findGame();
};

main();
