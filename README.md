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

### Using the precompiled release:

1. Open `cmd` in the folder you extracted the files to
2. Run chessbotpy.exe

The included engine is a dev build of Stockfish (bmi2) from 6.6.2020, if this does not work for you, keep reading.

Read on if you want to know about engines, settings, opening books, end game tables, etc.

### Running the python script yourself:

Everything here was tested with Python 3.8.3, I can't guarantee that any other versions will work.

Note that you have to be in the **root directory** of the project, while running any of these scripts.

To run the python script you'll need to install the requirements first.

**Windows:**

You may want to create a virtual environment first, where all the python dependencies will be installed, so they don't clutter your global space.

You can do this by running:

`python -m venv venv`

The venv can be activated by running

`venv\Scripts\activate.bat` (This needs to be done every time you want to run the program if you installed the requirements with the venv)

Now install the requirements with `python -m pip install -r requirements.txt` (This needs to be done only the first time)

Now you need to download an engine. I recommend downloading the latest version of Stockfish from:  
https://blog.abrok.eu/stockfish-dev-builds-faq/

Make sure to get a version that works with your machine. You can also use other UCI based engines.

Install the engine to a a folder called `engine` and name the file StockFish.exe in the project root directory

Now you can run the python script with `python python\main.py`

**If your engine is not in a folder called engine in the root directory or the name is not StockFish.exe, you need to setup the path in the settings.ini file**

Later the engine path can also be set in the web client GUI, once you can get the program running.

**Linux:**

Note that I've only ever tested this with WSL (Windows Subsystem for Linux), so I don't know how well it will really work.

With linux you will need to install a package called espeak, if you want voice to work: `sudo apt install espeak`

You may want to create a virtual environment first, where all the python dependencies will be installed, so they don't clutter your global space.

First make sure you have pip and venv installed by running (and python3 obviously)

`sudo apt install python3-pip`

and

`sudo apt install python3-venv`

You can do this by running:

`python3 -m venv venv`

The venv can be activated by running

`source ./venv/bin/activate` (This needs to be done every time you want to run the program if you installed the requirements with the venv)

Now install the requirements with `python3 -m pip install -r requirements.txt` (This needs to be done only the first time)

Now you need to download an engine. I recommend downloading the latest version of Stockfish from:  
https://blog.abrok.eu/stockfish-dev-builds-faq/

For example:

`mkdir engine`

`wget -P ./engine http://abrok.eu/stockfish/latest/linux/stockfish_x64_bmi2 -o stockfish`

`sudo chmod 777 ./engine/stockfish`

Make sure to get a version that works with your machine. You can also use other UCI based engines.

Next you need to set the correct engine_path in the settings.ini file.

Edit the settings.ini and set the engine_path to `./engine/stockfish`

Later the engine path can also be set in the web client GUI, once you can get the program running.


### **Opening books**

The program can use opening books, these are books with set openings, so that the engine does not need to calculate the openings and can play perfectly.

I've included two opening books `1_gm2600` and `2_Elo2400`, provided by the chess study program SCID. You can download more polyglot opening books and include them in the `books` folder.

The book files are read in alphabetical order, so I've named them with a prefix, to make sure the better book is read first.

When an opening book is used, the principle variations shown in the GUI work a little differently, the first move is still correct, but all moves after that are responses from the opponent, rather than continuations from both sides.

The books are read every time the engine runs, so if you want to add/remove books, you can do so at anytime by moving the files into our out of the folder.

Zipproth provides excellent opening books, if you want very deep and extensive books for optimal play: https://zipproth.de/Brainfish/download/

Note: You do not need the Brainfish engine to use these books.

### Syzygy end game tables

You can read about and download syzygy end game tables from:
https://syzygy-tables.info/

Note that these are not used directly with this program, but rather with the engine. So you can set the directories for the syzygy files in the engine settings (Through the web client GUI). Note that multiple directories can be set, if the paths are separated by `;`

## Build and development

To build a single executable, run
`pyinstaller.exe --hidden-import=pyttsx3.drivers --hidden-import=pyttsx3.drivers.sapi5 --onefile python/main.py`

To build a minified version of tailwind, run
`npm run build:css` and in css/tailwind.min.css, replace all backslashes `\` with double backslashes `\\`

this requires that postcss-cli is installed `npm i -g postcss-cli`

To use development version of tailwind
`npm run serve`
and switch out the css in the head tag with the version loaded from localhost
