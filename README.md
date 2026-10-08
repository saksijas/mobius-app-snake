# Snake

The grid classic, built as a [Möbius](https://github.com/mobius-os/mobius)
mini-app. A 19×19 board, a snake that glides instead of stuttering between
cells, and a best score that survives a reload.

## Install

In Möbius, open the **App Store**, choose **Install from URL**, and paste this
app's manifest:

```
https://raw.githubusercontent.com/<owner>/<repo>/main/mobius.json
```

The Store previews the manifest and asks you to confirm before installing.
Snake requests no permissions and stores nothing but your best score.

## Playing

- **Steer** with the arrow keys, `WASD`, a swipe across the board, or the
  on-screen pad that appears on touch and narrow screens.
- **Space** starts, pauses, and resumes. **R** restarts. Tapping the board does
  the same as Space.
- Each dot eaten adds a segment and shortens the move interval, from 152 ms down
  to a floor of 66 ms.
- Walls and your own body end the run. The tail cell vacates on the same move,
  so following your own tail is legal.
- Play, Resume, and the first steer each give you a 450 ms beat before the snake
  moves, so you are never already racing a wall you have not found yet.
- Switching away from the app pauses an active run rather than losing it.

## How it is put together

- `game.js` — the rules on their own: board size, turn queue, collision, growth,
  speed curve. No DOM, no React, no dependencies.
- `render.js` — canvas painting. Reads its colours from the app's `--sn-*`
  custom properties, so switching the Möbius theme repaints the board instead of
  fighting a hard-coded palette.
- `index.jsx` — layout, input, the animation loop, and the stored best score.

Motion between moves is interpolated: the head reaches into the next cell by the
fraction of the move already elapsed and the tail retracts by the same amount,
unless the next move eats. `prefers-reduced-motion` drops the glow and the food
pulse.

## Tests

The rules are pure and dependency-free, so they run under plain Node:

```
node --test tests/*.mjs
```

15 tests cover growth, the speed floor, wall and self collision, the
tail-vacating rule and its growing counterpart, turn-queue bounds and reversal
rejection, and the full-board win condition.

## Licence

MIT — see [LICENSE](LICENSE).
