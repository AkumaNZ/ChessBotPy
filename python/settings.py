import configparser
import os
from pathlib import Path
from common import serialize_message

# Load configurations
config = configparser.ConfigParser()
engine_config = configparser.ConfigParser()
config.read('settings.ini')


def initialize_settings_file():
    config['gui'] = {
        'run': 2,
        'engine_path': '',
        'use_voice': True,
        'use_depth': True,
        'depth': 8,
        'use_time': True,
        'time': 2.0,
        'draw_board': True,
        'multipv': 2,
        'clear_log': True,
        'use_book': True,
        'draw_overlay': True
    }
    with open('settings.ini', 'w') as config_file:
        config.write(config_file)


def initialize_engine_settings_file(dummy):
    print("Initializing engine settings file")
    engine_config.clear()
    if not config.has_option('gui', 'engine_path'):
        print('Settings.ini is missing engine path. Please fix and try again.')
        return

    engine_file = Path(config.get('gui', 'engine_path'))
    if not engine_file.is_file():
        print('Given engine path is not valid. Please fix and try again')
        return

    base = os.path.basename(config.get('gui', 'engine_path'))
    engine_name = os.path.splitext(base)[0] + '.ini'
    engine_settings_file = Path(engine_name)

    if engine_settings_file.is_file():
        engine_config.read(engine_name)

    if not engine_config.has_section('engine'):
        # Create an engine settings file with default values
        engine_config['engine'] = {}
        for key, option in dummy.options._store.values():
            if not option.is_managed():
                engine_config['engine'][key] = str(option.default)
        with open(engine_name, 'w+') as config_file:
            engine_config.write(config_file)


async def update_settings(data, game, ws, uid):
    '''
    Updates settings.ini file.
    Returns True if engine should be ran after updating.
    '''
    print("Updating settings", data)
    if not os.path.exists('settings.ini'):
        initialize_settings_file()

    key = data['key']
    value = data['value']
    # Update game object if the key exists and the value is not the same as before
    if hasattr(game, key):
        setattr(game, key, value)
        if key == 'running':
            return value

    if config.has_option('gui', key):
        # Set gui settings and save to file
        config['gui'][key] = str(value)

        with open('settings.ini', 'w') as config_file:
            config.write(config_file)
        return True
    print("Setting not found.")
    return False


async def send_settings(ws):
    print("Sending settings to client")
    if not os.path.exists('settings.ini'):
        initialize_settings_file()
    try:
        for setting in get_mapped_settings():
            await ws.send(serialize_message('setting', setting))
    except Exception as err:
        print(err)
        print(
            "Failed to fetch and send settings from settings.ini. Please check your settings.ini"
        )
        quit()


async def update_engine_settings(data):
    '''
    Updates engine_config and engine specific settings file
    '''
    print("Updating engine settings", data)
    key = data['key']
    value = data['value']
    engine_config['engine'][key] = str(value)

    base = os.path.basename(config.get('gui', 'engine_path'))
    engine_name = os.path.splitext(base)[0] + '.ini'
    with open(engine_name, 'w') as config_file:
        engine_config.write(config_file)


async def send_engine_settings(ws, dummy):
    print("Sending engine settings to client")
    engine_settings = []

    for key, value in engine_config['engine'].items():
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


def get_mapped_settings():
    yield {'key': 'enginePath', 'value': config.get('gui', 'engine_path')}
    yield {'key': 'runEngineFor', 'value': config.getint('gui', 'run')}
    yield {'key': 'useVoice', 'value': config.getboolean('gui', 'use_voice')}
    yield {'key': 'drawBoard', 'value': config.getboolean('gui', 'draw_board')}
    yield {'key': 'useDepth', 'value': config.getboolean('gui', 'use_depth')}
    yield {'key': 'depth', 'value': config.getint('gui', 'depth')}
    yield {'key': 'multipv', 'value': config.getint('gui', 'multipv')}
    yield {'key': 'useTime', 'value': config.getboolean('gui', 'use_time')}
    yield {'key': 'time', 'value': config.getfloat('gui', 'time')}
    yield {'key': 'logEngine', 'value': config.getboolean('gui', 'clear_log')}
    yield {'key': 'useBook', 'value': config.getboolean('gui', 'use_book')}
    yield {
        'key': 'drawOverlay',
        'value': config.getboolean('gui', 'draw_overlay')
    }
