# ChessBotPy

ChessBotPy is an interface between Lichess.org and a chess engine, such as Stockfish.
The basic operation of this bot is very simple:

1. A browser userscript tracks your chess game, and sends all the moves to the python program through a websocket.
2. The python program converts moves into a format suitable for UCI engines
3. The engine calculates the best moves
4. The data from engine is outputted to the user and sent back to the client

https://i.imgur.com/vOTvw9p.png

### Caveats:

To be able connect to a websocket, a site must not have restricted content security policy (CSP), specifically connect-src. Fortunately this can be bypassed by opening a new window, which does not have CSP, and communicating through `window` objects in javascript.

## Todo

-   Send engine data to client
    -   What to show in client log?
-   User set volume and pitch of TTS
-   Make WS address a setting
    -   Command line argument in python?
-   Write instructions

## Build

To build a single executable, run
`pyinstaller.exe --hidden-import=pyttsx3.drivers --hidden-import=pyttsx3.drivers.sapi5 --onefile chessbotpy/main.py`

To build a minified version of tailwind, run
`npm run build:css` and in css/tailwind.min.css, replace all backslashes `\` with double backslashes `\\`

To use development version of tailwind
`npm run serve`
and switch out the css in the head tag with the version loaded from localhost
