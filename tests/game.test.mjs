// Rules-only tests. game.js has no DOM and no React, so the whole rule set can
// be exercised with plain Node and no dependencies:
//
//   node --test tests/
//
// `step` and `randomFood` take an injectable random source, so every case here
// is deterministic.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  COLS,
  DIRS,
  MIN_INTERVAL,
  ROWS,
  START_INTERVAL,
  createGame,
  queueDir,
  randomFood,
  step,
} from '../game.js'

const fixedRandom = () => 0

test('a new game starts with three segments heading right', () => {
  const game = createGame(fixedRandom)
  assert.equal(game.snake.length, 3)
  assert.deepEqual(game.dir, DIRS.right)
  assert.equal(game.score, 0)
  assert.equal(game.dead, false)
})

test('food never spawns on top of the snake', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const game = createGame(() => seed / 200)
    const onSnake = game.snake.some((p) => p.x === game.food.x && p.y === game.food.y)
    assert.equal(onSnake, false, `food landed on the snake for seed ${seed}`)
  }
})

test('eating adds a segment, scores a point, and speeds the game up', () => {
  const game = createGame(fixedRandom)
  game.food = { x: 10, y: 9 } // directly ahead of the head at (9, 9)

  step(game, fixedRandom)

  assert.equal(game.snake.length, 4)
  assert.equal(game.score, 1)
  assert.ok(game.interval < START_INTERVAL, 'interval should shorten after eating')
  assert.deepEqual(game.snake[0], { x: 10, y: 9 })
})

test('an ordinary move keeps the snake the same length', () => {
  const game = createGame(fixedRandom)
  game.food = null

  step(game, fixedRandom)

  assert.equal(game.snake.length, 3)
  assert.equal(game.score, 0)
  assert.deepEqual(game.snake[0], { x: 10, y: 9 })
})

test('the speed-up stops at the floor instead of going faster forever', () => {
  const game = createGame(fixedRandom)
  game.interval = MIN_INTERVAL
  game.food = { x: 10, y: 9 }

  step(game, fixedRandom)

  assert.equal(game.interval, MIN_INTERVAL)
})

test('running into a wall ends the run', () => {
  const game = createGame(fixedRandom)
  game.food = null

  for (let i = 0; i < COLS - 1 - 9; i += 1) step(game, fixedRandom)
  assert.equal(game.snake[0].x, COLS - 1, 'should be against the right wall')
  assert.equal(game.dead, false, 'touching the last column is still alive')

  step(game, fixedRandom)
  assert.equal(game.dead, true)
})

test('running into your own body ends the run', () => {
  const game = createGame(fixedRandom)
  game.food = null
  game.snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 4 },
    { x: 5, y: 4 }, // the cell the head is about to enter
    { x: 6, y: 4 },
    { x: 6, y: 5 },
    { x: 7, y: 5 },
  ]
  game.dir = DIRS.up

  step(game, fixedRandom)

  assert.equal(game.dead, true)
})

test('entering the tail cell is legal because the tail vacates on the same move', () => {
  const game = createGame(fixedRandom)
  game.food = null
  game.snake = [
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 6, y: 6 },
    { x: 5, y: 6 }, // the tail, and exactly where the head is heading
  ]
  game.dir = DIRS.down

  step(game, fixedRandom)

  assert.equal(game.dead, false)
  assert.deepEqual(game.snake[0], { x: 5, y: 6 })
})

test('that same move is fatal when the snake is growing, because the tail stays', () => {
  const game = createGame(fixedRandom)
  game.snake = [
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 6, y: 6 },
    { x: 5, y: 6 },
  ]
  game.dir = DIRS.down
  game.food = { x: 5, y: 6 } // eating into the occupied tail cell

  step(game, fixedRandom)

  assert.equal(game.dead, true)
})

test('a direct reversal is refused', () => {
  const game = createGame(fixedRandom) // heading right
  assert.equal(queueDir(game, DIRS.left), false)
  assert.equal(game.queue.length, 0)
})

test('a turn is judged against the last queued turn, not the current heading', () => {
  const game = createGame(fixedRandom) // heading right
  assert.equal(queueDir(game, DIRS.up), true, 'up is a legal turn from right')
  assert.equal(queueDir(game, DIRS.down), false, 'down would reverse the queued up')
  assert.deepEqual(game.queue, [DIRS.up])
})

test('the turn queue is bounded so a key mash cannot steer seconds ahead', () => {
  const game = createGame(fixedRandom)
  assert.equal(queueDir(game, DIRS.up), true)
  assert.equal(queueDir(game, DIRS.left), true)
  assert.equal(queueDir(game, DIRS.down), false, 'queue is full')
  assert.equal(game.queue.length, 2)
})

test('queued turns are applied one per move, in order', () => {
  const game = createGame(fixedRandom)
  game.food = null
  queueDir(game, DIRS.up)
  queueDir(game, DIRS.left)

  step(game, fixedRandom)
  assert.deepEqual(game.snake[0], { x: 9, y: 8 }, 'first move goes up')

  step(game, fixedRandom)
  assert.deepEqual(game.snake[0], { x: 8, y: 8 }, 'second move goes left')
  assert.equal(game.queue.length, 0)
})

test('a full board leaves nowhere to put food, which is the win condition', () => {
  const everyCell = []
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) everyCell.push({ x, y })
  }
  assert.equal(randomFood(everyCell, fixedRandom), null)
})

test('a finished game ignores further moves', () => {
  const game = createGame(fixedRandom)
  game.dead = true
  const before = JSON.stringify(game.snake)

  step(game, fixedRandom)

  assert.equal(JSON.stringify(game.snake), before)
  assert.equal(queueDir(game, DIRS.up), false)
})
