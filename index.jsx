import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Keyboard,
  Pause,
  Play,
  Reload,
} from '@openai/apps-sdk-ui/components/Icon'
import { COLS, DIRS, createGame, isOver, queueDir, step } from './game.js'
import { BOARD_RADIUS, draw, readPalette } from './render.js'

const STORE_KEY = 'state.json'

// A beat of stillness after Play/Resume. Without it the snake is already
// crossing the board before you have found it, and the wall is ~1.3s away.
const GRACE_MS = 450

const CSS = `
  * { box-sizing: border-box; }

  .sn-root {
    --sn-board: var(--surface-2, #212121);
    --sn-grid: var(--text, #ececec);
    --sn-head: var(--green, #10b981);
    --sn-tail: var(--accent, #8b6cf7);
    --sn-food: #f5a524;
    min-height: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    padding: 16px;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    -webkit-tap-highlight-color: transparent;
  }

  /* The board is square, so an uncapped pane makes it absurdly large and
     strands the header and controls at opposite edges. */
  .sn-shell {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 720px;
    min-height: 0;
  }

  .sn-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sn-brand { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sn-brand-name {
    font-size: 12px; font-weight: 650; letter-spacing: .16em;
    text-transform: uppercase; color: var(--muted);
  }
  .sn-brand-note {
    font-size: 12.5px; color: var(--muted); opacity: .85;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .sn-stats { display: flex; gap: 8px; flex: 0 0 auto; }
  .sn-stat {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 5px 13px 7px; min-width: 78px; text-align: right;
    transition: border-color .2s ease;
  }
  .sn-stat-k {
    font-size: 9.5px; font-weight: 600; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted);
  }
  .sn-stat-v {
    font-size: 22px; font-weight: 680; line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }
  .sn-stat.is-new { border-color: var(--accent); }
  .sn-stat.is-new .sn-stat-v { color: var(--accent); }

  .sn-stage { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .sn-board {
    position: relative;
    border-radius: ${BOARD_RADIUS}px;
    touch-action: none;
    outline: none;
    box-shadow: 0 18px 44px -26px rgba(0, 0, 0, .7);
  }
  .sn-board:focus-visible {
    box-shadow: 0 0 0 1px var(--accent), 0 0 0 5px var(--accent-dim),
                0 18px 44px -26px rgba(0, 0, 0, .7);
  }
  .sn-canvas { display: block; border-radius: inherit; }

  .sn-overlay {
    position: absolute; inset: 0; border-radius: inherit;
    display: flex; align-items: center; justify-content: center; padding: 18px;
    background: color-mix(in srgb, var(--bg) 42%, transparent);
    animation: sn-fade .22s ease both;
  }
  .sn-card {
    display: flex; flex-direction: column; align-items: center; gap: 9px;
    padding: 22px 26px; border-radius: 16px; text-align: center;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border: 1px solid var(--border);
    box-shadow: 0 26px 60px -26px rgba(0, 0, 0, .8);
    backdrop-filter: blur(12px);
  }
  .sn-overlay-badge {
    font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: var(--accent-fg); background: var(--accent);
    padding: 4px 10px; border-radius: 999px;
  }
  .sn-overlay h2 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -.01em; }
  .sn-overlay p { margin: 0; max-width: 28ch; font-size: 13px; line-height: 1.55; color: var(--muted); }
  .sn-overlay-cue { font-size: 12px; color: var(--muted); opacity: .8; }

  @keyframes sn-fade { from { opacity: 0 } to { opacity: 1 } }

  .sn-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sn-actions { display: flex; gap: 8px; }
  .sn-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-height: 44px; min-width: 44px; padding: 0 17px;
    border: 1px solid var(--border); border-radius: 12px;
    background: var(--surface); color: var(--text);
    font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    transition: background .15s ease, border-color .15s ease, transform .1s ease;
  }
  .sn-btn:hover { background: var(--surface-2); }
  .sn-btn:active { transform: translateY(1px); }
  .sn-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .sn-btn.is-primary {
    background: var(--accent); border-color: transparent; color: var(--accent-fg);
  }
  .sn-btn.is-primary:hover { background: var(--accent-hover, var(--accent)); }

  .sn-hint { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted); }
  .sn-hint kbd {
    font: inherit; font-size: 11px; font-weight: 600;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 5px; padding: 1px 5px;
  }

  .sn-pad { display: none; }
  .sn-pad-btn {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 50px; min-width: 50px;
    border: 1px solid var(--border); border-radius: 13px;
    background: var(--surface); color: var(--text); cursor: pointer;
    transition: background .12s ease, transform .1s ease;
  }
  .sn-pad-btn:active { background: var(--accent-dim); transform: scale(.95); }
  .sn-pad-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  @media (pointer: coarse), (max-width: 620px) {
    .sn-root { padding: 12px; gap: 10px; }
    .sn-hint { display: none; }
    .sn-pad {
      display: grid; justify-content: center;
      grid-template-columns: repeat(3, 1fr); gap: 8px;
      max-width: 230px; margin: 0 auto;
    }
    .sn-pad > span { pointer-events: none; }
    .sn-controls { justify-content: center; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sn-overlay { animation: none; }
    .sn-btn, .sn-pad-btn { transition: none; }
    .sn-btn:active, .sn-pad-btn:active { transform: none; }
  }
`

const OVERLAY_COPY = {
  idle: {
    title: 'Snake',
    body: 'Eat the glowing dot to grow longer and faster. Clip a wall or your own body and the run is over.',
    cue: 'Tap the board or press Space to start',
  },
  paused: {
    title: 'Paused',
    body: 'Your run is held exactly where it was.',
    cue: 'Tap the board or press Space to resume',
  },
  over: { title: 'Game over', cue: 'Tap the board or press Space to try again' },
  won: {
    title: 'Perfect run',
    body: 'The snake fills every square on the board. There is nothing left to eat.',
    cue: 'Tap the board or press Space to go again',
  },
}

export default function Snake() {
  const [phase, setPhase] = useState('idle') // idle | playing | paused | over | won
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [freshBest, setFreshBest] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const stageRef = useRef(null)
  const boardRef = useRef(null)
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const viewRef = useRef(null)
  const paletteRef = useRef(null)
  const phaseRef = useRef('idle')
  const scoreRef = useRef(0)
  const bestRef = useRef(0)
  const reducedRef = useRef(false)
  const pointerRef = useRef(null)

  if (!gameRef.current) gameRef.current = createGame()

  const go = useCallback((next) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const focusBoard = useCallback(() => {
    try {
      boardRef.current?.focus({ preventScroll: true })
    } catch {
      boardRef.current?.focus()
    }
  }, [])

  /* ---------- best score ---------- */

  useEffect(() => {
    let alive = true
    const store = window.mobius?.storage
    if (!store) {
      setSaveFailed(true)
      return undefined
    }
    store
      .get(STORE_KEY)
      .then((saved) => {
        if (!alive) return
        const value = Number(saved?.best)
        if (Number.isFinite(value) && value > 0) {
          bestRef.current = value
          setBest(value)
        }
      })
      .catch(() => {
        if (alive) setSaveFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const saveBest = useCallback((value) => {
    const store = window.mobius?.storage
    if (!store) {
      setSaveFailed(true)
      return
    }
    store.set(STORE_KEY, { best: value }).catch(() => setSaveFailed(true))
  }, [])

  /* ---------- sizing ---------- */

  useEffect(() => {
    const stage = stageRef.current
    const board = boardRef.current
    const canvas = canvasRef.current
    if (!stage || !board || !canvas) return undefined

    const resize = () => {
      const rect = stage.getBoundingClientRect()
      const size = Math.max(140, Math.floor(Math.min(rect.width, rect.height)))
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      board.style.width = `${size}px`
      board.style.height = `${size}px`
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      viewRef.current = { ctx, size, cell: size / COLS }
      paletteRef.current = readPalette(ctx, board)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(stage)
    // A theme switch rewrites custom properties on the document element, so the
    // cached canvas palette has to be re-read rather than held for the session.
    const themeWatch = new MutationObserver(() => {
      const view = viewRef.current
      if (view) paletteRef.current = readPalette(view.ctx, board)
    })
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
    return () => {
      observer.disconnect()
      themeWatch.disconnect()
    }
  }, [])

  /* ---------- reduced motion ---------- */

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      reducedRef.current = query.matches
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  /* ---------- the loop ---------- */

  const endRound = useCallback(
    (game) => {
      go(game.won ? 'won' : 'over')
      if (game.score > bestRef.current) {
        bestRef.current = game.score
        setBest(game.score)
        setFreshBest(true)
        saveBest(game.score)
      } else {
        setFreshBest(false)
      }
    },
    [go, saveBest],
  )

  useEffect(() => {
    let raf = 0
    let last = 0

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const game = gameRef.current
      const view = viewRef.current
      const palette = paletteRef.current
      if (!game || !view || !palette) return

      const dt = last ? Math.min(now - last, 120) : 16
      last = now

      if (phaseRef.current === 'playing') {
        game.acc += dt
        let guard = 0
        while (game.acc >= game.interval && !isOver(game) && guard < 8) {
          game.acc -= game.interval
          guard += 1
          step(game)
        }
        if (isOver(game)) {
          game.acc = 0
          endRound(game)
        }
        if (game.score !== scoreRef.current) {
          scoreRef.current = game.score
          setScore(game.score)
        }
      }

      if (game.eatFlash > 0) game.eatFlash = Math.max(0, game.eatFlash - dt / 340)

      draw(view.ctx, game, view, palette, {
        t: phaseRef.current === 'playing' ? game.acc / game.interval : 0,
        now,
        reduced: reducedRef.current,
      })
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [endRound])

  /* ---------- actions ---------- */

  const restart = useCallback(() => {
    gameRef.current = createGame()
    gameRef.current.acc = -GRACE_MS
    scoreRef.current = 0
    setScore(0)
    setFreshBest(false)
    go('playing')
    focusBoard()
  }, [focusBoard, go])

  const primary = useCallback(() => {
    const current = phaseRef.current
    if (current === 'idle') {
      gameRef.current.acc = -GRACE_MS
      go('playing')
    } else if (current === 'playing') {
      go('paused')
    } else if (current === 'paused') {
      gameRef.current.acc = -GRACE_MS
      go('playing')
    } else {
      restart()
      return
    }
    focusBoard()
  }, [focusBoard, go, restart])

  const turn = useCallback(
    (dir) => {
      const game = gameRef.current
      const current = phaseRef.current
      if (current === 'over' || current === 'won') return
      if (current === 'idle' || current === 'paused') {
        game.acc = -GRACE_MS
        go('playing')
      }
      queueDir(game, dir)
    },
    [go],
  )

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key
      const dir =
        key === 'ArrowUp' || key === 'w' || key === 'W'
          ? DIRS.up
          : key === 'ArrowDown' || key === 's' || key === 'S'
            ? DIRS.down
            : key === 'ArrowLeft' || key === 'a' || key === 'A'
              ? DIRS.left
              : key === 'ArrowRight' || key === 'd' || key === 'D'
                ? DIRS.right
                : null
      if (dir) {
        event.preventDefault()
        turn(dir)
        return
      }
      // Space and Enter belong to a focused button, not the game.
      const onButton = event.target instanceof Element && event.target.closest('button')
      if ((key === ' ' || key === 'Enter') && !onButton) {
        event.preventDefault()
        primary()
      } else if ((key === 'r' || key === 'R') && !onButton) {
        event.preventDefault()
        restart()
      }
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [primary, restart, turn])

  useEffect(() => {
    focusBoard()
  }, [focusBoard])

  // Losing the run because the owner switched panes would be unfair, so hide or
  // blur pauses an active game instead.
  useEffect(() => {
    const hold = () => {
      if (phaseRef.current === 'playing' && document.visibilityState === 'hidden') go('paused')
    }
    const blur = () => {
      if (phaseRef.current === 'playing') go('paused')
    }
    document.addEventListener('visibilitychange', hold)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('visibilitychange', hold)
      window.removeEventListener('blur', blur)
    }
  }, [go])

  /* ---------- touch: swipe to steer, tap to start/pause ---------- */

  const onPointerDown = useCallback((event) => {
    pointerRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
    focusBoard()
  }, [focusBoard])

  const onPointerUp = useCallback(
    (event) => {
      const start = pointerRef.current
      pointerRef.current = null
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) {
        primary()
        return
      }
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? DIRS.right : DIRS.left)
      else turn(dy > 0 ? DIRS.down : DIRS.up)
    },
    [primary, turn],
  )

  /* ---------- render ---------- */

  const playing = phase === 'playing'
  const finished = phase === 'over' || phase === 'won'
  const copy = OVERLAY_COPY[phase]
  const primaryLabel = playing
    ? 'Pause'
    : phase === 'paused'
      ? 'Resume'
      : finished
        ? 'Play again'
        : 'Play'
  const PrimaryIcon = playing ? Pause : finished ? Reload : Play

  return (
    <div className="sn-root">
      <style>{CSS}</style>
      <div className="sn-shell">

      <div className="sn-top">
        <div className="sn-brand">
          <span className="sn-brand-name">Snake</span>
          <span className="sn-brand-note">
            {saveFailed
              ? "Best score won't be saved this session"
              : playing
                ? 'Eat the dot. Avoid the walls.'
                : 'Classic grid, modern glow'}
          </span>
        </div>
        <div className="sn-stats">
          <div className="sn-stat">
            <div className="sn-stat-k">Score</div>
            <div className="sn-stat-v">{score}</div>
          </div>
          <div className={`sn-stat${freshBest ? ' is-new' : ''}`}>
            <div className="sn-stat-k">{freshBest ? 'New best' : 'Best'}</div>
            <div className="sn-stat-v">{best}</div>
          </div>
        </div>
      </div>

      <div className="sn-stage" ref={stageRef}>
        <div
          className="sn-board"
          ref={boardRef}
          tabIndex={0}
          role="application"
          aria-label="Snake board. Use the arrow keys or swipe to steer."
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pointerRef.current = null
          }}
        >
          <canvas className="sn-canvas" ref={canvasRef} />
          {copy ? (
            <div className="sn-overlay">
              <div className="sn-card">
                {freshBest && finished ? <span className="sn-overlay-badge">New best</span> : null}
                <h2>{copy.title}</h2>
                <p>
                  {phase === 'over'
                    ? `You scored ${score}${score >= best ? '.' : `, with ${best} to beat.`}`
                    : copy.body}
                </p>
                <span className="sn-overlay-cue">{copy.cue}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="sn-controls">
        <div className="sn-actions">
          <button type="button" className="sn-btn is-primary" onClick={primary}>
            <PrimaryIcon width={17} height={17} aria-hidden="true" />
            {primaryLabel}
          </button>
          {phase === 'playing' || phase === 'paused' ? (
            <button type="button" className="sn-btn" onClick={restart} aria-label="Restart run">
              <Reload width={17} height={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="sn-hint">
          <Keyboard width={15} height={15} aria-hidden="true" />
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or WASD · <kbd>Space</kbd> pause ·{' '}
            <kbd>R</kbd> restart
          </span>
        </div>
      </div>

      <div className="sn-pad">
        <span />
        <button
          type="button"
          className="sn-pad-btn"
          onClick={() => turn(DIRS.up)}
          aria-label="Steer up"
        >
          <ArrowUp width={20} height={20} aria-hidden="true" />
        </button>
        <span />
        <button
          type="button"
          className="sn-pad-btn"
          onClick={() => turn(DIRS.left)}
          aria-label="Steer left"
        >
          <ArrowLeft width={20} height={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sn-pad-btn"
          onClick={() => turn(DIRS.down)}
          aria-label="Steer down"
        >
          <ArrowDown width={20} height={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sn-pad-btn"
          onClick={() => turn(DIRS.right)}
          aria-label="Steer right"
        >
          <ArrowRight width={20} height={20} aria-hidden="true" />
        </button>
      </div>

      </div>
    </div>
  )
}
