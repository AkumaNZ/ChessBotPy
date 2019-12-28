from pywinauto import Application

LICHESS = 'lichess'
UNKNOWN = 'unknown'
CHESS = 'chess.com'


def get_browser_url():
    app = Application(backend="uia")
    app.connect(title_re=".*Chrome.*")
    dlg = app.top_window()
    try:
        chess_url = dlg.child_window(title="Address and search bar",
                                     control_type="Edit").get_value()
        return chess_url
    except Exception as ex:
        print(ex)
        print("Chrome failed, attempting Firefox...")
        app.connect(title_re=".*Firefox.*")
        dlg = app.top_window()
        try:
            chess_url = dlg.child_window(
                title="Search with Google or enter address",
                control_type="Edit").get_value()
            return chess_url
        except Exception as ex:
            print(ex)
            print("Firefox failed as well...")


def verify_chess_url(chess_url):
    if "lichess.org/" in chess_url:
        return chess_url, LICHESS
    elif "chess.com/" in chess_url:
        return chess_url, CHESS
    else:
        return chess_url, UNKNOWN
