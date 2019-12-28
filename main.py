import browser
import url
import time


def parser_callback(x):
    print(x)


def main():
    while True:
        print("Looking for URL")
        address = url.get_browser_url()
        if address:
            print("Found", address)
        address, site = url.verify_chess_url(address)
        print("Starting browser for", site, "at", address)
        loop = browser.pyppeteer_loop()
        time.sleep(10)


main()
