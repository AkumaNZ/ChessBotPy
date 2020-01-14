from cx_Freeze import setup, Executable

# Dependencies are automatically detected, but it might need
# fine tuning.
buildOptions = dict(packages = [], excludes = [])

base = 'Console'

executables = [
    Executable('main.py', base=base, targetName = 'ChessBotPy')
]

setup(name='ChessBotPy',
      version = '1.0',
      description = 'Chess Bot for Lichess',
      options = dict(build_exe = buildOptions),
      executables = executables)
