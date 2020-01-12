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

    def __init__(self, board, engine, transport):
        self.board: chess.Board = board
        self.engine: chess.engine.EngineProtocol = engine
        self.transport = transport
        self.visible = True
        self.missed_moves = False
        self.last_move = ''
        self.side = int(config['defaults']['side'])
        self.run = int(config['defaults']['run'])
        self.voice = config['gui']['use_voice'].lower() == 'true'

    def should_run(self):
        if game.run != NONE and ((game.board.turn == game.side and game.run == ME) or
                                 (game.board.turn != game.side and game.run == OPPONENT) or game.run == BOTH):
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


async def run_engine(uid, ws):
    game: GameObject = games[uid]
    if game.should_run():
        # print(game.board)
        limit: chess.engine.Limit = chess.engine.Limit()
        if (config['gui']['use_depth']):
            limit.depth = int(config['gui']['depth'])
        if (config['gui']['use_time']):
            limit.time = int(config['gui']['time'])

        # multipv = int(engine_config["engine"]['multipv'])
        # result: chess.engine.PlayResult = await game.engine.analyse(
        #     board=game.board,
        #     limit=limit,
        #     multipv=multipv,
        #     game=uid,
        #     info=chess.engine.INFO_ALL,
        # )
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
            base = os.path.basename(config['gui']['engine_path'])  # FIX ME! Error handling
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


def update_settings(data):
    key = data['key']
    value = data['value']
    if (key in config['defaults']):
        config['defaults'][key] = value
    else:
        config['gui'][key] = value
        with open('settings.ini', 'w') as configfile:
            config.write(configfile)


async def handle_message(message, uid, ws):
    # Parse json message to python
    data = json.loads(message)

    # Handle engine path change before anything else
    if data['type'] == 'setting':
        update_settings(data['data'])

    # Initialize board and engine for new UIDs
    if uid not in games:
        board = chess.Board()
        try:
            transport, engine = await chess.engine.popen_uci(config['gui']['engine_path'])
        except (FileNotFoundError, OSError) as err:
            await ws.send(serialize_message("error", "Engine path: " + err.strerror))
            return
        games[uid] = GameObject(board, engine, transport)
        await configure_engine(uid)
        # print(engine.options._store)

    # Shorthand for the game
    game = games[uid]

    if data['type'] == 'visibility':
        game.visible = data['data']
        print(f"Game {uid} {'visible' if game.visible else 'hidden'}")
        # Launch or close engine based on visibility
        if game.visible:
            if game.engine is None:
                print('Launching engine.')
                try:
                    game.transport, game.engine = await chess.engine.popen_uci(config['gui']['engine_path'])
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
    # Hotkeys
    elif data['type'] == 'hotkey':
        side = data['data']
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
                try:
                    game.transport, game.engine = await chess.engine.popen_uci(config['gui']['engine_path'])
                except FileNotFoundError as err:
                    await ws.send(serialize_message("error", "Engine path: " + err.strerror))
                    return
                await configure_engine(uid)
                await run_engine(uid, ws)
    # Run initial moves
    elif data['type'] == 'initial':
        for move in data['data']:
            await new_move(game, move, uid, ws)
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
    await ws.send(serialize_message("setting", {'key': 'enginePath', 'value': config['gui']['engine_path']}))
    await ws.send(serialize_message("setting", {'key': 'playingAs', 'value': config['defaults']['side']}))
    await ws.send(serialize_message("setting", {'key': 'runEngineFor', 'value': config['defaults']['run']}))
    await ws.send(serialize_message("setting", {'key': 'useVoice', 'value': config['gui']['use_voice']}))
    await ws.send(serialize_message("setting", {'key': 'useDepth', 'value': config['gui']['use_depth']}))
    await ws.send(serialize_message("setting", {'key': 'depth', 'value': config['gui']['depth']}))
    await ws.send(serialize_message("setting", {'key': 'useTime', 'value': config['gui']['use_time']}))
    await ws.send(serialize_message("setting", {'key': 'time', 'value': config['gui']['time']}))


async def connection_handler(websocket, path):
    try:
        print("Client connected", path)
        # Send default values to client
        await send_defaults(websocket)

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
