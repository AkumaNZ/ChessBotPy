# ChessBotPy

ChessBotPy is an interface between Lichess.org, Chess.com and Chess24.com and a chess engine, such as Stockfish.
The basic operation of this bot is very simple:

1. A browser userscript tracks your chess game, and sends all the moves to the python program through a websocket.
2. The python program converts moves into a format suitable for UCI engines
3. The engine calculates the best moves
4. The data from engine is outputted to the user and sent back to the client (a second browser tab opened by the userscript)

Web client GUI:
https://i.imgur.com/heHy6Wy.png  
https://i.imgur.com/g1cyCDR.png

## Caveats:

To be able connect to a websocket, a site must not have restricted content security policy (CSP), specifically connect-src. Fortunately this can be bypassed by opening a new window, which does not have CSP, and communicating through `window` objects in javascript.

Lichess also has a response header `cross-origin-opener-policy` on some of their pages (Analysis board for example), which blocks the opened window from working due to CORS. This can be bypassed by removing the header with a browser extension (e.g. `Simple Modify Headers` for Chrome or Firefox).

https://i.imgur.com/SMeDAPq.png  


## Getting started

First you need something like Greasemonkey, Tampermonkey or Violentmonkey to run the userscript.

**Personally I've only tested this with Violentmonkey on Chrome on Windows 10.**

Copy the contents of `js/ChessBotPy.user.js` into a new userscript created with the extension and save it.

https://i.imgur.com/OGO8sqk.png  
https://i.imgur.com/EyzZspG.png

Next you'll need to run the python script. You can either run the precompiled exe (Windows only, download from the releases tab on GitHub) or run the python script yourself.

### Using the precompiled release:

1. Open `cmd` in the folder you extracted the files to
2. Run chessbotpy.exe

The included engine is a dev build of Stockfish (bmi2) from 19.6.2020, if this does not work for you, keep reading.

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

You can also look into Lc0: https://blog.lczero.org/play/quickstart/

Make sure to get a version that works with your machine. You can also use other UCI based engines.

Install the engine to a folder called `engine` and name the file `stockfish.exe` in the project root directory

Now you can run the python script with `python python\main.py`

**If your engine is not in a folder called engine in the root directory or the name is not `stockfish.exe`,**  
**you need to setup the path in the settings.ini file or modify it in the GUI after running the program and starting a game**

**Linux:**

Note that I've only ever tested this with WSL (Windows Subsystem for Linux), so I don't know how well it will really work.

With linux you will need to install a package called espeak, if you want voice to work: `sudo apt install espeak`

You may want to create a virtual environment first, where all the python dependencies will be installed, so they don't clutter your global space.

First make sure you have pip and venv (and python3 obviously) installed by running:

`sudo apt install python3-pip`

and

`sudo apt install python3-venv`

Now you can create a virtual environment by running:

`python3 -m venv venv`

The venv can be activated by running

`source ./venv/bin/activate` (This needs to be done every time you want to run the program if you installed the requirements with the venv)

Now install the requirements with `python3 -m pip install -r requirements.txt` (This needs to be done only the first time)

Now you need to download an engine. I recommend downloading the latest version of Stockfish from:  
https://blog.abrok.eu/stockfish-dev-builds-faq/

You can also look into Lc0: https://blog.lczero.org/play/quickstart/

For example:

`mkdir engine`

`wget -P ./engine http://abrok.eu/stockfish/latest/linux/stockfish_x64_bmi2 -o stockfish`

`sudo chmod 777 ./engine/stockfish`

Make sure to get a version that works with your machine. You can also use other UCI based engines.

Next you need to set the correct engine_path, either in the settings.ini file or you can launch the program and change it in the GUI after starting a game.

Edit the settings.ini and set the engine_path to `./engine/stockfish`

### **Opening books**

The program can use opening books, these are books with set openings, so that the engine does not need to calculate the openings and can play perfectly.

I've included two opening books `1_gm2600` and `2_Elo2400`, provided by the chess study program SCID. You can download more polyglot opening books and include them in the `books` folder.

The book files are read in alphabetical order, so I've named them with a prefix, to make sure the better book is read first.

When an opening book is used, the principal variations shown in the GUI work a little differently, the first move is still correct, but all moves after that are responses from the opponent, rather than continuations from both sides.

The books are read every time the engine runs, so if you want to add/remove books, you can do so at anytime by moving the files into our out of the folder.

Zipproth provides excellent opening books, if you want very deep and extensive books for optimal play: https://zipproth.de/Brainfish/download/

Note: You do not need the Brainfish engine to use these books.

### Syzygy end game tables

You can read about and download syzygy end game tables from:
https://syzygy-tables.info/

Note that these are not used directly with this program, but rather with the engine. So you can set the directories for the syzygy files in the engine settings (Through the web client GUI). Note that multiple directories can be set, if the paths are separated by `;`

## Understanding the GUI

The left panel includes program settings and engine settings.

**Status:** Whether or not the engine will run (While in the browser window with the game, hotkeys `ALT + A` will run the engine and `ALT + S` will stop it). Setting the status to `stopped` will shut down the engine, allowing you to reload the engine, if you made modifications to engine settings.

**Playing as:** Indicates which side you're playing as. The userscript will detect this in the first few moves, but you can change it yourself as well (Hotkeys `ALT + W` to play as white and `ALT + Q` to play as black).

**Run engine for:** Run the engine and show best moves on your turn, your opponents turn or on both turns.

**Limit:** Depth is how far the engine will try to search, values above 20 will start to take very long, so be careful. Time will limit how long the engine is allowed to run for.

**Principal variations:** How many different lines the engine will show (Not used if a move is found in an opening book).

Principal variations are shown below the board. If the position is known, it's ECO name is shown. Next to the variation # number, the estimated strength of the position is shown in centipawns (1/100th of a pawn value). The strength value shown depends on engine/engine settings. Also when the positions come from an opening book, the value comes directly from the book, and different books can show completely different values or ranges of values, so the value may not be accurate, if you're using multiple books.

**Engine path:** The same engine path that was set in settings.ini, can also be modified directly here.

**Draw board:** Whether or not to draw the SVG board on the right.

**Enable voice:** Reads out loud the best move the engine calculates.

**Clear log:** The engine generates a log file, this setting can clear the log file each time the engine runs, so that the file does not grow to be huge over time.

**Use books:** If this setting is enabled, the program will look for polyglot opening book files in a `books` folder.

**Draw overlay:** Draws the best move and expected response over the actual board.

**Log**: Everything is logged to the browsers console, so open dev tools (F12) to see any logged messages.

### **Engine settings**

These settings are automatically generated by the engine (the default value is shown next to the set value). These will vary depending on the engine you use.

You can read more about Stockfish UCI settings at: https://github.com/official-stockfish/Stockfish
And Leela Chess Zero settings at: https://blog.lczero.org/play/configuration/flags/

## Build and development

To build a single executable, run
`pyinstaller.exe --hidden-import=pyttsx3.drivers --hidden-import=pyttsx3.drivers.sapi5 --onefile python/main.py`

To build a minified version of tailwind, run
`npm run build:css` and in css/tailwind.min.css, replace all backslashes `\` with double backslashes `\\`

this requires that postcss-cli is installed `npm i -g postcss-cli`

To use development version of tailwind
`npm run serve`
and switch out the css in the head tag with the version loaded from localhost



## Troubleshooting / FAQ

**The engine is stuck**  
If the engine is stuck because of invalid engine settings or for some other reason, you can modify the settings you need to, then stop the backend
(Set status to paused) and start it again, the engine should restart and reload the new settings.

**Engine analysis is taking forever**  
If the analysis it taking too long e.g. depth was set high and no time limit, you can stop the engine (set status to paused), modify the limits to more reasonable values and start the engine again (set status to running).

**Can I get banned using this?**  
Yes. It's possible but unlikely for the sites to detect someone using the userscript. You can also get banned if you play too well all the time.
Sites usually check your moves against top engine recommended moves, if your accuracy is too high you'll be flagged as a cheater. They also look at how fast you make moves. If you always move at the same speed, even when the moves should be easy and fast or hard and long, you can be flagged as a cheater.

Try to play like a human would, and only use the best move recommendation if you need the help. You can toggle the engine on and off quickly with `ALT + A` (start) and `ALT+S` (stop).

**How do the limits work?**  
When a limit is hit, the engine will stop, so either it reaches the depth or it reaches the time limit. It's a good idea to have some max time you want, and you can adjust the skill level by adjusting the depth.

**The engine is not running when I'm not watching the game**  
The engine will not run when the main window is not visible, that means you've in a different tab in your browser or the window is minimized. This is because the program can handle multiple games at the same time, so the engine will be stopped for games, which are not active.

**Can I see what the code is doing?**  
There's logging in the server side (python code), as well as client side in the GUI tab's browser console. You can open dev tools in the browser by pressing F12, and see everything that's being logged. This can be useful for troubleshooting any possible problems.

To see more detailed logging, you can set the global variable `DEBUG` to `True` in `main.py`.

**The overlay is not drawing on the correct squares**  
Check the side, sometimes the side (black or white) finder can fail and thinks you're the playing the wrong color, causing the overlay to be rotated. Just set the side manually to fix it. `ALT + Q` for black and `ALT + W` for white (make sure the tab with the actual game is active).

**After a few moves, the bot stops working / Invalid SAN**  
The bot only supports SAN in English and only using text notation. Make sure you do not have Figurines enabled in the settings of the chess site you're using.
