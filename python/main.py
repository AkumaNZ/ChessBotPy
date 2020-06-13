import os
import asyncio
import websockets
import chess
import chess.engine
import json
import chess.polyglot
from pathlib import Path
from collections import defaultdict
# Own modules
import settings
import eco
import voice
import drawing
import books
from common import *

DEBUG = False

try:
    eco.load_eco('eco')
except Exception as err:
    print(
        "Could not load eco files. Make sure there's an 'eco' folder in the root with these files: https://github.com/niklasf/eco"
    )
    if DEBUG:
        print(err)

# Global state
games = {}
tasks = {}
task_counter = 0


class GameObject():
    def __init__(self, board):
        self.board: chess.Board = board
        self.engine: chess.engine.EngineProtocol = None
        self.transport: asyncio.transports.SubprocessTransport = None
        self.missed_moves = False
        self.side = WHITE
        self.running = True
        self.arrows = defaultdict(list)
        self.analysing = False

    def should_run(self):
        run_for = settings.config.getint('gui', 'run')
        side = self.side
        turn = self.board.turn

        if not self.running:
            return False
        if self.board.is_game_over():
            return False
        if (run_for == ME and side != turn) or (run_for == OPPONENT and side == turn):
            return False
        return True


def read_book(book, opening_moves, game, line, response):
    eol = True
    with chess.polyglot.open_reader(book) as reader:
        for entry in reader.find_all(game.board, minimum_weight=0):
            eol = False
            new_line = line.copy()
            new_line.append(entry)
            if response:
                opening_moves.append(new_line)
            else:
                game.board.push(entry.move)
                read_book(book, opening_moves, game, new_line, True)
                game.board.pop()
    if eol and len(line) > 0:
        opening_moves.append(line)


async def close_engine(game):
    if game.engine is not None:
        print('Closing engine.')
        try:
            await game.engine.quit()
        except Error as err:
            print('Error while quitting engine')
            if DEBUG:
                print(err)
        game.engine = None
        game.transport = None


async def configure_engine(engine):
    if engine is not None:
        for key, value in settings.engine_config['engine'].items():
            option = engine.options[key]
            if not option.is_managed():
                await engine.configure({key: value})


async def run_engine(uid, ws, task):
    game: GameObject = games[uid]
    if game.engine is None:
        try:
            engine_path = settings.config.get('gui', 'engine_path')
            game.transport, game.engine = await chess.engine.popen_uci(
                engine_path)
        except (FileNotFoundError, OSError) as err:
            await ws.send(
                serialize_message('error', 'Engine path: ' + err.strerror))
        await configure_engine(game.engine)

    if not game.should_run():
        return

    # Reset old arrows when engine is about to run
    game.arrows.clear()
    # print(game.board)
    limit: chess.engine.Limit = chess.engine.Limit()
    use_depth = settings.config.getboolean('gui', 'use_depth')
    use_time = settings.config.getboolean('gui', 'use_time')
    if use_depth:
        limit.depth = settings.config.getint('gui', 'depth')
    if use_time:
        limit.time = settings.config.getfloat('gui', 'time')

    if not use_depth and not use_time:
        limit.depth = 8
        await ws.send(
            serialize_message('error',
                              'No limit set, using default depth of 8'))

    if settings.config.getboolean('gui', 'clear_log'):
        try:
            open(settings.engine_config.get('engine', 'debug log file'),
                 'w').close()
        except Exception:
            pass
    # Look for opening moves from books
    opening_moves = []
    if settings.config.getboolean('gui', 'use_book'):
        bookfiles = books.load_books('books')
        for bookfile in bookfiles:
            read_book(bookfile, opening_moves, game, [], 0)

    if len(opening_moves) > 0:
        opening_moves = sorted(opening_moves,
                               key=lambda x: sum([y.weight for y in x]),
                               reverse=True)
        best_move = game.board.san(opening_moves[0][0].move)
        opening_dict = defaultdict(list)

        for move, *reply in opening_moves:
            reply = reply[0] if len(reply) > 0 else None
            raw_keys = [x.raw_move for x in opening_dict]
            raw_key = move.raw_move

            # If the raw has already been added
            if (raw_key in raw_keys):
                # No need to do anything if there is no reply anyway
                if reply:
                    # Find the raw move and append reply to there instead
                    existing_key = None
                    for key in opening_dict:
                        if key.raw_move == raw_key:
                            existing_key = key
                    if (existing_key):
                        # Check if the list contains raw_move of the reply already
                        raw_moves = [
                            x.raw_move for x in opening_dict[existing_key]
                        ]
                        raw_move = reply.raw_move
                        if (raw_move not in raw_moves):
                            opening_dict[key].append(reply)
            else:
                if reply:
                    opening_dict[move].append(reply)
                else:
                    opening_dict[move] = []

        multi_pv = []
        list_index = 0
        for move, replies in opening_dict.items():
            list_index += 1
            score = move.weight
            pv = []
            lan = []
            pv.append(game.board.san(move.move))
            lan.append(game.board.lan(move.move))
            arrow = drawing.get_arrow(move.move, game.board.turn, 0)
            game.arrows[list_index].append(arrow)
            game.board.push(move.move)
            epd_board = game.board.copy()
            opponents_turn = game.board.turn
            for reply in replies:
                pv.append(game.board.san(reply.move))
                lan.append(game.board.lan(reply.move))
                arrow = drawing.get_arrow(reply.move, opponents_turn, 1)
                game.arrows[list_index].append(arrow)
            # Unwind the move stack
            game.board.pop()
            epd = epd_board.epd()
            line = {
                'multipv': list_index,
                'score': score,
                'pv': pv,
                'lan': lan,
                'eco': eco.get_name(epd),
                'turn': game.board.turn
            }

            multi_pv.append(line)
        await ws.send(serialize_message('multipv', multi_pv))
    else:
        # If there no opening moves were found, use engine to analyse instead
        if game.engine is None:
            print(
                "Trying to analyse but engine has not been initialized, check engine path.")
            await ws.send(serialize_message('error', "Trying to analyse but engine has not been initialized, check engine path."))
            return

        multi_pv = settings.config.getint('gui', 'multipv')
        print("Starting analysis with limit", limit, "for", multi_pv,
              "pv(s)")
        try:
            await cancel_tasks(task)
            tasks[task]['cancelable'] = True
            results = await game.engine.analyse(
                board=game.board,
                limit=limit,
                multipv=multi_pv,
                game=uid,
                info=chess.engine.INFO_ALL,
            )
        except Exception as err:
            print('Engine analysis failed.')
            if DEBUG:
                print(err)
            return
        finally:
            tasks[task]['cancelable'] = False

        best_move = game.board.san(results[0].pv[0])
        multipv_data = []
        for multi_pv in results:
            move_counter = 0
            pv = []
            lan_pv = []
            epd_board = None

            for index, move in enumerate(multi_pv.pv):
                san = game.board.san(move)
                lan = game.board.lan(move)
                arrow = drawing.get_arrow(move, game.board.turn,
                                          move_counter // 2)
                pv_index = 1 if multi_pv.multipv == None else multi_pv.multipv
                game.arrows[pv_index].append(arrow)

                pv.append(san)
                lan_pv.append(lan)
                game.board.push(move)

                if index == 0:
                    epd_board = game.board.copy()
                move_counter += 1

            for i in range(move_counter):
                game.board.pop()

            if multi_pv.score.is_mate():
                score = '#' + str(multi_pv.score.relative.moves)
            else:
                score = multi_pv.score.relative.cp

            unit = {
                'multipv': multi_pv.multipv,
                'pv': pv,
                'lan': lan_pv,
                'score': score,
                'eco': eco.get_name(epd_board.epd()),
                'turn': game.board.turn
            }
            multipv_data.append(unit)
        await ws.send(serialize_message("multipv", multipv_data))
    print('Best move:', best_move)

    if settings.config.getboolean('gui', 'draw_board'):
        svg = drawing.draw_svg_board(game, 1)
        await ws.send(serialize_message('board', svg))

    if settings.config.getboolean('gui', 'use_voice'):
        voice.say(best_move)
    game.missed_moves = False


async def update_board(game, data, uid, ws, fen, task):
    game.board.reset()
    if fen:
        game.board.set_fen(data)
    else:
        for move in data:
            try:
                game.board.push_san(move)
            except ValueError as err:
                print("Invalid SAN value")
                if DEBUG:
                    print(err)

    await run_engine(uid, ws, task)


async def handle_message(message, uid, ws, task):
    # Initialize game object with a new board
    if uid not in games:
        games[uid] = GameObject(chess.Board())

    # Shorthand for the game
    game = games[uid]

    # Parse json message
    data = json.loads(message)

    # Handle setting changes before engine is initialized
    if data['type'] == 'setting':
        rerun_engine = await settings.update_settings(data['data'], game, ws, uid)
        if rerun_engine == CLOSE:
            await close_engine(game)

        if data['data']['key'] == 'engine_path':
            # Re-initialize engine settings file, and send engine settings to client if engine path was changed.
            await close_engine(game)
            try:
                engine_path = settings.config.get('gui', 'engine_path')
                if os.path.exists(engine_path):
                    dummy = chess.engine.SimpleEngine.popen_uci(engine_path)
                    settings.initialize_engine_settings_file(dummy)
                    await settings.send_engine_settings(ws, dummy)
                    dummy.quit()
                else:
                    print("Invalid engine path.")
                    await websocket.send(serialize_message('error', 'Invalid engine path.'))
            except Exception as err:
                print('Initializing engine failed.')
                if DEBUG:
                    print(err)

        if rerun_engine == RERUN:
            await run_engine(uid, ws, task)

    elif data['type'] == 'engine_setting':
        await settings.update_engine_settings(data['data'])
        await run_engine(uid, ws, task)

    elif data['type'] == 'moves':
        await update_board(game, data['data'], uid, ws, False, task)

    elif data['type'] == 'fen':
        await update_board(game, data['data'], uid, ws, True, task)

    elif data['type'] == 'clear_hash':
        if game.engine is not None:
            print("Clearing hash...")
            await game.engine.configure({"Clear Hash": True})

    elif data['type'] == 'draw_svg':
        print("Drawing board for PV", data['data'])
        svg = drawing.draw_svg_board(game, data['data'])
        await ws.send(serialize_message('board', svg))

    elif 'type' in data:
        print('Unknown type', data['type'])

    else:
        print('Unknown message', data)


async def cancel_tasks(current_task):
    done = []
    for task_index, task in tasks.items():
        if task['task'].done():
            done.append(task_index)
        if task != current_task and task['cancelable'] == True:
            task['task'].cancel()
            try:
                await task['task']
            except asyncio.CancelledError:
                done.append(task_index)
                print(f'Task {current_task} is now cancelled.')

    for t in done:
        del tasks[t]


async def connection_handler(websocket, path):
    global tasks
    global task_counter
    try:
        print('Client connected', path)
        # Send default settings values to client
        await settings.send_settings(websocket)

        # Send engine settings to client
        engine_path = settings.config.get('gui', 'engine_path')
        if os.path.exists(engine_path):
            dummy = chess.engine.SimpleEngine.popen_uci(engine_path)
            settings.initialize_engine_settings_file(dummy)
            await settings.send_engine_settings(websocket, dummy)
            dummy.quit()
        else:
            print("Engine path is not defined.")
            await websocket.send(serialize_message('error', 'Engine path is not defined'))

        async for message in websocket:
            try:
                task_counter += 1
                task = asyncio.create_task(
                    handle_message(message, path, websocket, task_counter),
                    name=task_counter
                )
                tasks[task_counter] = {'task': task, 'cancelable': False}
            except Exception as err:
                print("Something went wrong. Keep trying...")
                if DEBUG:
                    print(err)

        print('Connection closed', path)

    except websockets.ConnectionClosed as err:
        print("WebSocket connection closed.")
        print("Please restart the server.")
        if DEBUG:
            print(err)
        await games[path].engine.quit()
        del games[path]


start_server = websockets.serve(connection_handler, '127.0.0.1', 5678)
asyncio.get_event_loop().run_until_complete(start_server)
print('Waiting for connections...')
asyncio.get_event_loop().run_forever()

# Clean up
voice.speech.endLoop()
for game in games:
    if game.engine is not None:
        game.engine.quit()
