import json


def serialize_message(target: str, message):
    return json.dumps({'target': target, 'message': message})
