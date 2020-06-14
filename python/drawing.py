import chess.svg

arrow_colors = {
    chess.BLACK: [  # Red
        "hsl(356, 75%, 53%, 1)",
        "hsl(356, 75%, 53%, 0.8)",
        "hsl(356, 75%, 53%, 0.6)",
        "hsl(356, 75%, 53%, 0.4)",
        "hsl(356, 75%, 53%, 0.2)",
    ],
    chess.WHITE: [  # Green
        "hsl(123, 57%, 45%, 1)",
        "hsl(123, 57%, 45%, 0.8)",
        "hsl(123, 57%, 45%, 0.6)",
        "hsl(123, 57%, 45%, 0.4)",
        "hsl(123, 57%, 45%, 0.2)",
    ],
}


def get_arrow(move, side, n):
    if n >= 5:
        color = "hsla(0, 0%, 0%, 0)"
    else:
        color = arrow_colors[side][n]
    return chess.svg.Arrow(tail=move.from_square, head=move.to_square, color=color)


def draw_svg_board(game, pv):
    svg = chess.svg.board(board=game.board, coordinates=False, arrows=game.arrows[pv], flipped=game.side == 0)
    return svg
