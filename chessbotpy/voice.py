import pyttsx3

speech = pyttsx3.init()
speech.startLoop(False)
print('Initialized TTS')

digits = {
    '1': 'one ',
    '2': 'two ',
    '3': 'three ',
    '4': 'four ',
    '5': 'five ',
    '6': 'six ',
    '7': 'seven ',
    '8': 'eight ',
}


def parse_speech(move: str):
    castles_count = 0
    sentence = ''
    for letter in move:
        if letter == 'K':
            sentence += 'King '
        elif letter == 'Q':
            sentence += 'Queen '
        elif letter == 'R':
            sentence += 'Rook '
        elif letter == 'B':
            sentence += 'Bishop '
        elif letter == 'N':
            sentence += 'Knight '
        elif letter == 'x':
            sentence += 'takes '
        elif letter == '+':
            sentence += 'check '
        elif letter == '#':
            sentence += 'mate '
        elif letter == 'O' or letter == '-':
            castles_count += 1
        elif letter == '=':
            sentence += 'promotes to '
        elif letter.isdigit():
            sentence += digits[letter]
        else:
            if letter == 'a':
                if sentence == '':
                    sentence += 'AA '
                else:
                    sentence += 'A '
            else:
                sentence += f'{letter} '
        if castles_count == 3 and len(move) < 5:
            sentence += 'castles'
        elif castles_count == 5:
            sentence += 'long castles'
    return sentence


def say(message):
    tts = parse_speech(message)
    speech.stop()
    speech.say(tts)
    speech.iterate()
