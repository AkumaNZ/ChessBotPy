from pywinauto import Application

app = Application(backend="uia")
app.connect(title_re=".*Chrome.*")
dlg = app.top_window()
try:
    url = dlg.child_window(title="Address and search bar",
                           control_type="Edit").get_value()
    print(url)
except Exception as ex:
    print(ex)

app.connect(title_re=".*Firefox.*")
dlg = app.top_window()
try:
    url = dlg.child_window(title="Search with Google or enter address",
                           control_type="Edit").get_value()
    print(url)
except Exception as ex:
    print(ex)
