import asyncio
import websockets
import chess
import chess.engine
import pyttsx3
import jsonpickle

BLACK = 0
WHITE = 1
BOTH = 2
NONE = 3

# Global state
games = {}
speech = pyttsx3.init()
speech.startLoop(False)
print('Initialized TTS')


class GameObject():

    def __init__(self, board, engine, transport):
        self.board = board
        self.engine = engine
        self.transport = transport
        self.visible = True
        self.missed_moves = False
        self.last_move = ''
        self.side = BOTH


digits = {
    '1': 'one ',
    '2': 'two ',
    '3': 'three ',
    '4': 'four ',
    '5': 'five ',
    '6': 'six ',
    '7': 'seven ',
    '8': 'eight ',
}


def parse_speech(move: str):
    castles_count = 0
    sentence = ''
    for letter in move:
        if letter == 'K':
            sentence += "King "
        elif letter == 'Q':
            sentence += "Queen "
        elif letter == 'R':
            sentence += "Rook "
        elif letter == 'B':
            sentence += "Bishop "
        elif letter == 'N':
            sentence += "Knight "
        elif letter == 'x':
            sentence += "takes "
        elif letter == '+':
            sentence += "check "
        elif letter == '#':
            sentence += "mate "
        elif letter == 'O' or letter == '-':
            castles_count += 1
        elif letter == '=':
            sentence += 'promotes to '
        elif letter.isdigit():
            sentence += digits[letter]
        else:
            if letter == 'a':
                sentence += "aa "
            else:
                sentence += f'{letter} '
        if castles_count == 3 and len(move) < 5:
            sentence += 'castles'
        elif castles_count == 5:
            sentence += "long castles"
    return sentence


async def run_engine(uid, ws):
    game = games[uid]
    if game.board.turn == game.side or game.side == BOTH:
        # print(game.board)
        result = await game.engine.play(game.board, chess.engine.Limit(depth=8), game=uid, info=chess.engine.INFO_ALL)
        best_move = game.board.san(result.move)
        if not game.last_move['history']:
            tts = parse_speech(best_move)
            # print(tts)
            speech.stop()
            speech.say(tts)
            speech.iterate()
        # print("Ponder:", game.board.san(result.ponder))
        print("Best move:", best_move)
        game.missed_moves = False
        frozen = jsonpickle.encode(result.info)
        await ws.send(frozen)


async def handle_message(message, uid, ws):
    # Initialize board and engine for new UIDs
    if uid not in games:
        board = chess.Board()
        transport, engine = await chess.engine.popen_uci("C:\\Users\\Juugo\\Desktop\\pychess\\engine\\BrainFish.exe")
        games[uid] = GameObject(board, engine, transport)
        # print(engine.options._store)
    # Alias for the game
    game = games[uid]
    # Parse json message to python
    data = jsonpickle.decode(message)

    if data['type'] == 'visibility':
        game.visible = data['visible']
        print(f"Game {uid} {'visible' if game.visible else 'hidden'}")
        # Launch or close engine based on visibility
        if game.visible:
            if game.engine is None:
                print('Launching engine.')
                game.transport, game.engine = await chess.engine.popen_uci("C:\\Users\\Juugo\\Desktop\\pychess\\engine\\BrainFish.exe")
        else:
            print('Closing engine.')
            await game.engine.quit()
            game.engine = None
            game.transport = None
        # Run engine if there were any missed moves while game was not visible
        if game.visible and game.missed_moves:
            await run_engine(uid, ws)
    # Hotkeys
    if data['type'] == 'hotkey':
        side = data['playing']
        game.side = side
        if side == NONE:
            print('Paused')
            print('Closing engine.')
            await game.engine.quit()
            game.engine = None
            game.transport = None
        else:
            print("Playing as", side)
            if game.engine is None:
                print('Launching engine.')
                game.transport, game.engine = await chess.engine.popen_uci("C:\\Users\\Juugo\\Desktop\\pychess\\engine\\BrainFish.exe")
                await run_engine(uid, ws)
    # Run initial moves
    if data['type'] == 'initial':
        for move in data['moves']:
            await new_move(game, move, uid, ws)

    if data['type'] == 'move':
        await new_move(game, data, uid, ws)


async def new_move(game, data, uid, ws):
    game.board.push_san(data['move'])
    game.last_move = data
    if game.visible:
        await run_engine(uid, ws)
    else:
        print('Missed a move on:', uid)
        game.missed_moves = True


async def connection_handler(websocket, path):
    print("Client connected", path)
    async for message in websocket:
        # print(message)
        await handle_message(message, path, websocket)
    print("Connection closed", path)
    # Clean up
    await games[path].engine.quit()
    del games[path]


start_server = websockets.serve(connection_handler, "127.0.0.1", 5678)
asyncio.get_event_loop().run_until_complete(start_server)
print("Looking for connections...")
asyncio.get_event_loop().run_forever()
# Clean up
speech.endLoop()
for g in games:
    g.engine.quit()
