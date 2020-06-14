import json

# Constants / Enums
# Side
BLACK = 0
WHITE = 1

# Run engine for
ME = 0
OPPONENT = 1
BOTH = 2

# RERUN ENGINE
CLOSE = 0
RERUN = 1
NOOP = 2


def serialize_message(target: str, message):
    return json.dumps({"target": target, "message": message})
