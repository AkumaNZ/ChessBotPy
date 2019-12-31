import asyncio


async def find_games():
    games = set()
    while True:
        print("...")
        address = "https://lichess.org/nKQbaMxtQtb8"
        if address not in games:
            print("Found game:", address)
            games.add(address)
            asyncio.create_task(...)
        await asyncio.sleep(5)


def main():
    loop = asyncio.get_event_loop()
    loop.create_task(find_games())
    loop.run_forever()


main()
