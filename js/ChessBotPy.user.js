// ==UserScript==
// @name        ChessBotPy
// @namespace   ChessBotPy
// @match       *://lichess.org/*
// @grant       none
// @version     1.8
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
	await Promise.race([waitForElement('m2', 2), waitForElement('move', 2)]);
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
			initialMoves[initialMoves.length - 1].data.history = false;
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
	return null;
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
		element = await Promise.race([waitForElement('.rmoves', 60), waitForElement('.tview2', 60)]);
		if (element == null) {
			return;
		}
		popup = window.open('https://lichess.org/.bot', '_blank');
		window.addEventListener('beforeunload', function(event) {
			popup.close();
		});
		window.focus(); // Return back to main window (on FF at least)
		return;
	}
	window.document.title = `Client: ${window.opener.location.pathname}`;

	// await loadCSS('http://127.0.0.1:8080/dist/tailwind.css');
	await loadCSS(
		'https://fonts.googleapis.com/css?family=Nunito:300,300i,400,400i,600,600i,700,700i|Open+Sans:300,300i,400,400i,600,600i,700,700i&display=swap'
	);
	await loadScript('https://cdn.jsdelivr.net/npm/vue/dist/vue.js');
	const styleString = `
	#layout {
		display: grid;
		grid-gap: 2px;
		height: 100vh;
		padding: 2px;
		grid-template-columns: 1fr;
		grid-template-rows: 50vh 56vh 43vh 50vh 50vh;
		grid-template-areas:
			"main"
			"board"
			"pvs"
			"console"
			"engine";
	}

	@media (min-width: 1024px) {
		#layout {
			grid-template-columns: 1fr;
			grid-template-rows: 40vh 50vh 40vh;
			grid-template-areas:
				"main main"
				"pvs board"
				"engine console";
		}
	}

	@media (min-width: 1280px) {
		#layout {
			grid-template-columns: 10fr 10fr 13fr;
			grid-template-rows: 12fr 10fr;
			grid-template-areas:
				"main main board"
				"engine console pvs";
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

	#board > svg line, #board > svg polygon {
		opacity: 100%
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
	/*! normalize.css v8.0.1 | MIT License | github.com/necolas/normalize.css */html{line-height:1.15;-webkit-text-size-adjust:100%}body{margin:0}main{display:block}h1{font-size:2em;margin:.67em 0}pre{font-family:monospace,monospace;font-size:1em}a{background-color:transparent}code{font-family:monospace,monospace;font-size:1em}button,input,select{font-family:inherit;font-size:100%;line-height:1.15;margin:0}button,input{overflow:visible}button,select{text-transform:none}[type=button],[type=reset],[type=submit],button{-webkit-appearance:button}[type=button]::-moz-focus-inner,[type=reset]::-moz-focus-inner,[type=submit]::-moz-focus-inner,button::-moz-focus-inner{border-style:none;padding:0}[type=button]:-moz-focusring,[type=reset]:-moz-focusring,[type=submit]:-moz-focusring,button:-moz-focusring{outline:1px dotted ButtonText}[type=checkbox],[type=radio]{box-sizing:border-box;padding:0}[type=number]::-webkit-inner-spin-button,[type=number]::-webkit-outer-spin-button{height:auto}[type=search]{-webkit-appearance:textfield;outline-offset:-2px}[type=search]::-webkit-search-decoration{-webkit-appearance:none}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}details{display:block}[hidden]{display:none}html{box-sizing:border-box;font-family:sans-serif}*,:after,:before{box-sizing:inherit}h1,pre{margin:0}button{background:transparent;padding:0}button:focus{outline:1px dotted;outline:5px auto -webkit-focus-ring-color}html{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;line-height:1.5}*,:after,:before{border:0 solid #e2e8f0}input::-webkit-input-placeholder{color:#a0aec0}input::-moz-placeholder{color:#a0aec0}input:-ms-input-placeholder{color:#a0aec0}input::-ms-input-placeholder{color:#a0aec0}input::placeholder{color:#a0aec0}[role=button],button{cursor:pointer}h1{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}button,input,select{padding:0;line-height:inherit;color:inherit}code,pre{font-family:Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace}object,svg{display:block;vertical-align:middle}.appearance-none{-webkit-appearance:none;-moz-appearance:none;appearance:none}.bg-gray-700{background-color:#4a5568}.bg-gray-800{background-color:#2d3748}.bg-gray-900{background-color:#1a202c}.bg-indigo-500{background-color:#667eea}.hover\\:bg-indigo-600:hover{background-color:#5a67d8}.border-gray-500{border-color:#a0aec0}.border-gray-700{border-color:#4a5568}.border-gray-900{border-color:#1a202c}.border-indigo-500{border-color:#667eea}.hover\\:border-indigo-400:hover{border-color:#7f9cf5}.focus\\:border-indigo-500:focus{border-color:#667eea}.rounded{border-radius:.25rem}.rounded-full{border-radius:9999px}.border-2{border-width:2px}.cursor-pointer{cursor:pointer}.focus-within\\:cursor-move:focus-within{cursor:move}.first\\:cursor-move:first-child{cursor:move}.last\\:cursor-move:last-child{cursor:move}.odd\\:cursor-move:nth-child(odd){cursor:move}.even\\:cursor-move:nth-child(2n){cursor:move}.hover\\:cursor-move:hover{cursor:move}.focus\\:cursor-move:focus{cursor:move}.active\\:cursor-move:active{cursor:move}.visited\\:cursor-move:visited{cursor:move}.disabled\\:cursor-move:disabled{cursor:move}.block{display:block}.inline-block{display:inline-block}.flex{display:-webkit-box;display:flex}.inline-flex{display:-webkit-inline-box;display:inline-flex}.hidden{display:none}.flex-row{-webkit-box-direction:normal;flex-direction:row}.flex-row{-webkit-box-orient:horizontal}.flex-col{-webkit-box-orient:vertical;-webkit-box-direction:normal;flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{-webkit-box-align:center;align-items:center}.font-sans{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji}.font-mono{font-family:Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace}.font-bold{font-weight:700}.h-3{height:.75rem}.h-4{height:1rem}.h-6{height:1.5rem}.h-10{height:2.5rem}.mt-2{margin-top:.5rem}.mb-2{margin-bottom:.5rem}.ml-2{margin-left:.5rem}.mb-3{margin-bottom:.75rem}.mr-4{margin-right:1rem}.mb-4{margin-bottom:1rem}.mb-5{margin-bottom:1.25rem}.mr-10{margin-right:2.5rem}.outline-none{outline:0}.focus\\:outline-none:focus{outline:0}.overflow-y-auto{overflow-y:auto}.p-2{padding:.5rem}.p-3{padding:.75rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-4{padding-left:1rem;padding-right:1rem}.pr-8{padding-right:2rem}.pointer-events-none{pointer-events:none}.absolute{position:absolute}.relative{position:relative}.inset-y-0{top:0;bottom:0}.right-0{right:0}.fill-current{fill:currentColor}.text-white{color:#fff}.text-gray-100{color:#f7fafc}.text-gray-200{color:#edf2f7}.text-gray-400{color:#cbd5e0}.text-gray-500{color:#a0aec0}.text-gray-600{color:#718096}.text-gray-700{color:#4a5568}.text-xs{font-size:.75rem}.text-sm{font-size:.875rem}.text-4xl{font-size:2.25rem}.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:.025em}.visible{visibility:visible}.whitespace-pre-wrap{white-space:pre-wrap}.w-4{width:1rem}.w-6{width:1.5rem}.w-32{width:8rem}.w-64{width:16rem}.w-1\\/2{width:50%}.w-full{width:100%}@media (min-width:640px){.sm\\:cursor-move{cursor:move}.sm\\:focus-within\\:cursor-move:focus-within{cursor:move}.sm\\:first\\:cursor-move:first-child{cursor:move}.sm\\:last\\:cursor-move:last-child{cursor:move}.sm\\:odd\\:cursor-move:nth-child(odd){cursor:move}.sm\\:even\\:cursor-move:nth-child(2n){cursor:move}.sm\\:hover\\:cursor-move:hover{cursor:move}.sm\\:focus\\:cursor-move:focus{cursor:move}.sm\\:active\\:cursor-move:active{cursor:move}.sm\\:visited\\:cursor-move:visited{cursor:move}.sm\\:disabled\\:cursor-move:disabled{cursor:move}}@media (min-width:768px){.md\\:cursor-move{cursor:move}.md\\:focus-within\\:cursor-move:focus-within{cursor:move}.md\\:first\\:cursor-move:first-child{cursor:move}.md\\:last\\:cursor-move:last-child{cursor:move}.md\\:odd\\:cursor-move:nth-child(odd){cursor:move}.md\\:even\\:cursor-move:nth-child(2n){cursor:move}.md\\:hover\\:cursor-move:hover{cursor:move}.md\\:focus\\:cursor-move:focus{cursor:move}.md\\:active\\:cursor-move:active{cursor:move}.md\\:visited\\:cursor-move:visited{cursor:move}.md\\:disabled\\:cursor-move:disabled{cursor:move}}@media (min-width:1024px){.lg\\:cursor-move{cursor:move}.lg\\:focus-within\\:cursor-move:focus-within{cursor:move}.lg\\:first\\:cursor-move:first-child{cursor:move}.lg\\:last\\:cursor-move:last-child{cursor:move}.lg\\:odd\\:cursor-move:nth-child(odd){cursor:move}.lg\\:even\\:cursor-move:nth-child(2n){cursor:move}.lg\\:hover\\:cursor-move:hover{cursor:move}.lg\\:focus\\:cursor-move:focus{cursor:move}.lg\\:active\\:cursor-move:active{cursor:move}.lg\\:visited\\:cursor-move:visited{cursor:move}.lg\\:disabled\\:cursor-move:disabled{cursor:move}}@media (min-width:1280px){.xl\\:cursor-move{cursor:move}.xl\\:focus-within\\:cursor-move:focus-within{cursor:move}.xl\\:first\\:cursor-move:first-child{cursor:move}.xl\\:last\\:cursor-move:last-child{cursor:move}.xl\\:odd\\:cursor-move:nth-child(odd){cursor:move}.xl\\:even\\:cursor-move:nth-child(2n){cursor:move}.xl\\:hover\\:cursor-move:hover{cursor:move}.xl\\:focus\\:cursor-move:focus{cursor:move}.xl\\:active\\:cursor-move:active{cursor:move}.xl\\:visited\\:cursor-move:visited{cursor:move}.xl\\:disabled\\:cursor-move:disabled{cursor:move}}
	`;
	let head = document.getElementsByTagName('head')[0];
	style = document.createElement('style');
	style.type = 'text/css';
	style.innerHTML = styleString;
	head.appendChild(style);

	let body = document.getElementsByTagName('body')[0];
	body.classList.add('bg-gray-900');
	// To make sure PurgeCSS generates html classes
	// <html></html>
	body.innerHTML = `
	<div id="app" class="font-sans text-gray-100">
		<div id="layout">
			<div id="main" class="bg-gray-800 p-3 overflow-y-auto">

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
						type="range" min="0" max="60" step="0.1" v-model.number="time" @change="handleSettingChange($event, 'time', 'float')"
						class="slider appearance-none bg-gray-900 outline-none h-3 rounded-full mt-2 mb-4"
					>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Principal variations</span>
					<label class="mb-2">
						PV {{ multipv }}
					</label>
					<input
						type="range" min="1" max="10" v-model.number="multipv" @change="handleSettingChange($event, 'multipv', 'int')"
						class="slider appearance-none bg-gray-900 outline-none h-3 rounded-full mt-2 mb-4"
					>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Engine path</span>
					<input
						type="text" v-model="enginePath" @change="handleSettingChange($event, 'engine_path', 'path')" :title="enginePath"
						class="bg-gray-900 w-64 h-10 appearance-none border-2 border-gray-900 rounded py-2 px-4 text-gray-400 focus:outline-none focus:border-indigo-500"
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

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Opening book</span>
					<input
						type="text" v-model="book1" @change="handleSettingChange($event, 'bookfile', 'path')" :title="book1"
						class="bg-gray-900 w-64 h-10 appearance-none border-2 border-gray-900 rounded py-2 px-4 text-gray-400 focus:outline-none focus:border-indigo-500"
					>
				</div>

				<div class="inline-flex flex-col mr-10 mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Opening book 2</span>
					<input
						type="text" v-model="book2" @change="handleSettingChange($event, 'bookfile2', 'path')" :title="book2"
						class="bg-gray-900 w-64 h-10 appearance-none border-2 border-gray-900 rounded py-2 px-4 text-gray-400 focus:outline-none focus:border-indigo-500"
					>
				</div>

				<div class="inline-flex flex-col mb-4">
					<span class="text-gray-500 font-display font-bold mb-2 text-xs uppercase tracking-wide">Engline log</span>
					<label class="checkbox inline-flex cursor-pointer relative mb-2">
						<input
							type="checkbox" v-model="logEngine" @change="handleSettingChange($event, 'log_engine', 'checkbox')"
							class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
						>
						<span class="ml-2" title="Clear log each time before engine is ran">Clear log</span>
					</label>
				</div>

			</div>

			<div id="board" class="bg-gray-800 p-3" v-html="board" v-if="drawBoard">
			</div>

			<div id="pvs" class="bg-gray-800 p-3 overflow-y-auto">
				<div class="flex flex-row flex-wrap">
					<div
						v-for="(line, pv_index) in pvs"
						@click="onSelectPV(pv_index + 1)"
						class="w-32 mr-4 mb-3 p-2 border-2 border-gray-500 rounded hover:border-indigo-400"
						:class="{ 'border-indigo-500': selectedPV == pv_index + 1 }"
					>
						<div class="text-gray-500 font-display font-bold text-xs uppercase tracking-wide mb-2">
							PV {{ line.multipv }}
							<span class="font-sans text-white text-sm ml-2">
								{{ line.score }}
							</span>
						</div>
						<div class="flex flex-row flex-wrap">
							<div v-for="(mov, i) in line.pv" class="w-1/2">
								<span :class="{ 'text-gray-400': i % 2 != 0 }">{{ mov }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div id="console" class="font-mono bg-gray-800 p-3 overflow-y-auto" @scroll="onConsoleScroll">
				<h1 class="text-4xl font-display text-gray-200">Console</h1>
				<pre v-for='message in messages' class="whitespace-pre-wrap">{{message}}</pre>
			</div>

			<div id="settings" class="bg-gray-800 p-3 overflow-y-auto">
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
							type="text" v-model="setting.value" :title="setting.value"
							@change="handleEngineSettingChange(setting.name, setting.value)"
							class="bg-gray-900 w-64 h-10 appearance-none border-2 border-gray-900 rounded py-2 px-4 text-gray-400 mb-4 focus:outline-none focus:border-indigo-500"
						>
						<span class="text-sm text-gray-600 ml-2"> ({{ setting.default }})</span>
					</span>

					<span v-else-if="setting.type === 'check'">
						<label class="checkbox inline-flex cursor-pointer relative mb-2">
							<input
								type="checkbox" v-model="setting.value" true-value="True" false-value="False"
								@change="handleEngineSettingChange(setting.name, setting.value)"
								class="w-6 h-6 bg-gray-900 rounded cursor-pointer outline-none appearance-none"
							>
							<span class="ml-2">{{ setting.value.toString().toLowerCase() == 'true' ? 'Enabled' : 'Disabled' }}</span>
						</label>
					</span>

					<span v-else-if="setting.type === 'button'">
						<button
							class="bg-indigo-500 w-64 hover:bg-indigo-600 text-white py-2 px-4 rounded"
							@click='handleButton(setting.name)'
						>
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
	</div>`;

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
			time: 0.0,
			consoleBottomedOut: true,
			engineSettings: [],
			drawBoard: true,
			useVoice: true,
			multipv: 1,
			book1: '',
			book2: '',
			logEngine: '',
			pvs: [],
			selectedPV: 1,
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
				} else if (type == 'float') {
					value = parseFloat(value);
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
			handleButton(key) {
				if (key === 'Clear Hash') {
					log('Clearing hash...');
					ws.send(JSON.stringify({ type: 'clear_hash', data: true }));
				}
			},
			onSelectPV(pv) {
				log('Changing PV to', pv);
				this.selectedPV = pv;
				ws.send(JSON.stringify({ type: 'draw_svg', data: pv }));
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
			case 'multipv':
				app.pvs = data.message;
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
