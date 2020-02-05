import asyncio
import websockets
import chess
import chess.engine
import chess.polyglot
import json
from pathlib import Path
from collections import defaultdict
# Own modules
import settings
import voice
import drawing

try:
    dummy = chess.engine.SimpleEngine.popen_uci(settings.config.get('gui', 'engine_path'))
    settings.initialize_engine_settings_file(dummy)
except Exception as err:
    print(err)
    print('Could not open engine. Please fix engine_path in settings.ini and try again.')
    quit()

# Global state
games = {}

# Constants
# Side
BLACK = 0
WHITE = 1

# Run engine for
ME = 0
OPPONENT = 1
BOTH = 2


class GameObject():

    def __init__(self, board):
        self.board: chess.Board = board
        self.engine: chess.engine.EngineProtocol = None
        self.transport: asyncio.transports.SubprocessTransport = None
        self.visible = True
        self.missed_moves = False
        self.side = WHITE
        self.running = True
        self.arrows = defaultdict(list)

    def should_run(self):
        if not self.running:
            return False
        if self.board.is_game_over():
            return False
        if settings.config.getint('gui', 'run') != BOTH and self.board.turn != self.side:
            return False
        return True


def read_book(book, opening_moves, game, line, depth):
    engine_depth = settings.config.getint('gui', 'depth')
    max_depth = engine_depth if engine_depth > 0 else 5

    if depth >= max_depth:
        opening_moves.append(line)
        return

    eol = True
    with chess.polyglot.open_reader(book) as reader:
        if depth < settings.config.getint('gui', 'multipv'):
            for entry in reader.find_all(game.board):
                eol = False
                new_line = line.copy()
                new_line.append(entry)
                game.board.push(entry.move)
                read_book(book, opening_moves, game, new_line, depth + 1)
                game.board.pop()
        else:
            eol = False
            try:
                entry = reader.find(game.board)
                new_line = line.copy()
                new_line.append(entry)
                game.board.push(entry.move)
                read_book(book, opening_moves, game, new_line, depth + 1)
                game.board.pop()
            except Exception:
                pass
    if eol and len(line) > 0:
        opening_moves.append(line)


async def close_engine(game):
    if game.engine is not None:
        print('Closing engine.')
        await game.engine.quit()
        game.engine = None
        game.transport = None


async def configure_engine(engine):
    if engine is not None:
        for key, value in settings.engine_config['engine'].items():
            option = engine.options[key]
            if not option.is_managed():
                await engine.configure({key: value})


async def run_engine(uid, ws):
    game: GameObject = games[uid]
    if game.engine is None:
        try:
            engine_path = settings.config.get('gui', 'engine_path')
            game.transport, game.engine = await chess.engine.popen_uci(engine_path)
        except (FileNotFoundError, OSError) as err:
            await ws.send(serialize_message('error', 'Engine path: ' + err.strerror))
        await configure_engine(game.engine)

    if game.should_run():
        # Reset old arrows when engine is about to run
        game.arrows.clear()
        # print(game.board)
        limit: chess.engine.Limit = chess.engine.Limit()
        if settings.config.getboolean('gui', 'use_depth'):
            limit.depth = settings.config.getint('gui', 'depth')
        if settings.config.getboolean('gui', 'use_time'):
            limit.time = settings.config.getfloat('gui', 'time')

        if settings.config.getboolean('gui', 'clear_log'):
            try:
                open(settings.engine_config.get('engine', 'debug log file'), 'w').close()
            except Exception:
                pass
        # Look for opening moves from books
        found_book_move = False
        opening_moves = []

        if settings.config.has_option('gui', 'bookfile'):
            book = settings.config.get('gui', 'bookfile')
            if Path(book).is_file():
                read_book(book, opening_moves, game, [], 0)
                found_book_move = len(opening_moves) > 0

        if not found_book_move and settings.config.has_option('gui', 'bookfile2'):
            book = settings.config.get('gui', 'bookfile2')
            if Path(book).is_file():
                read_book(book, opening_moves, game, [], 0)
                found_book_move = len(opening_moves) > 0

        if found_book_move:
            opening_moves = sorted(opening_moves, key=lambda x: sum([y.weight for y in x]), reverse=True)
            best_move = game.board.san(opening_moves[0][0].move)
            multipv = []
            for list_index, movelist in enumerate(opening_moves):
                score = 0
                pv = []
                # Calculate avg. weight of the line and append all the SAN moves
                for entry_index, entry in enumerate(movelist):
                    pv.append(game.board.san(entry.move))
                    arrow = drawing.get_arrow(entry.move, game.board.turn, entry_index // 2)
                    game.arrows[list_index + 1].append(arrow)
                    game.board.push(entry.move)
                    score += entry.weight
                # Unwind the move stack
                for _ in range(len(pv)):
                    game.board.pop()
                line = {'multipv': list_index + 1, 'score': round(score / len(pv), 0), 'pv': pv}
                multipv.append(line)

            # multipv = sorted(multipv, key=lambda x: x['score'], reverse=True)
            await ws.send(serialize_message('multipv', multipv))
        else:
            # If there no opening moves were found, use engine to analyse instead
            multipv = settings.config.getint('gui', 'multipv')
            results = await game.engine.analyse(
                board=game.board,
                limit=limit,
                multipv=multipv,
                game=uid,
                info=chess.engine.INFO_ALL,
            )
            best_move = game.board.san(results[0].pv[0])
            multipv_data = []
            for multipv in results:
                move_counter = 0
                pv = []
                for move in multipv.pv:
                    san = game.board.san(move)
                    arrow = drawing.get_arrow(move, game.board.turn, move_counter // 2)
                    game.arrows[multipv.multipv].append(arrow)
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

        if settings.config.getboolean('gui', 'draw_board'):
            svg = drawing.draw_svg_board(game, 1)
            await ws.send(serialize_message('board', svg))

        if settings.config.getboolean('gui', 'use_voice'):
            voice.say(best_move)
        game.missed_moves = False


async def update_board(game, data, uid, ws, fen):
    game.board.reset()
    if fen:
        game.board.set_fen(data)
    else:
        for move in data:
            # if not game.board.is_game_over():
            try:
                game.board.push_san(move)
            except ValueError as err:
                print(err)

    if game.visible:
        await run_engine(uid, ws)
    else:
        print('Missed a move on:', uid)
        game.missed_moves = True


def serialize_message(target: str, message):
    return json.dumps({'target': target, 'message': message})


async def send_settings(ws):
    try:
        for setting in settings.get_mapped_settings():
            await ws.send(serialize_message('setting', setting))
    except Exception as err:
        print(err)
        print("Failed to fetch and send settings from settings.ini. Please check your settings.ini")
        quit()


async def send_engine_settings(ws):
    engine_settings = []
    for key, value in settings.engine_config['engine'].items():
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
            engine_settings.append(data)
    await ws.send(serialize_message('engine_settings', engine_settings))


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
        if settings.update_settings(data['data'], game, dummy):
            await run_engine(uid, ws)
        else:
            await close_engine(game)
    elif data['type'] == 'engine_setting':
        await settings.update_engine_settings(data['data'])

    if data['type'] == 'visibility':
        game.visible = data['data']
        print(f'Game {uid} {"visible" if game.visible else "hidden"}')
        # Launch or close engine based on visibility
        if not game.visible:
            await close_engine(game)
        # Run engine if there were any missed moves while game was not visible
        if game.visible and game.missed_moves:
            await run_engine(uid, ws)
    # Update board
    elif data['type'] == 'moves':
        await update_board(game, data['data'], uid, ws, False)
    elif data['type'] == 'fen':
        await update_board(game, data['data'], uid, ws, True)
    # Clean Hash
    elif data['type'] == 'clear_hash':
        if game.engine is not None:
            print("Clearing hash...")
            await game.engine.configure({"Clear Hash": True})
    # Draw board with given PV
    elif data['type'] == 'draw_svg':
        print("Drawing board for PV", data['data'])
        # FIX ME! Should we only draw/send board if the setting is enabled?
        svg = drawing.draw_svg_board(game, data['data'])
        await ws.send(serialize_message('board', svg))
    elif data['type'] == 'setting' or data['type'] == 'engine_setting':
        pass  # Settings are handled earlier
    elif 'type' in data:
        print('Unknown type', data['type'])
    else:
        print('Unknown message', data)


async def cleanup(uid):
    if uid in games:
        if games[uid].engine is not None:
            await games[uid].engine.quit()
        del games[uid]


async def connection_handler(websocket, path):
    try:
        print('Client connected', path)
        # Send default settings values to client
        await send_settings(websocket)
        # Send engine settings to client
        await send_engine_settings(websocket)

        async for message in websocket:
            try:
                await handle_message(message, path, websocket)
            except Exception as err:
                print(err)
                print("Something went wrong. Keep trying...")

        print('Connection closed', path)
        # Clean up
        await cleanup(path)
    except websockets.ConnectionClosed as err:
        print(err)
        await cleanup(path)


start_server = websockets.serve(connection_handler, '127.0.0.1', 5678)
asyncio.get_event_loop().run_until_complete(start_server)
print('Looking for connections...')
asyncio.get_event_loop().run_forever()

# Clean up
voice.speech.endLoop()
for game in games:
    if game.engine is not None:
        game.engine.quit()
dummy.quit()
