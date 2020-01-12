# ChessBotPy

ChessBotPy is an interface between certain chess sites, such as Lichess or Chess.com and a chess engine, such as Brainfish (a variation of Stockfish).
The basic operation of this bot is very simple:

1. A browser userscript tracks your chess game, and sends all the moves to the python program through a websocket.
2. The python program converts moves into a format suitable for UCI engines
3. The engine calculates the best moves
4. The data from engine is outputted to the user and sent back to the client

### Caveats:

To be able connect to a websocket, a site must not have restricted content security policy (CSP), specifically connect-src. Fortunately this can be bypassed by opening a new window, which does not have CSP, and communicating through `window` objects in javascript.

## Known issues:

-   Lichess parser does not handle interrupts in analysis mode.
-   Should we send full board state from JS every time?
-   Auto managed settings are saved to settings file?

## Todo

-   Handle option for playing as Black/White
    -   Get the side you're playing as automatically
-   Handle option for RunEngineFor Me, Opponent, Both, None
-   Handle managed engine settings
    -   Limit
    -   MultiPV
-   Handle saved settings (defaults) and game specific settings (temporary)
-   Parse polybooks in the correct order
    -   Send all the available moves to client
    -   Combine with run engine analysis, to first use polybook moves
-   Send engine data to client
-   Create panel for PVs
    -   CP
-   Main info and buttons
    -   FEN
-   SVG Board
    -   Draw arrows in SVG
    -   Map color of arrows to PV table somehow
-   Console
    -   Auto scroll if at the bottom
    -   Log settings
        -   What to log
-   Implement auto generated engine settings
    -   Create custom checkbox, radio, slider, etc
    -   Save settings logic
