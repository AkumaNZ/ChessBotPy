# ChessBotPy

ChessBotPy is an interface between certain chess sites, such as Lichess or Chess.com and a chess engine, such as Brainfish (a variation of Stockfish).
The basic operation of this bot is very simple:

1. A browser userscript tracks your chess game, and sends all the moves to the python program through a websocket.
2. The python program converts moves into a format suitable for UCI engines
3. The engine calculates the best moves
4. The data from engine is outputted to the user and sent back to the client

### Caveats:

To be able connect to a websocket, a site must not have restricted content security policy (CSP), specifically connect-src. Fortunately this can be bypassed by opening a new window, which does not have CSP, and communicating through `window` objects in javascript.

## Planned features

**Interface**

-   Read out ponder
-   Read out a move ahead if there is a forced line
-   Only read out moves for one side
-   GUI
    -   Priciple variation lines
        -   Multiple principle variations if they they are within x centipawns of each other
            -   i.e. if no single PV line is clearly better
    -   Centipawn (score)
    -   If currently enabled/searching
    -   Which side you're playing as
    -   Found game / url
    -   FEN
    -   Settings
    -   Console

**Configurations**

-   Settings files
-   Engine path
-   Engine settings
-   Depth / Time
-   Output options
    -   Text
    -   Voice
    -   Ponder
    -   Forced lines

## Known issues:

-   Lichess parser does not handle interrupts in analysis mode.
-   Mutation observer attaching relies on one second time out on initial load
    -   Change to a setTimeout loop until found
-   Should we send full board state from JS every time?

## Todo

-   Hotkey support
    -   Possibility to run bot only for one side or both, and to pause engine running
-   Send messages from server back to client
-   Start building GUI on client side with Vue
    -   Console
    -   Show PV, CP, FEN
-   Implement some basic settings
    -   Engine path
    -   Playing as
-   Figure out how to configure engine
