import io
from os import listdir
from os.path import isfile, join

openings = {}

def load_eco(path):
    onlyfiles = [f for f in listdir(path) if isfile(join(path, f))]
    for f in onlyfiles:
        full_path = join(path, f)
        print(full_path)
        with open(full_path, encoding="utf-8") as handle:
            for line in handle.readlines():
                elements = line.split('\t')
                openings[elements[2]] = elements[1]

def get_name(epd):
    name = openings.get(epd)
    if name:
        return name
    else:
        return ""