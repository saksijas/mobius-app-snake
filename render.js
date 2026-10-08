// Canvas painting for Snake. Nothing here mutates game state.

import { COLS, ROWS, pendingDir } from './game.js'

export const BOARD_RADIUS = 16

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

// Canvas normalises any colour it accepts into "#rrggbb" or "rgba(...)", which
// gives us a dependable parser for whatever form a theme variable is written in
// (hex, rgb(), color-mix(), oklch()...).
// A colour canvas cannot parse leaves fillStyle untouched, so an unlikely
// sentinel tells us the assignment was rejected and the fallback should be used.
const SENTINEL = '#010203'

function assign(ctx, value) {
  ctx.fillStyle = SENTINEL
  try {
    ctx.fillStyle = value
  } catch {
    /* rejected: the sentinel stands */
  }
  return String(ctx.fillStyle)
}

function toRgb(ctx, value, fallback) {
  let normalized = assign(ctx, value)
  if (normalized === SENTINEL && fallback && fallback !== value) {
    normalized = assign(ctx, fallback)
  }
  if (normalized.startsWith('#')) {
    const body = normalized.slice(1)
    const hex = body.length === 3 ? body.replace(/./g, (c) => c + c) : body.slice(0, 6)
    const n = Number.parseInt(hex, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const parts = normalized.match(/-?\d+(?:\.\d+)?/g) || []
  return [Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0]
}

export function readPalette(ctx, el) {
  const style = getComputedStyle(el)
  const token = (name, fallback) => {
    const raw = (style.getPropertyValue(name) || '').trim()
    return toRgb(ctx, raw || fallback, fallback)
  }
  return {
    board: token('--sn-board', '#212121'),
    text: token('--sn-grid', '#ececec'),
    head: token('--sn-head', '#10b981'),
    tail: token('--sn-tail', '#8b6cf7'),
    food: token('--sn-food', '#f5a524'),
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function dot(ctx, x, y, r) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2)
  ctx.fill()
}

function tracePath(ctx, pts) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
}

function drawGrid(ctx, size, cell, p) {
  ctx.strokeStyle = rgba(p.text, 0.055)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i < COLS; i += 1) {
    const x = Math.round(i * cell) + 0.5
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size)
  }
  for (let j = 1; j < ROWS; j += 1) {
    const y = Math.round(j * cell) + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(size, y)
  }
  ctx.stroke()
}

function drawFlash(ctx, game, cell, p) {
  if (!(game.eatFlash > 0) || !game.flashAt) return
  const grown = 1 - game.eatFlash
  const x = (game.flashAt.x + 0.5) * cell
  const y = (game.flashAt.y + 0.5) * cell
  ctx.strokeStyle = rgba(p.food, game.eatFlash * 0.65)
  ctx.lineWidth = Math.max(1, cell * 0.11 * game.eatFlash)
  ctx.beginPath()
  ctx.arc(x, y, cell * (0.3 + 0.85 * grown), 0, Math.PI * 2)
  ctx.stroke()
}

function drawFood(ctx, game, cell, p, now, reduced) {
  if (!game.food) return
  const x = (game.food.x + 0.5) * cell
  const y = (game.food.y + 0.5) * cell
  const pulse = reduced ? 1 : 1 + 0.1 * Math.sin(now / 170)
  const r = cell * 0.3 * pulse

  const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, cell * 1.15)
  halo.addColorStop(0, rgba(p.food, 0.38))
  halo.addColorStop(1, rgba(p.food, 0))
  ctx.fillStyle = halo
  ctx.fillRect(x - cell * 1.2, y - cell * 1.2, cell * 2.4, cell * 2.4)

  ctx.fillStyle = rgb(p.food)
  dot(ctx, x, y, r)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  dot(ctx, x - r * 0.3, y - r * 0.34, r * 0.28)
}

function drawSnake(ctx, game, cell, p, t, reduced) {
  const pts = game.snake.map((c) => ({ x: (c.x + 0.5) * cell, y: (c.y + 0.5) * cell }))
  const dir = pendingDir(game)
  // Between moves the snake glides: the head reaches ahead by the fraction of
  // the tick already elapsed and the tail retracts by the same amount, so a
  // 7-moves-per-second grid game reads as continuous motion.
  const frac = game.dead || game.won ? 0 : Math.max(0, Math.min(1, t))
  const head = game.snake[0]
  const nx = head.x + dir.x
  const ny = head.y + dir.y
  const inside = nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS
  const willEat = !!game.food && nx === game.food.x && ny === game.food.y

  if (inside && frac > 0) {
    pts.unshift({ x: pts[0].x + dir.x * frac * cell, y: pts[0].y + dir.y * frac * cell })
  }
  if (!willEat && frac > 0 && pts.length > 2) {
    const tail = pts[pts.length - 1]
    const prev = pts[pts.length - 2]
    pts[pts.length - 1] = {
      x: tail.x + (prev.x - tail.x) * frac,
      y: tail.y + (prev.y - tail.y) * frac,
    }
  }

  const width = cell * 0.76
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (!reduced) {
    ctx.save()
    ctx.shadowColor = rgba(mix(p.head, p.tail, 0.35), 0.75)
    ctx.shadowBlur = cell * 0.95
    ctx.strokeStyle = rgba(mix(p.head, p.tail, 0.35), 0.85)
    ctx.lineWidth = width
    tracePath(ctx, pts)
    ctx.stroke()
    ctx.restore()
  }

  // Tail first so the head paints on top; each segment carries its own colour,
  // giving a true head-to-tail gradient along the body rather than across the
  // bounding box.
  const span = Math.max(1, pts.length - 1)
  ctx.lineWidth = width
  for (let i = pts.length - 1; i >= 1; i -= 1) {
    ctx.strokeStyle = rgb(mix(p.head, p.tail, (i - 1) / span))
    ctx.beginPath()
    ctx.moveTo(pts[i].x, pts[i].y)
    ctx.lineTo(pts[i - 1].x, pts[i - 1].y)
    ctx.stroke()
  }

  const px = -dir.y
  const py = dir.x
  const off = cell * 0.165
  const fwd = cell * 0.07
  ctx.fillStyle = 'rgba(6,18,15,0.82)'
  dot(ctx, pts[0].x + px * off + dir.x * fwd, pts[0].y + py * off + dir.y * fwd, cell * 0.075)
  dot(ctx, pts[0].x - px * off + dir.x * fwd, pts[0].y - py * off + dir.y * fwd, cell * 0.075)
}

export function draw(ctx, game, view, p, opts) {
  const { size, cell } = view
  const { t = 0, now = 0, reduced = false } = opts || {}

  ctx.clearRect(0, 0, size, size)
  roundRect(ctx, 0, 0, size, size, BOARD_RADIUS)
  ctx.fillStyle = rgb(p.board)
  ctx.fill()

  ctx.save()
  roundRect(ctx, 0, 0, size, size, BOARD_RADIUS)
  ctx.clip()

  const glow = ctx.createRadialGradient(size / 2, size * 0.4, 0, size / 2, size * 0.4, size * 0.8)
  glow.addColorStop(0, rgba(p.tail, 0.11))
  glow.addColorStop(1, rgba(p.tail, 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  drawGrid(ctx, size, cell, p)
  drawFlash(ctx, game, cell, p)
  drawFood(ctx, game, cell, p, now, reduced)
  drawSnake(ctx, game, cell, p, t, reduced)
  ctx.restore()
}
