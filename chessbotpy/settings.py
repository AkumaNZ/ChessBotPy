import configparser
import os
from pathlib import Path

# Load configurations
config = configparser.ConfigParser()
engine_config = configparser.ConfigParser()
config.read('settings.ini')


def initialize_engine_settings_file(dummy):
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


def update_settings(data, game, dummy):
    '''
    Updates settings.ini file.
    Returns True if engine should be ran after updating and False if engine should be closed.
    '''
    key = data['key']
    value = data['value']
    if config.has_option('defaults', key):
        setattr(game, key, value)
        if key == 'run' and value == 3:  # 3 = NONE
            return False
    else:
        # Set gui settings and save to file
        config['gui'][key] = str(value)
        with open('settings.ini', 'w') as config_file:
            config.write(config_file)
        # Re-initialize engine settings file, if engine path was changed.
        if key == 'engine_path':
            initialize_engine_settings_file(dummy)
    return True


async def update_engine_settings(data):
    '''
    Updates engine_config and engine specific settings file
    '''
    key = data['key']
    value = data['value']
    engine_config['engine'][key] = str(value)

    base = os.path.basename(config.get('gui', 'engine_path'))
    engine_name = os.path.splitext(base)[0] + '.ini'
    with open(engine_name, 'w') as config_file:
        engine_config.write(config_file)


def get_mapped_settings():
    yield {'key': 'enginePath', 'value': config.get('gui', 'engine_path')}
    yield {'key': 'runEngineFor', 'value': config.getint('defaults', 'run')}
    yield {'key': 'useVoice', 'value': config.getboolean('gui', 'use_voice')}
    yield {'key': 'drawBoard', 'value': config.getboolean('gui', 'draw_board')}
    yield {'key': 'useDepth', 'value': config.getboolean('gui', 'use_depth')}
    yield {'key': 'depth', 'value': config.getint('gui', 'depth')}
    yield {'key': 'multipv', 'value': config.getint('gui', 'multipv')}
    yield {'key': 'useTime', 'value': config.getboolean('gui', 'use_time')}
    yield {'key': 'time', 'value': config.getfloat('gui', 'time')}
    yield {'key': 'book1', 'value': config.get('gui', 'bookfile')}
    yield {'key': 'book2', 'value': config.get('gui', 'bookfile2')}
    yield {'key': 'logEngine', 'value': config.getboolean('gui', 'clear_log')}
