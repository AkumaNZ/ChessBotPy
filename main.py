import asyncio
import websockets
import chess
import chess.engine
import json

games = {}


class GameObject():
    def __init__(self, board, engine, transport):
        self.board = board
        self.engine = engine
        self.transport = transport


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
        print("Best move:", games[path].board.san(result.move))
        print("Ponder:", games[path].board.san(result.ponder))


async def connection_handler(websocket, path):
    print("client connected", path)
    async for message in websocket:
        print(message)
        await handle_message(message, path)
    print("Connection closed", path)
    del games[path]


start_server = websockets.serve(connection_handler, "127.0.0.1", 5678)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
