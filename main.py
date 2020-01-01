import asyncio
import websockets
import chess
import chess.engine
import json
import pyttsx3
games = {}
speech = pyttsx3.init()
speech.startLoop(False)


class GameObject():
    def __init__(self, board, engine, transport):
        self.board = board
        self.engine = engine
        self.transport = transport


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


async def handle_message(message, path):
    if path not in games:
        board = chess.Board()
        transport, engine = await chess.engine.popen_uci(
            "C:\\Users\\Juugo\\Desktop\\pychess\\engine\\BrainFish.exe")

        games[path] = GameObject(board, engine, transport)

    data = json.loads(message)
    if 'move' in data:
        games[path].board.push_san(data['move'])
        result = await games[path].engine.play(games[path].board,
                                               chess.engine.Limit(depth=8))
        print(games[path].board)
        best_move = games[path].board.san(result.move)
        if not data['history']:
            tts = parse_speech(best_move)
            # print(tts)
            speech.stop()
            speech.say(tts)
            speech.iterate()
        print("Best move:", best_move)
        print("Ponder:", games[path].board.san(result.ponder))


async def connection_handler(websocket, path):
    print("client connected", path)
    async for message in websocket:
        # print(message)
        await handle_message(message, path)
    print("Connection closed", path)
    del games[path]


start_server = websockets.serve(connection_handler, "127.0.0.1", 5678)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
speech.endLoop()
