# ChessBotPy

ChessBotPy is an interface between certain chess sites, such as Lichess and Chess.com and a chess engine, such as Brainfish (variation of Stockfish).
The basic operation of this bot is very simple

1. A browser userscript tracks your chess game, and sends all the moves to the python program through a websocket.
2. The python program converts moves into a format suitable for UCI engines
3. The engine calculates the best moves (PV lines)
4. The best moves are printed out and/or played as audio

## Planned features

**Interface**

-   Prints out PV lines (Stockfish output)
-   Reads out next move as audio
    -   Optionally expected move as well
-   Read out a move ahead if there is a forced line
-   Only show multiple principle variations if they they are within x centipawns of each other
    -   i.e. if no single PV line is clearly better

**Configurations**

-   Settings files
-   CLI arguments
-   Engine path
-   Engine settings
-   Depth / Time
-   Output options
    -   Text
    -   Voice
    -   Expected move

**GUI**

-   PV
-   CP
-   If currently enabled/searching
-   Found game / url
-   FEN
-   PGN
-   Settings
