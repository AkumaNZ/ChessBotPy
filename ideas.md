- Refactor code
  - Turn sitemap in UserScript into a class with an inherited base class
    - Move FEN handling to to new class
    - Move 'move' css selector into new class
  - Rewrite setting update_settings
    - Handle GameObject and GUI separately
  - Group UserScript vue data to setting and state
  - Separate UserScript into multiple files using @require, distributed from jsdelivr
  - Move engine code to separate file
    - Refactor long functions into smaller units


- Add support for variants

- Get FEN from board state (for chess.com puzzles / Chess960 positions)

- Continuous analysis

- Translate SAN moves

- Get square indices from server side, rather than parsing LAN