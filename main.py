import asyncio
import websockets
import chess
import chess.engine
import json
import pyttsx3
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


async def run_engine(uid):
    game = games[uid]
    # print(game.board)
    result = await game.engine.play(game.board, chess.engine.Limit(depth=8))
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


async def handle_message(message, uid):
    # Initialize board and engine for new UIDs
    if uid not in games:
        board = chess.Board()
        transport, engine = await chess.engine.popen_uci("C:\\Users\\Juugo\\Desktop\\pychess\\engine\\BrainFish.exe")
        games[uid] = GameObject(board, engine, transport)
    # Alias for the game
    game = games[uid]
    # Parse json message to python
    data = json.loads(message)

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
            await run_engine(uid)

    # Run initial moves
    if data['type'] == 'initial':
        for move in data['moves']:
            await new_move(game, move, uid)

    if data['type'] == 'move':
        await new_move(game, data, uid)


async def new_move(game, data, uid):
    game.board.push_san(data['move'])
    game.last_move = data
    if game.visible:
        await run_engine(uid)
    else:
        print('Missed a move on:', uid)
        game.missed_moves = True


async def connection_handler(websocket, path):
    print("Client connected", path)
    async for message in websocket:
        # print(message)
        await handle_message(message, path)
    print("Connection closed", path)
    # Clean up
    await games[path].engine.quit()
    del games[path]


start_server = websockets.serve(connection_handler, "127.0.0.1", 5678)
asyncio.get_event_loop().run_until_complete(start_server)
print("Looking for connections...")
asyncio.get_event_loop().run_forever()
speech.endLoop()
