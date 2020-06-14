from os import listdir
from os.path import isfile, join

openings = {}


def load_books(path):
    onlyfiles = [f for f in listdir(path) if isfile(join(path, f))]
    onlyfiles.sort()
    return [join(path, f) for f in onlyfiles]
