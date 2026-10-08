// Pure Snake rules. No DOM, no React — so the behaviour can be reasoned about
// and tested on its own, separately from rendering and input.

export const COLS = 19
export const ROWS = 19
export const CELLS = COLS * ROWS

// Milliseconds per move. Each piece of food shaves SPEEDUP_MS off the interval
// down to MIN_INTERVAL, so the pressure ramps with the score.
export const START_INTERVAL = 152
export const MIN_INTERVAL = 66
export const SPEEDUP_MS = 3.4

// How many turns may be buffered. A short queue makes fast double-taps
// ("up then right") land as two distinct moves instead of swallowing one,
// without letting a mash of keys steer several seconds into the future.
export const QUEUE_LIMIT = 2

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export function randomFood(snake, rand = Math.random) {
  const taken = new Set(snake.map((part) => part.y * COLS + part.x))
  const free = []
  for (let i = 0; i < CELLS; i += 1) {
    if (!taken.has(i)) free.push(i)
  }
  if (!free.length) return null
  const index = free[Math.min(free.length - 1, Math.floor(rand() * free.length))]
  return { x: index % COLS, y: Math.floor(index / COLS) }
}

export function createGame(rand = Math.random) {
  const cx = Math.floor(COLS / 2)
  const cy = Math.floor(ROWS / 2)
  const snake = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ]
  return {
    snake,
    dir: DIRS.right,
    queue: [],
    food: randomFood(snake, rand),
    score: 0,
    interval: START_INTERVAL,
    acc: 0, // milliseconds banked toward the next move
    eatFlash: 0, // 1 → 0 ring animation
    flashAt: null,
    dead: false,
    won: false,
  }
}

export function isOver(game) {
  return game.dead || game.won
}

// The direction the next move will actually use: the head of the queue if a
// turn is pending, otherwise the current heading.
export function pendingDir(game) {
  return game.queue.length ? game.queue[0] : game.dir
}

export function queueDir(game, dir) {
  if (!dir || isOver(game)) return false
  // Compare against the last *intended* direction, not the current one, so a
  // quick "left, up" pair is not rejected as a reversal of the old heading.
  const last = game.queue.length ? game.queue[game.queue.length - 1] : game.dir
  if (dir.x === last.x && dir.y === last.y) return false
  if (dir.x === -last.x && dir.y === -last.y) return false
  if (game.queue.length >= QUEUE_LIMIT) return false
  game.queue.push(dir)
  return true
}

export function step(game, rand = Math.random) {
  if (isOver(game)) return game
  if (game.queue.length) game.dir = game.queue.shift()

  const head = game.snake[0]
  const nx = head.x + game.dir.x
  const ny = head.y + game.dir.y

  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    game.dead = true
    return game
  }

  const eating = !!game.food && nx === game.food.x && ny === game.food.y
  // The final segment vacates its cell on this same move unless the snake is
  // growing, so moving into it is legal — the classic "chase your own tail".
  const occupied = eating ? game.snake.length : game.snake.length - 1
  for (let i = 0; i < occupied; i += 1) {
    if (game.snake[i].x === nx && game.snake[i].y === ny) {
      game.dead = true
      return game
    }
  }

  game.snake.unshift({ x: nx, y: ny })
  if (eating) {
    game.score += 1
    game.interval = Math.max(MIN_INTERVAL, game.interval - SPEEDUP_MS)
    game.eatFlash = 1
    game.flashAt = { x: nx, y: ny }
    game.food = randomFood(game.snake, rand)
    if (!game.food) game.won = true
  } else {
    game.snake.pop()
  }
  return game
}
