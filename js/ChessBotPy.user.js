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
		log('Playing as white');
		app.playingAs = 1;
		ws.send(JSON.stringify({ type: 'setting', data: { key: 'side', value: 1 } }));
	} else if (e.altKey && e.code === 'KeyQ') {
		log('Playing as black');
		app.playingAs = 0;
		ws.send(JSON.stringify({ type: 'setting', data: { key: 'side', value: 0 } }));
	} else if (e.altKey && e.code === 'KeyA') {
		log('Playing as Both');
		app.runEngineFor = 2;
		ws.send(JSON.stringify({ type: 'setting', data: { key: 'run', value: 2 } }));
	} else if (e.altKey && e.code === 'KeyS') {
		log('Stopping');
		app.runEngineFor = 3;
		ws.send(JSON.stringify({ type: 'setting', data: { key: 'run', value: 3 } }));
	}
}

function log(...args) {
	console.log(...args);
	app.messages.push(args.join(' '));
	if (app.consoleBottomedOut) {
		setTimeout(() => {
			var consoleElement = document.getElementById('console');
			consoleElement.scrollTop = consoleElement.scrollHeight;
		}, 1);
	}
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
		newMove = { type: 'move', data: { index, white, move, history } };
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
		newMove = { type: 'move', data: { index, white, move, history } };
		log(`${index}.${white ? '  ' : '..'} ${move}`);
		white = !white;
		return newMove;
	}
	// Result (game ended)
	else if (node.classList.contains('result-wrap')) {
		log('Game ended!');
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
			log(`Changed active target to: ${index} ${white ? 'white' : 'black'} ${move}`);
			return { type: 'history', data: { index, white, move } };
		}
	}
}

const findGame = async () => {
	// Parse initial moves, before watching for mutations
	log('Waiting for game to start...');
	await Promise.race([waitForElement('m2', 60), waitForElement('move', 60)]);
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
			ws.send(JSON.stringify({ type: 'initial', data: initialMoves }));
		}
	} else {
		log('No intial moves to parse...');
	}

	// Get the side you're plaing as
	let turn = doc.querySelector('.rclock-turn__text').innerText.trim();
	let side = turn === 'Your turn' ? (white ? 1 : 0) : white ? 0 : 1;
	app.playingAs = side;
	log('Starting as', side == 0 ? 'black' : 'white');
	ws.send(JSON.stringify({ type: 'setting', data: { key: 'side', value: side } }));

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

const waitForElement = async (selector, timeout) => {
	let now = Date.now();
	const end = now + timeout * 1000;
	while (end > now) {
		now = Date.now();
		const element = doc.querySelector(selector);
		if (element != null) {
			return element;
		}
		await sleep(100);
	}
	console.warn('Waiting for element timed out');
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
		await Promise.race([waitForElement('.rmoves', 60), waitForElement('.tview2', 60)]);
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

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Playing as</span>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input 
							type="radio" name="side" value="1" v-model.number="playingAs" @change="handleSettingChange($event, 'side', 'int')"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">White</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input 
							type="radio" name="side" value="0" v-model.number="playingAs" @change="handleSettingChange($event, 'side', 'int')"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Black</span>
					</label>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Run engine for</span>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input 
							type="radio" name="run-engine" value="3" v-model.number="runEngineFor" @change="handleSettingChange($event, 'run', 'int')"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">None</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input
							type="radio" name="run-engine" value="0" v-model.number="runEngineFor" @change="handleSettingChange($event, 'run', 'int')"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Me</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input
							type="radio" name="run-engine" value="1" v-model.number="runEngineFor" @change="handleSettingChange($event, 'run', 'int')"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Opponent</span>
					</label>
					<label class="radio inline-flex cursor-pointer relative mb-2">
						<input
							type="radio" name="run-engine" value="2" v-model.number="runEngineFor" @change="handleSettingChange($event, 'run', 'int')"
							class="w-6 h-6 bg-gray-900 rounded-full cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Both</span>
					</label>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Limit</span>
					<label class="checkbox inline-flex cursor-pointer relative mb-2">
						<input
							type="checkbox" v-model="useDepth" @change="handleSettingChange($event, 'use_depth', 'checkbox')"
							class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Depth {{ depth }}</span>
					</label>
					<input
						type="range" min="0" max="25" v-model.number="depth" @change="handleSettingChange($event, 'depth', 'int')"
						class="slider appearance-none bg-gray-900 outline-none h-3 rounded-full mt-2 mb-4"
					>
					<label class="checkbox inline-flex cursor-pointer relative mb-2">
						<input
							type="checkbox" v-model="useTime" @change="handleSettingChange($event, 'use_time', 'checkbox')"
							class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Time {{ time }}</span>
					</label>
					<input
						type="range" min="0" max="60" v-model.number="time" @change="handleSettingChange($event, 'time', 'int')"
						class="slider appearance-none bg-gray-900 outline-none h-3 rounded-full mt-2 mb-4"
					>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Principal variations</span>
					<label class="mb-2">
						Multi PV {{ multipv }}
					</label>
					<input
						type="range" min="1" max="20" v-model.number="multipv" @change="handleSettingChange($event, 'multipv', 'int')"
						class="slider appearance-none bg-gray-900 outline-none h-3 rounded-full mt-2 mb-4"
					>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Engine path</span>
					<input
						type="text" v-model="enginePath" @change="handleSettingChange($event, 'engine_path', 'path')"
						class="bg-gray-900 appearance-none border-2 border-gray-900 rounded py-2 px-4 text-gray-400 focus:outline-none focus:border-indigo-500"
					>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Board</span>
					<label class="checkbox inline-flex cursor-pointer relative mb-2">
						<input
							type="checkbox" v-model="drawBoard" @change="handleSettingChange($event, 'draw_board', 'checkbox')"
							class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Draw board</span>
					</label>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Voice</span>
					<label class="checkbox inline-flex cursor-pointer relative mb-2">
						<input
							type="checkbox" v-model="useVoice" @change="handleSettingChange($event, 'use_voice', 'checkbox')"
							class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2">Enable voice</span>
					</label>
				</div>

			</div>

			<div id="board" class="bg-gray-800 p-3" v-html="board">
			</div>

			<div id="pvs" class="bg-gray-800 p-3">
				Principle variations galore!
			</div>

			<div id="console" class="font-mono bg-gray-800 p-3 overflow-y-scroll" @scroll="onConsoleScroll">
				<h1 class="text-4xl font-display text-gray-200">Console</h1>
				<pre v-for='message in messages'>{{message}}</pre>
			</div>

			<div id="settings" class="bg-gray-800 p-3 overflow-y-scroll">
				<h1 class="text-4xl font-display text-gray-200">Engine settings</h1>
				<div v-for="setting in engineSettings" class="mb-4">

					<div class="text-gray-500 font-display font-bold text-xs uppercase tracking-wide mb-2">{{ setting.name }}</div>

					<span v-if="setting.type === 'spin'">
						<input
							type="range" :min="setting.min" :max="setting.max" v-model.number="setting.value"
							class="slider appearance-none w-64 bg-gray-900 outline-none h-3 rounded-full mb-4"
							@change="handleEngineSettingChange(setting.name, setting.value)"
						>
						<span class="text-sm ml-2">{{ setting.value }}</span> <span class="text-sm text-gray-600"> ({{ setting.default }})</span>
					</span>

					<span v-else-if="setting.type === 'combo'">
						<div class="inline-block relative w-64">
							<select 
								v-model="setting.value"
								@change="handleEngineSettingChange(setting.name, setting.value)"
								class="block appearance-none w-full bg-gray-700 px-4 py-2 pr-8 rounded border-2 border-gray-700 focus:outline-none focus:border-indigo-500"
							>
								<option v-for="opt in setting.var">{{opt}}</option>
							</select>
							<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
								<svg class="fill-current text-white h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
							</div>
						</div>
					</span>

					<span v-else-if="setting.type === 'string'">
						<input
							type="text" v-model="setting.value"
							@change="handleEngineSettingChange(setting.name, setting.value)"
							class="bg-gray-900 w-64 appearance-none border-2 border-gray-900 rounded py-2 px-4 text-gray-400 mb-4 focus:outline-none focus:border-indigo-500"
						>
						<span class="text-sm text-gray-600 ml-2"> ({{ setting.default }})</span>
					</span>

					<span v-else-if="setting.type === 'check'">
						<label class="checkbox inline-flex cursor-pointer relative mb-2">
							<input
								type="checkbox" v-model="setting.value"
								@change="handleEngineSettingChange(setting.name, setting.value)"
								class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
							>
							<span class="ml-2">{{ setting.value }}</span>
						</label>
					</span>

					<span v-else-if="setting.type === 'button'">
						<button class="bg-indigo-500 w-64 hover:bg-indigo-600 text-white py-2 px-4 rounded">
							{{ setting.name }}
						</button>
					</span>

					<span v-else class="mb-5">
						{{ setting.type }} ???
					</span>

				</div>
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
			grid-template-columns: 1fr;
			grid-template-rows: 50vh 50vh 50vh 50vh 50vh;
			grid-template-areas:
				"main"
				"board"
				"pvs"
				"console"
				"engine";
		}

		@media (min-width: 1024px) {
			#layout {
				grid-template-columns: 1fr 1fr;
				grid-template-rows: 40vh 50vh 40vh;
				grid-template-areas:
					"main main"
					"pvs board"
					"engine console";
			}
		}

		@media (min-width: 1280px) {
			#layout {
				grid-template-columns: 11fr 7fr 6fr;
				grid-template-rows: 1fr 1fr;
				grid-template-areas:
					"main pvs board"
					"engine console console";
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
		}

		#pvs {
			grid-area: pvs;
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

		.slider::-webkit-slider-thumb {
			-webkit-appearance: none;
			appearance: none;
			width: 1.5rem;
			height: 1.5rem;
			background-color: #667eea;
			border-radius: 9999px;
			cursor: pointer;
		}

		.slider::-moz-range-thumb {
			-webkit-appearance: none;
			appearance: none;
			width: 1.5rem;
			height: 1.5rem;
			background-color: #667eea;
			border-radius: 9999px;
			cursor: pointer;
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
			consoleBottomedOut: true,
			engineSettings: [],
			drawBoard: true,
			useVoice: true,
			multipv: 1,
		},
		methods: {
			onConsoleScroll(event) {
				const top = Math.round(event.target.scrollTop);
				const offset = event.target.scrollHeight - event.target.offsetHeight;
				this.consoleBottomedOut = top === offset;
			},
			handleSettingChange(event, key, type) {
				let value = event.target.value;
				if (type == 'checkbox') {
					value = event.target.checked;
				} else if (type == 'int') {
					value = parseInt(value);
				} else if (type == 'path') {
					value = value.replace(/\\/g, '/');
				}
				log(`Changed ${key} to:`, value);
				ws.send(JSON.stringify({ type: 'setting', data: { key, value } }));
			},
			handleEngineSettingChange(key, value) {
				log(`Changed engine setting ${key} to:`, value);
				ws.send(JSON.stringify({ type: 'engine_setting', data: { key, value } }));
			},
		},
	});

	try {
		ws = await connect(`ws://127.0.0.1:5678/${uid}`);
	} catch {
		log('Failed to connect. Make sure the server is running and refresh the page.');
		return;
	}
	log('Connection estabished.');
	ws.onmessage = function(event) {
		data = JSON.parse(event.data);
		switch (data.target) {
			case 'board':
				app.board = data.message;
				break;
			case 'error':
				log(data.message);
				break;
			case 'setting':
				const { key, value } = data.message;
				if (key in app.$data) {
					app.$data[key] = value;
				} else {
					console.error(`No key: ${key} found in app data!`);
					log(`Error: No key: ${key} found in app data!`);
				}

				break;
			case 'engine_settings':
				app.engineSettings = data.message;
				log('Received engine settings');
				break;
			default:
				log('Received unknown message type, see console for details');
				console.log(data);
		}
	};

	doc.addEventListener('visibilitychange', () => {
		ws.send(JSON.stringify({ type: 'visibility', data: !doc.hidden }));
		log(`Game ${doc.hidden ? 'hidden' : 'visible'}`);
	});
	doc.addEventListener('keydown', hotkey);
	await findGame();
};

main();
