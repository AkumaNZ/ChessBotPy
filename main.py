import asyncio
import websockets
import chess
import chess.engine
import chess.svg
import chess.polyglot
import pyttsx3
import json
import configparser
import os
from pathlib import Path
from collections import defaultdict

# Load configurations
config = configparser.ConfigParser()
engine_config = configparser.ConfigParser()
config.read('settings.ini')


def initialize_engine_settings_file():
    engine_config.clear()
    dummy = None
    if not config.has_option('gui', 'engine_path'):
        print('Settings.ini is missing engine path. Pls fix and try again.')
        return

    engine_file = Path(config.get('gui', 'engine_path'))
    if not engine_file.is_file():
        print('Given engine path is not valid. Pls fix and try again')
        return

    try:
        dummy = chess.engine.SimpleEngine.popen_uci(config.get('gui', 'engine_path'))
    except Exception as err:
        print(err)
        print('Could not open engine. Pls fix and try again')
        return

    base = os.path.basename(config.get('gui', 'engine_path'))
    engine_name = os.path.splitext(base)[0] + '.ini'
    engine_settings_file = Path(engine_name)

    if engine_settings_file.is_file():
        engine_config.read(engine_name)

    if not engine_config.has_section('engine'):
        # Create an engine settings file with default values
        engine_config['engine'] = {}
        for key, option in dummy.options._store.values():
            if not option.is_managed():
                engine_config['engine'][key] = str(option.default)
        with open(engine_name, 'w+') as config_file:
            engine_config.write(config_file)

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
        self.last_move = {'history': False}
        self.side = config.getint('defaults', 'side')
        self.run = config.getint('defaults', 'run')
        self.arrows = defaultdict(list)

    def should_run(self):
        if (self.run != NONE and not self.board.is_game_over() and not self.last_move['history'] and
            ((self.board.turn == self.side and self.run == ME) or (self.board.turn != self.side and self.run == OPPONENT) or self.run == BOTH)):
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

arrow_colors = {
    chess.BLACK: [  # Red
        'hsl(356, 75%, 53%, 1.00)', 'hsl(356, 75%, 53%, 0.80)', 'hsl(356, 75%, 53%, 0.06)', 'hsl(356, 75%, 53%, 0.40)', 'hsl(356, 75%, 53%, 0.20)',
        'hsl(356, 75%, 53%, 0.05)'
    ],
    chess.WHITE: [  # Green
        'hsl(123, 57%, 45%, 1.0)', 'hsl(123, 57%, 45%, 0.80)', 'hsl(123, 57%, 45%, 0.6)', 'hsl(123, 57%, 45%, 0.4)', 'hsl(123, 57%, 45%, 0.2)',
        'hsl(123, 57%, 45%, 0.05)'
    ],
}


def parse_speech(move: str):
    castles_count = 0
    sentence = ''
    for letter in move:
        if letter == 'K':
            sentence += 'King '
        elif letter == 'Q':
            sentence += 'Queen '
        elif letter == 'R':
            sentence += 'Rook '
        elif letter == 'B':
            sentence += 'Bishop '
        elif letter == 'N':
            sentence += 'Knight '
        elif letter == 'x':
            sentence += 'takes '
        elif letter == '+':
            sentence += 'check '
        elif letter == '#':
            sentence += 'mate '
        elif letter == 'O' or letter == '-':
            castles_count += 1
        elif letter == '=':
            sentence += 'promotes to '
        elif letter.isdigit():
            sentence += digits[letter]
        else:
            if letter == 'a':
                sentence += 'aa '
            else:
                sentence += f'{letter} '
        if castles_count == 3 and len(move) < 5:
            sentence += 'castles'
        elif castles_count == 5:
            sentence += 'long castles'
    return sentence


def serialize_message(target, message):
    return json.dumps({'target': target, 'message': message})


async def configure_engine(uid):
    engine = games[uid].engine
    if engine is not None:
        for key, value in engine_config['engine'].items():
            option = engine.options[key]
            if not option.is_managed():
                await engine.configure({key: value})


def get_arrow(move, side, n):
    if n > 5:
        color = "hsla(0, 0%, 0%, 0)"
    else:
        color = arrow_colors[side][n]
    return chess.svg.Arrow(tail=move.from_square, head=move.to_square, color=color)


async def draw_svg_board(game, ws, pv):
    if config.getboolean('gui', 'draw_board'):
        svg = chess.svg.board(board=game.board, coordinates=False, arrows=game.arrows[pv], flipped=game.side == 0)
        await ws.send(serialize_message('board', svg))


async def run_engine(uid, ws):
    game: GameObject = games[uid]
    if game.engine is None:
        try:
            game.transport, game.engine = await chess.engine.popen_uci(config.get('gui', 'engine_path'))
        except (FileNotFoundError, OSError) as err:
            await ws.send(serialize_message('error', 'Engine path: ' + err.strerror))
        await configure_engine(uid)

    if game.should_run():
        # Reset old arrows when engine is about to run
        game.arrows.clear()
        # print(game.board)
        limit: chess.engine.Limit = chess.engine.Limit()
        if config.getboolean('gui', 'use_depth'):
            limit.depth = config.getint('gui', 'depth')
        if config.getboolean('gui', 'use_time'):
            limit.time = config.getfloat('gui', 'time')

        if config.getboolean('gui', 'log_engine'):
            try:
                open(engine_config.get('engine', 'debug log file'), 'w').close()
            except Exception as err:
                pass
        # Look for opening moves from books
        found_book_move = False
        openings = []
        if config.has_option('gui', 'bookfile'):
            book = config.get('gui', 'bookfile')
            if Path(book).is_file():
                with chess.polyglot.open_reader(book) as reader:
                    arrow_pv = 1
                    for entry in reader.find_all(game.board):
                        found_book_move = True
                        openings.append(entry)
                        game.arrows[arrow_pv].append(get_arrow(entry.move, game.board.turn, 0))
                        arrow_pv += 1

        if not found_book_move and config.has_option('gui', 'bookfile2'):
            book = config.get('gui', 'bookfile2')
            if Path(book).is_file():
                arrow_pv = 1
                with chess.polyglot.open_reader(book) as reader:
                    for entry in reader.find_all(game.board):
                        found_book_move = True
                        openings.append(entry)
                        game.arrows[arrow_pv].append(get_arrow(entry.move, game.board.turn, 0))
                        arrow_pv += 1

        if not found_book_move:
            multipv = config.getint('gui', 'multipv')
            results = await game.engine.analyse(
                board=game.board,
                limit=limit,
                multipv=multipv,
                game=uid,
                info=chess.engine.INFO_ALL,
            )

        if found_book_move:
            best_move = game.board.san(openings[0].move)
            opening_moves = [{"multipv": i, "pv": [game.board.san(x.move)], "score": x.weight} for i, x in enumerate(openings)]
            await ws.send(serialize_message("multipv", opening_moves))
        else:
            best_move = game.board.san(results[0].pv[0])
            multipv_data = []
            for multipv in results:
                move_counter = 0
                pv = []
                for move in multipv.pv:
                    san = game.board.san(move)
                    game.arrows[multipv.multipv].append(get_arrow(move, game.board.turn, move_counter // 2))
                    pv.append(san)
                    game.board.push(move)
                    move_counter += 1
                for i in range(move_counter):
                    game.board.pop()
                if multipv.score.is_mate():
                    score = '#' + str(multipv.score.relative.moves)
                else:
                    score = multipv.score.relative.cp
                unit = {'multipv': multipv.multipv, "pv": pv, "score": score}
                multipv_data.append(unit)
            await ws.send(serialize_message("multipv", multipv_data))
        print('Best move:', best_move)

        await draw_svg_board(game, ws, 1)

        if config.getboolean('gui', 'use_voice'):
            tts = parse_speech(best_move)
            # print(tts)
            speech.stop()
            speech.say(tts)
            speech.iterate()
        game.missed_moves = False


async def update_settings(data, uid, ws):
    game = games[uid]
    key = data['key']
    value = data['value']
    if config.has_option('defaults', key):
        # config['defaults'][key] = value # Do not save defaults to file
        if key == 'side':
            game.side = int(value)
            print('Playing as', value)
            await run_engine(uid, ws)
        elif key == 'run':
            game.run = value
            if value == NONE:
                if game.engine is not None:
                    print('Paused. Closing engine...')
                    await game.engine.quit()
                    game.engine = None
                    game.transport = None
            else:
                print('Running engine for', value)
                if game.engine is None:
                    print('Launching engine.')
                    try:
                        game.transport, game.engine = await chess.engine.popen_uci(config['gui']['engine_path'])
                    except FileNotFoundError as err:
                        await ws.send(serialize_message('error', 'Engine path: ' + err.strerror))
                        return
                    await configure_engine(uid)
                await run_engine(uid, ws)
    # Set gui settings and save to file
    else:
        config['gui'][key] = str(value)
        with open('settings.ini', 'w') as config_file:
            config.write(config_file)
        # Re-initialize engine settings file, if engine path was changed.
        if key == 'engine_path':
            initialize_engine_settings_file()
        await run_engine(uid, ws)


async def update_engine_settings(data, uid, ws):
    key = data['key']
    value = data['value']
    engine_config['engine'][key] = str(value)

    base = os.path.basename(config.get('gui', 'engine_path'))
    engine_name = os.path.splitext(base)[0] + '.ini'
    with open(engine_name, 'w') as config_file:
        engine_config.write(config_file)


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
    elif data['type'] == 'engine_setting':
        await update_engine_settings(data['data'], uid, ws)

    if data['type'] == 'visibility':
        game.visible = data['data']
        print(f'Game {uid} {"visible" if game.visible else "hidden"}')
        # Launch or close engine based on visibility
        if game.visible:
            if game.engine is None:
                print('Launching engine.')
                try:
                    game.transport, game.engine = await chess.engine.popen_uci(config.get('gui', 'engine_path'))
                except FileNotFoundError as err:
                    await ws.send(serialize_message('error', 'Engine path: ' + err.strerror))
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
    # Clean Hash
    elif data['type'] == 'clear_hash':
        if game.engine is not None:
            print("Clearing hash...")
            await game.engine.configure({"Clear Hash": True})
    # Draw board with given PV
    elif data['type'] == 'draw_svg':
        print("Drawing board for PV", data['data'])
        await draw_svg_board(game, ws, data['data'])
    elif data['type'] == 'setting' or data['type'] == 'engine_setting':
        pass  # Settings are handled earlier
    else:
        if 'type' in data:
            print('Unknown type', data['type'])
        else:
            print('Unknown message', data)


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
    await ws.send(serialize_message('setting', {'key': 'enginePath', 'value': config.get('gui', 'engine_path')}))
    await ws.send(serialize_message('setting', {'key': 'playingAs', 'value': config.getint('defaults', 'side')}))
    await ws.send(serialize_message('setting', {'key': 'runEngineFor', 'value': config.getint('defaults', 'run')}))
    await ws.send(serialize_message('setting', {'key': 'useVoice', 'value': config.getboolean('gui', 'use_voice')}))
    await ws.send(serialize_message('setting', {'key': 'drawBoard', 'value': config.getboolean('gui', 'draw_board')}))
    await ws.send(serialize_message('setting', {'key': 'useDepth', 'value': config.getboolean('gui', 'use_depth')}))
    await ws.send(serialize_message('setting', {'key': 'depth', 'value': config.getint('gui', 'depth')}))
    await ws.send(serialize_message('setting', {'key': 'multipv', 'value': config.getint('gui', 'multipv')}))
    await ws.send(serialize_message('setting', {'key': 'useTime', 'value': config.getboolean('gui', 'use_time')}))
    await ws.send(serialize_message('setting', {'key': 'time', 'value': config.getfloat('gui', 'time')}))
    await ws.send(serialize_message('setting', {'key': 'book1', 'value': config.get('gui', 'bookfile')}))
    await ws.send(serialize_message('setting', {'key': 'book2', 'value': config.get('gui', 'bookfile2')}))
    await ws.send(serialize_message('setting', {'key': 'logEngine', 'value': config.getboolean('gui', 'log_engine')}))


async def send_engine_settings(ws, uid):
    settings = []
    dummy = chess.engine.SimpleEngine.popen_uci(config['gui']['engine_path'])
    for key, value in engine_config['engine'].items():
        option = dummy.options[key]
        if not option.is_managed():
            data = {
                'name': option.name,
                'type': option.type,
                'default': option.default,
                'min': option.min,
                'max': option.max,
                'value': value,
                'var': option.var
            }
            settings.append(data)
    await ws.send(serialize_message('engine_settings', settings))
    dummy.quit()


async def connection_handler(websocket, path):
    try:
        print('Client connected', path)
        # Send default settings values to client
        await send_defaults(websocket)
        # Send engine settings to client
        await send_engine_settings(websocket, path)

        async for message in websocket:
            # print(message)
            await handle_message(message, path, websocket)
        print('Connection closed', path)
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


start_server = websockets.serve(connection_handler, '127.0.0.1', 5678)
asyncio.get_event_loop().run_until_complete(start_server)
print('Looking for connections...')
asyncio.get_event_loop().run_forever()
# Clean up
speech.endLoop()
for game in games:
    if game.engine is not None:
        game.engine.quit()
