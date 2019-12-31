// ==UserScript==
// @name        ChessBotLichess
// @namespace   ChessBotPy
// @match       *://lichess.org/*
// @grant       none
// @version     1.0
// @author      -
// @description Lichess Spy
// ==/UserScript==

let index = 0;
let white = true;
let move = '';
let moves = [];

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
	}
	// Result (game ended)
	else if (node.classList.contains('result-wrap')) {
		console.log('Game ended!');
	}
}

window.addEventListener('load', function() {
	// Parse initial moves, before watching for mutations
	let nodes = document.querySelector('.moves'); // Live game
	if (nodes == null) {
		nodes = document.querySelector('.tview2'); // Analysis view
	}

	if (nodes != null) {
		console.log('Parsing initial moves');
		for (let node of nodes.children) {
			parsed = parseMove(node);
		}
	} else {
		console.log('No intial moves to parse...');
	}

	if (document.querySelector('.rmoves') != null) {
		observer.observe(document.querySelector('.rmoves'), { attributes: true, childList: true, subtree: true });
		console.log('Attached mutation observer on rmoves');
	} else if (document.querySelector('.tview2') != null) {
		observer.observe(document.querySelector('.tview2'), { attributes: true, childList: true, subtree: true });
		console.log('Attached mutation observer on tview2');
	} else {
		console.log('No target found for mutation observer to attach to');
	}
});
