// Input: keyboard state, accumulated mouse deltas, button edges, pointer lock.
// The player module consumes edges; nothing else reads them.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.mouseDown = false;
    this.mouseDownEdge = false;
    this.rDown = false;
    this.wheelDir = 0;
    this.locked = false;
    this.onLockChange = null;
    this.onClickWhileUnlocked = null;
  }

  attach(canvas) {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    });
    document.addEventListener('mousedown', (e) => {
      // Clicks on HUD buttons must not re-lock the pointer; only canvas clicks do.
      if (!this.locked) { if (e.target === canvas && this.onClickWhileUnlocked) this.onClickWhileUnlocked(); return; }
      if (e.button === 0) { this.mouseDown = true; this.mouseDownEdge = true; }
      if (e.button === 2) this.rDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rDown = false;
    });
    document.addEventListener('wheel', (e) => {
      if (this.locked) this.wheelDir = e.deltaY > 0 ? 1 : -1;
    }, { passive: true });
    document.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
      if (!this.locked) { this.mouseDown = false; this.rDown = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rDown = false;
    });
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  /** Consume all edge presses. Called by the player update each sim step. */
  consumeEdges() {
    this.pressed.clear();
    this.mouseDownEdge = false;
    this.wheelDir = 0;
  }

  /** Drop stale edges when the sim is not consuming them (menu, dead, paused). */
  discard() {
    this.pressed.clear();
    this.mouseDownEdge = false;
    this.wheelDir = 0;
    this.dx = 0;
    this.dy = 0;
  }
}
