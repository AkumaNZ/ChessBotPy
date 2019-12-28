Main loop

-   Waits for input to start searching for a game
-   Searches for a game
    -   If found, gets the URL and which site it is
    -   Starts a browser instance, with those settings in mind
    -   Provides a parser callback, which will be exposed to the browser
    -   Browser will
        1. Look for all previous moves, send them to parser
        2. Call parser each time new move is made

Parser

-   Will take moves as inputs, in a list
-   Parses them and feeds each move to a python-chess board instance
-   Each board instance will be unique to the url
-
