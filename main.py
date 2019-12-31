import asyncio
import websockets


async def game(websocket, path):
    try:
        print("client connected", path)
        async for message in websocket:
            print(message)
    except websockets.ConnectionClosedOK as err:
        print("User closed window...")
        print(err)


start_server = websockets.serve(game, "127.0.0.1", 5678)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
