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
	// see if DOM is already available
	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		// call on next available tick
		setTimeout(fn, 1);
	} else {
		document.addEventListener('DOMContentLoaded', fn);
	}
}

// Global state
let index = 0;
let white = true;
let move = '';
let moves = [];

// A new window is opened to allow a websocket connection, since the main page has a restricted CSP
// this is just an alias to the document object of the main window
let doc = window.document;
if (window.opener != null) {
	doc = window.opener.document;
}

var observer = new MutationObserver(mutations => {
	for (let mutation of mutations) {
		// Process new nodes
		if (mutation.addedNodes.length) {
			for (node of mutation.addedNodes) {
				parseMove(node);
			}
		}
		// Process 'active' change
		else if (
			mutation.type === 'attributes' &&
			mutation.attributeName === 'class' &&
			(mutation.target.nodeName === 'MOVE' || mutation.target.nodeName === 'M2') &&
			mutation.target.classList.contains('active')
		) {
			let index = 0;
			let move = mutation.target.firstChild.textContent;
			let player = 'white';
			if (mutation.target.previousSibling.nodeName === 'INDEX') {
				index = parseInt(mutation.target.previousSibling.firstChild.textContent);
			} else if (mutation.target.previousSibling.previousSibling.nodeName === 'INDEX') {
				index = parseInt(mutation.target.previousSibling.previousSibling.firstChild.textContent);
				player = 'black';
			}
			console.log('Changed active target to:', index, player, move);
		}
	}
});

function parseMove(node) {
	// First move (initializing div.moves)
	if (node.nodeName === 'DIV' && node.classList.contains('moves')) {
		index = parseInt(node.firstChild.firstChild.textContent);
		move = node.lastChild.firstChild.textContent;
		newMove = { index, white, move };
		moves.push(newMove);
		white = !white;
		console.log(newMove);
		ws.send(JSON.stringify(newMove));
	}
	// New turn
	else if (node.nodeName === 'INDEX') {
		index = parseInt(node.firstChild.textContent);
	}
	// New move
	else if (node.nodeName === 'MOVE' || node.nodeName === 'M2') {
		move = node.firstChild.textContent;
		newMove = { index, white, move };
		moves.push(newMove);
		white = !white;
		console.log(newMove);
		ws.send(JSON.stringify(newMove));
	}
	// Result (game ended)
	else if (node.classList.contains('result-wrap')) {
		console.log('Game ended!');
		ws.send(JSON.stringify({ status: 'ended' }));
	}
}

const findGame = () => {
	// Parse initial moves, before watching for mutations
	let nodes = doc.querySelector('.moves'); // Live game
	if (nodes == null) {
		nodes = doc.querySelector('.tview2'); // Analysis view
	}

	if (nodes != null) {
		console.log('Parsing initial moves');
		for (let node of nodes.children) {
			parseMove(node);
		}
	} else {
		console.log('No intial moves to parse...');
	}

	if (doc.querySelector('.rmoves') != null) {
		observer.observe(doc.querySelector('.rmoves'), {
			attributes: true,
			childList: true,
			subtree: true,
		});
		console.log('Attached mutation observer on rmoves');
	} else if (doc.querySelector('.tview2') != null) {
		observer.observe(doc.querySelector('.tview2'), {
			attributes: true,
			childList: true,
			subtree: true,
		});
		console.log('Attached mutation observer on tview2');
	} else {
		console.log('No target found for mutation observer to attach to');
	}
};

docReady(() => {
	// If not on popup and page has a valid game
	if (
		window.location != 'https://lichess.org/.bot' &&
		(doc.querySelector('.rmoves') != null || doc.querySelector('.tview2') != null)
	) {
		window.open('https://lichess.org/.bot');
	} else {
		// Not declaring ws so that it becomes global
		ws = new WebSocket('ws://127.0.0.1:5678');
		ws.onopen = () => {
			console.log('Connection estabished.');
			ws.send(JSON.stringify({ status: 'opened', url: window.opener.location.href }));
			findGame();
			window.addEventListener('beforeunload', function(event) {
				ws.close(1000, 'Closed window');
			});
		};
	}
});
