import asyncio
import websockets
import chess
import chess.engine
import chess.svg
import pyttsx3
# import jsonpickle
import json
import configparser
import os

# Load configurations
config = configparser.ConfigParser()
engine_config = configparser.ConfigParser()
config.read('settings.ini')

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
        self.board: chess.Board = board
        self.engine: chess.engine.EngineProtocol = engine
        self.transport = transport
        self.visible = True
        self.missed_moves = False
        self.last_move = ''
        self.side = int(config['GUI']['side'])
        self.voice = config['GUI']['use_voice'].lower() == 'true'


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


def serialize_message(target, message):
    return json.dumps({"target": target, "message": message})


def create_arrows(moves):
    pass


async def run_engine(uid, ws):
    game: GameObject = games[uid]
    if game.board.turn == game.side or game.side == BOTH:
        # print(game.board)
        limit: chess.engine.Limit = chess.engine.Limit()
        if (config['GUI']['use_depth']):
            limit.depth = int(config['GUI']['depth'])
        if (config['GUI']['use_time']):
            limit.time = int(config['GUI']['time'])

        multipv = int(engine_config["engine"]['multipv'])
        result: chess.engine.PlayResult = await game.engine.analyse(
            board=game.board,
            limit=limit,
            multipv=multipv,
            game=uid,
            info=chess.engine.INFO_ALL,
        )
        svg = chess.svg.board(board=game.board, coordinates=False)
        # Add arrows here
        await ws.send(serialize_message("board", svg))
        # best_move = game.board.san(result.move)
        # if not game.last_move['history']:
        #     tts = parse_speech(best_move)
        #     # print(tts)
        #     speech.stop()
        #     speech.say(tts)
        #     speech.iterate()
        # # print("Ponder:", game.board.san(result.ponder))
        # print("Best move:", best_move)
        game.missed_moves = False
        # frozen = jsonpickle.encode(result.info)
        # await ws.send(frozen)


async def configure_engine(uid):
    engine = games[uid].engine
    if engine is not None:
        if "engine" not in engine_config.sections():
            base = os.path.basename(config['GUI']['engine_path'])  # FIX ME! Error handling
            engine_name = os.path.splitext(base)[0]
            engine_config.read(engine_name + ".ini")
        if "engine" in engine_config.sections():
            for key, value in engine_config["engine"].items():
                option = engine.options[key]
                if not option.is_managed():
                    await engine.configure({key: value})
        else:  # Add default values for selected engine to settings.ini
            engine_config["engine"] = {}
            for key, default_value in engine.config._store.values():
                engine_config["engine"][key] = str(default_value)  # Default value
            with open(engine_name + ".ini", 'w+') as configfile:
                engine_config.write(configfile)


async def handle_message(message, uid, ws):
    # Initialize board and engine for new UIDs
    if uid not in games:
        board = chess.Board()
        transport, engine = await chess.engine.popen_uci(config['GUI']['engine_path'])
        games[uid] = GameObject(board, engine, transport)
        await configure_engine(uid)
        # print(engine.options._store)
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
                game.transport, game.engine = await chess.engine.popen_uci(config['GUI']['engine_path'])
                await configure_engine(uid)
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
                await configure_engine(uid)
                await run_engine(uid, ws)
    # Run initial moves
    if data['type'] == 'initial':
        for move in data['moves']:
            await new_move(game, move, uid, ws)

    if data['type'] == 'move':
        await new_move(game, data, uid, ws)


async def new_move(game, data, uid, ws):
    if 'move' in data:
        game.board.push_san(data['move'])
        game.last_move = data
        if game.visible:
            await run_engine(uid, ws)
        else:
            print('Missed a move on:', uid)
            game.missed_moves = True


async def connection_handler(websocket, path):
    try:
        print("Client connected", path)
        async for message in websocket:
            # print(message)
            await handle_message(message, path, websocket)
        print("Connection closed", path)
        # Clean up
        if path in games:
            if games[path].engine is not None:
                await games[path].engine.quit()
            del games[path]
    except websockets.ConnectionClosed as err:
        print(err)
        if path in games:
            if games[path].engine is not None:
                await games[path].engine.quit()
            del games[path]


start_server = websockets.serve(connection_handler, "127.0.0.1", 5678)
asyncio.get_event_loop().run_until_complete(start_server)
print("Looking for connections...")
asyncio.get_event_loop().run_forever()
# Clean up
speech.endLoop()
for game in games:
    if game.engine is not None:
        game.engine.quit()
