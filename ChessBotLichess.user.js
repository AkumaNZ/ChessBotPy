// ==UserScript==
// @name        ChessBotLichess
// @namespace   ChessBotPy
// @match       *://lichess.org/*
// @grant       none
// @version     1.1
// @author      -
// @description Lichess Spy
// ==/UserScript==

// Helper functions
function docReady(fn) {
	// Set a one second timeout, just in case
	setTimeout(() => {
		// see if DOM is already available
		if (document.readyState === 'complete' || document.readyState === 'interactive') {
			// call on next available tick
			setTimeout(fn, 1);
		} else {
			document.addEventListener('DOMContentLoaded', fn);
		}
	}, 1000);
}

function log(...args) {
	console.log(...args);
	body = document.querySelector('body');
	body.innerHTML += `<pre>${args.join(' ')}</pre>`;
}

// Global state
let index = 0;
let white = true;
let move = '';
let moves = [];
let activeTarget = '';

// A new window is opened to allow a websocket connection, since the main page has a restricted CSP
// this is just an alias to the document object of the main window
let doc = window.document;
if (window.opener != null) {
	doc = window.opener.document;
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
				parseMove(node, false);
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
		newMove = { index, white, move, history };
		moves.push(newMove);
		log(`${index}.${white ? '  ' : '..'} ${move}`);
		white = !white;
		ws.send(JSON.stringify(newMove));
	}
	// New turn
	else if (node.nodeName === 'INDEX') {
		index = parseInt(node.firstChild.textContent);
	}
	// New move
	else if (node.nodeName === 'MOVE' || node.nodeName === 'M2') {
		move = node.firstChild.textContent;
		newMove = { index, white, move, history };
		moves.push(newMove);
		log(`${index}.${white ? '  ' : '..'} ${move}`);
		white = !white;
		ws.send(JSON.stringify(newMove));
	}
	// Result (game ended)
	else if (node.classList.contains('result-wrap')) {
		log('Game ended!');
		ws.send(JSON.stringify({ status: 'ended' }));
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
			return { index, white, move };
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
		for (let node of nodes.children) {
			parseMove(node, true);
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

docReady(() => {
	// If not on popup and page has a valid game
	if (
		window.location.href != 'https://lichess.org/.bot' &&
		(document.querySelector('.rmoves') != null || document.querySelector('.tview2') != null)
	) {
		popup = window.open('https://lichess.org/.bot', '_blank');
		window.addEventListener('beforeunload', function(event) {
			popup.close();
		});
		window.focus(); // Return back to main window (on FF at least)
	} else {
		// Not declaring ws so that it becomes global
		ws = new WebSocket(`ws://127.0.0.1:5678${window.opener.location.pathname}`);
		ws.onopen = () => {
			let body = document.querySelector('body');
			body.innerHTML = `
			<style>
				body {
					background: linear-gradient(rgb(46, 42, 36), rgb(22, 21, 18) 116px) no-repeat rgb(22, 21, 18);
					color: rgb(186, 186, 186);
					font-family: "Noto Sans", sans-serif;
					font-size: 14px;
				}
				pre {
					margin: 0px; 
				}
			</style>`;
			log('Connection estabished.');
			findGame();
			window.addEventListener('beforeunload', function(event) {
				ws.close(1000, 'Closed window');
			});
		};
	}
});
