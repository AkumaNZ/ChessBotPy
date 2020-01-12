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
from pathlib import Path

# Load configurations
config = configparser.ConfigParser()
engine_config = configparser.ConfigParser()
config.read('settings.ini')


def initialize_engine_settings_file():
    dummy = None
    if not config.has_option('gui', 'engine_path'):
        print("Settings.ini is missing engine path. Pls fix and try again.")
        return

    engine_file = Path(config.get('gui', 'engine_path'))
    if not engine_file.is_file():
        print("Given engine path is not valid. Pls fix and try again")
        return

    try:
        dummy = chess.engine.SimpleEngine.popen_uci(config.get('gui', 'engine_path'))
    except Exception as err:
        print(err)
        print("Could not open engine. Pls fix and try again")
        return

    base = os.path.basename(config.get('gui', 'engine_path'))
    engine_name = os.path.splitext(base)[0] + ".ini"
    engine_settings_file = Path(engine_name)

    if engine_settings_file.is_file():
        engine_config.read(engine_name)

    if not engine_config.has_section("engine"):
        # Create an engine settings file with default values
        engine_config["engine"] = {}
        for key, option in dummy.options._store.values():
            engine_config["engine"][key] = str(option.default)
        with open(engine_name, 'w+') as configfile:
            engine_config.write(configfile)

    # Clean up
    dummy.quit()


initialize_engine_settings_file()

# Side
BLACK = 0
WHITE = 1

# Run engine for
ME = 0
OPPONENT = 1
BOTH = 2
NONE = 3

# Global state
games = {}
speech = pyttsx3.init()
speech.startLoop(False)
print('Initialized TTS')


class GameObject():

    def __init__(self, board):
        self.board: chess.Board = board
        self.engine: chess.engine.EngineProtocol = None
        self.transport = None
        self.visible = True
        self.missed_moves = False
        self.last_move = ''
        self.side = config.getint('defaults', 'side')
        self.run = config.getint('defaults', 'run')
        self.voice = config.getboolean('gui', 'use_voice')
        self.first_init = False
        self.draw_board = True

    def should_run(self):
        if self.run != NONE and ((self.board.turn == self.side and self.run == ME) or
                                 (self.board.turn != self.side and self.run == OPPONENT) or self.run == BOTH):
            return True
        return False


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


async def configure_engine(uid):
    engine = games[uid].engine
    if engine is not None:
        for key, value in engine_config["engine"].items():
            option = engine.options[key]
            if not option.is_managed():
                await engine.configure({key: value})


async def run_engine(uid, ws):
    game: GameObject = games[uid]
    if game.engine is None:
        try:
            game.transport, game.engine = await chess.engine.popen_uci(config.get('gui', 'engine_path'))
        except (FileNotFoundError, OSError) as err:
            await ws.send(serialize_message("error", "Engine path: " + err.strerror))
        await configure_engine(uid)

    if game.should_run():
        # print(game.board)
        limit: chess.engine.Limit = chess.engine.Limit()
        if config.getboolean('gui', 'use_depth'):
            limit.depth = config.getint('gui', 'depth')
        if config.getboolean('gui', 'use_time'):
            limit.time = config.getint('gui', 'time')

        # multipv = int(engine_config["engine"]['multipv'])
        result: chess.engine.PlayResult = await game.engine.play(
            board=game.board,
            limit=limit,
            # multipv=multipv,
            game=uid,
            info=chess.engine.INFO_ALL,
        )
        svg = chess.svg.board(board=game.board, coordinates=False)
        # Add arrows here
        await ws.send(serialize_message("board", svg))
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


async def update_settings(data, uid, ws):
    game = games[uid]
    key = data['key']
    value = data['value']
    if config.has_option('defaults', key):
        # config['defaults'][key] = value # Do not save defaults to file
        if key == 'side':
            game.side = int(value)
            print("Playing as", value)
        elif key == 'run':
            game.run = value
            if value == NONE:
                if game.engine is not None:
                    print('Paused. Closing engine...')
                    await game.engine.quit()
                    game.engine = None
                    game.transport = None
            else:
                print("Running engine for", value)
                if game.engine is None:
                    print('Launching engine.')
                    try:
                        game.transport, game.engine = await chess.engine.popen_uci(config['gui']['engine_path'])
                    except FileNotFoundError as err:
                        await ws.send(serialize_message("error", "Engine path: " + err.strerror))
                        return
                    await configure_engine(uid)
                    await run_engine(uid, ws)
    # Set gui settings and save to file
    else:
        config['gui'][key] = str(value)
        with open('settings.ini', 'w') as configfile:
            config.write(configfile)


async def handle_message(message, uid, ws):
    # Initialize game object with a new board
    if uid not in games:
        games[uid] = GameObject(chess.Board())

    # Shorthand for the game
    game = games[uid]

    # Parse json message to python
    data = json.loads(message)

    # Handle setting changes before engine is initialized
    if data['type'] == 'setting':
        await update_settings(data['data'], uid, ws)

    if data['type'] == 'visibility':
        game.visible = data['data']
        print(f"Game {uid} {'visible' if game.visible else 'hidden'}")
        # Launch or close engine based on visibility
        if game.visible:
            if game.engine is None:
                print('Launching engine.')
                try:
                    game.transport, game.engine = await chess.engine.popen_uci(config.get('gui', 'engine_path'))
                except FileNotFoundError as err:
                    await ws.send(serialize_message("error", "Engine path: " + err.strerror))
                    return
                await configure_engine(uid)
        elif game.engine is not None:
            print('Closing engine.')
            await game.engine.quit()
            game.engine = None
            game.transport = None
        # Run engine if there were any missed moves while game was not visible
        if game.visible and game.missed_moves:
            await run_engine(uid, ws)
    # Run initial moves
    elif data['type'] == 'initial':
        for move in data['data']:
            await new_move(game, move['data'], uid, ws)
    # Run new moves
    elif data['type'] == 'move':
        await new_move(game, data['data'], uid, ws)
    elif data['type'] == 'setting':
        pass  # Settings are handled earlier
    else:
        if 'type' in data:
            print('Unknown type', data['type'])
        else:
            print("Unknown message", data)


async def new_move(game, data, uid, ws):
    if 'move' in data:
        game.board.push_san(data['move'])
        game.last_move = data
        if game.visible:
            await run_engine(uid, ws)
        else:
            print('Missed a move on:', uid)
            game.missed_moves = True


async def send_defaults(ws):
    await ws.send(serialize_message("setting", {'key': 'enginePath', 'value': config.get('gui', 'engine_path')}))
    await ws.send(serialize_message("setting", {'key': 'playingAs', 'value': config.getint('defaults', 'side')}))
    await ws.send(serialize_message("setting", {'key': 'runEngineFor', 'value': config.getint('defaults', 'run')}))
    await ws.send(serialize_message("setting", {'key': 'useVoice', 'value': config.getboolean('gui', 'use_voice')}))
    await ws.send(serialize_message("setting", {'key': 'drawBoard', 'value': config.getboolean('gui', 'draw_board')}))
    await ws.send(serialize_message("setting", {'key': 'useDepth', 'value': config.getboolean('gui', 'use_depth')}))
    await ws.send(serialize_message("setting", {'key': 'depth', 'value': config.getint('gui', 'depth')}))
    await ws.send(serialize_message("setting", {'key': 'useTime', 'value': config.getboolean('gui', 'use_time')}))
    await ws.send(serialize_message("setting", {'key': 'time', 'value': config.getint('gui', 'time')}))


async def send_engine_settings(ws, uid):
    settings = []
    dummy = chess.engine.SimpleEngine.popen_uci(config['gui']['engine_path'])
    for key, value in engine_config["engine"].items():
        option = dummy.options[key]
        data = {"name": option.name, 'type': option.type, "default": option.default, "min": option.min, "max": option.max, "value": value, "var": option.var}
        settings.append(data)
    await ws.send(serialize_message("engine_settings", settings))
    dummy.quit()


async def connection_handler(websocket, path):
    try:
        print("Client connected", path)
        # Send default settings values to client
        await send_defaults(websocket)
        # Send engine settings to client
        await send_engine_settings(websocket, path)

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
