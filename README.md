# ChessBotPy

ChessBotPy is an interface between certain chess sites, such as Lichess and Chess.com and a chess engine, such as Stockfish (or Brainfish).
The basic operation of this bot is very simple

1. ChessBotPy tracks your current active tab in Chrome or Firefox.
2. If it finds an active game, it will parse the moves
3. Convert the parsed moves into a format suitable for UCI engines
4. Input the moves to a chess engine
5. Output the best moves

## Plan

-   Create a function for fetching current active tab
    -   If Chrome is not found, try Firefox
-   Create a module for pyppeteer
    -   Attach a mutation event watcher to the page
    -   Output the moves as a change happens
    -   Parses the raw HTML to a PGN format
-   Create a module for python-chess
    -   Keeps track of game state
    -   Communicates with an UCI engine
-   Create module for interfacing outwards to user
    -   Prints out PV lines
    -   Reads out next move as audio
        -   Optionally expected move as well
-   Create possibility of configurations through a file and command line arguments
    -   Engine path
    -   Engine settings
    -   Depth / Time
    -   Output options
        -   Text
        -   Voice
        -   Expected move

## Feature ideas

-   Read out expected move as well
-   Read out a move ahead if there is a forced line
-   Only show multiple principle variations if they they are within x centipawns of each other (If no one line is massively better)
-   Graphical user interface
    -   PV
    -   CP
    -   If currently enabled/searching
    -   Found game / url
    -   FEN
    -   PGN
    -   Settings
