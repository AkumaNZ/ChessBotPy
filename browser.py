import asyncio
from pyppeteer import launch


def patch_pyppeteer():
    import pyppeteer.connection
    original_method = pyppeteer.connection.websockets.client.connect

    def new_method(*args, **kwargs):
        kwargs['ping_interval'] = None
        kwargs['ping_timeout'] = None
        return original_method(*args, **kwargs)

    pyppeteer.connection.websockets.client.connect = new_method


patch_pyppeteer()


def pyPrint(x):
    print(x)


async def pyppeteer_loop(parser):
    browser = await launch(autoClose=False)
    page = await browser.newPage()
    await page.goto('https://lichess.org/V9PipZuFxqdg')
    await page.exposeFunction('pyPrint', pyPrint)
    await page.exposeFunction('parser', parser)

    await page.evaluate('''() => {
        // Send initial moves to parser here
        var observer = new MutationObserver(mutations => {
            for (var mutation of mutations) {
                if (mutation.addedNodes.length) {
                    pyPrint(mutation.addedNodes[0].innerText);
                    parser(mutation.addedNodes[0].innerText);
                }
            }
        });
        observer.observe(document.querySelector('.moves'), { attributes: false, childList: true, subtree: true });
    }''')
    # await browser.close()


def browser(callback, url, site):
    loop = asyncio.get_event_loop()
    loop.create_task(pyppeteer_loop(callback))
    loop.run_forever()
    return loop
