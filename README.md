# ChessBotPy

ChessBotPy is an interface between Lichess.org, Chess.com and Chess24.com and a chess engine, such as Stockfish.
The basic operation of this bot is very simple:

1. A browser userscript tracks your chess game, and sends all the moves to the python program through a websocket.
2. The python program converts moves into a format suitable for UCI engines
3. The engine calculates the best moves
4. The data from engine is outputted to the user and sent back to the client (a second browser tab opened by the userscript)

Web client GUI:
https://i.imgur.com/heHy6Wy.png

## Caveats:

To be able connect to a websocket, a site must not have restricted content security policy (CSP), specifically connect-src. Fortunately this can be bypassed by opening a new window, which does not have CSP, and communicating through `window` objects in javascript.

Lichess also has a response header 'cross-origin-opener-policy' on some of their pages (Analysis board for example), which blocks the opened window from working due to CORS. This can be bypassed by removing the header with a browser extension (Requestly for chrome for example)


## Getting started

First you need something like Greasemonkey, Tampermonkey or Violentmonkey to run the userscript. Personally this has only been tested with Violentmonkey.

Copy the contents of js/ChessbotPy.user.js into a new userscript created with the extension and save it.

Next you'll need to run the python script. You can either run the precompiled exe (Windows only, download from the releases tab on GitHub) or run the python script yourself.

Note that you have to be in the root directory, while running any of these scripts.

To run the python script you'll need to activate the virtual environment and install the requirements first.

Activate the venv by running the `venv\Scripts\activate.bat` on Windows or `source ./venv/Scripts/activate` on Linux

Now install the requirements with `python -m pip install requirements.txt` (This needs to be done only the first time)

Now you can run the python script with `python python\main.py`

**You need to setup your chess engine path in the settings.ini before trying to run the program.**

After the first time, this can be changed directly with the web client GUI.

I recommend downloading the latest version of Stockfish from:
https://blog.abrok.eu/stockfish-dev-builds-faq/


### **Opening books**

The program can use opening books, these are books with set openings, so that the engine does not need to calculate the openings and can play perfectly.

I've included two opening books `1_gm2600` and `2_Elo2400`, provided by the chess study program SCID. You can download more polyglot opening books and include them in the `books` folder.

The book files are read in alphabetical order, so I've named them with a prefix, to make sure the better book is read first.

The books are read every time the engine runs, so if you want to add/remove books, you can do so at anytime by moving the files into our out of the folder.

Zipproth provides excellent opening books, if you want very deep and extensive books for optimal play: https://zipproth.de/Brainfish/download/

Note: You do not need the brainfish engine to use these books.

### Syzygy end game tables

You can read about and download syzygy end game tables from:
https://syzygy-tables.info/

Note that these are not used directly with this program, but rather with the engine. So you can set the directories for the syzygy files in the engine settings (Through the web client GUI)

## Build and development

To build a single executable, run
`pyinstaller.exe --hidden-import=pyttsx3.drivers --hidden-import=pyttsx3.drivers.sapi5 --onefile chessbotpy/main.py`

To build a minified version of tailwind, run
`npm run build:css` and in css/tailwind.min.css, replace all backslashes `\` with double backslashes `\\`

this requires that postcss-cli is installed `npm i -g postcss-cli`

To use development version of tailwind
`npm run serve`
and switch out the css in the head tag with the version loaded from localhost
