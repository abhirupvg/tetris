// Tetris game logic - pure game state, no rendering

const COLS = 10;
const ROWS = 20;

const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const PIECE_COLORS = {
  I: 0x00e5ff,
  O: 0xffd600,
  T: 0xaa00ff,
  S: 0x00e676,
  Z: 0xff1744,
  J: 0x2962ff,
  L: 0xff6d00,
};

export const PIECE_SHAPES = {
  I: [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0],
  ],
  O: [
    [1,1],
    [1,1],
  ],
  T: [
    [0,1,0],
    [1,1,1],
    [0,0,0],
  ],
  S: [
    [0,1,1],
    [1,1,0],
    [0,0,0],
  ],
  Z: [
    [1,1,0],
    [0,1,1],
    [0,0,0],
  ],
  J: [
    [1,0,0],
    [1,1,1],
    [0,0,0],
  ],
  L: [
    [0,0,1],
    [1,1,1],
    [0,0,0],
  ],
};

// SRS wall kick data
// Kicks are [dx, dy] where dx = horizontal (positive=right), dy = vertical (positive=up)
// In our board system, row 0 = top, so "up" means decreasing row → rowOffset = -dy
const WALL_KICKS_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};

const WALL_KICKS_I = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

function rotateMatrix(matrix, clockwise) {
  const n = matrix.length;
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(new Array(n).fill(0));
  }
  if (clockwise) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        result[c][n - 1 - r] = matrix[r][c];
      }
    }
  } else {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        result[n - 1 - c][r] = matrix[r][c];
      }
    }
  }
  return result;
}

function getSpawnX(type) {
  if (type === 'O') return 4;
  return 3;
}

export class TetrisGame {
  constructor() {
    this.cols = COLS;
    this.rows = ROWS;
    this.reset();
  }

  reset() {
    this.board = [];
    for (let r = 0; r < ROWS; r++) {
      this.board.push(new Array(COLS).fill(null));
    }
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.bag = [];
    this.nextQueue = [];
    this.holdPiece = null;
    this.canHold = true;
    this.currentPiece = null;
    this.gameOver = false;
    this.paused = false;
    this.lockDelay = 0;
    this.maxLockDelay = 500;
    this.fillQueue();
    this.spawnPiece();
  }

  fillQueue() {
    while (this.nextQueue.length < 7) {
      if (this.bag.length === 0) {
        this.bag = [...PIECE_TYPES];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.nextQueue.push(this.bag.shift());
    }
  }

  spawnPiece(type) {
    if (!type) {
      type = this.nextQueue.shift();
      this.fillQueue();
    }
    const shape = PIECE_SHAPES[type].map(row => [...row]);
    this.currentPiece = {
      type,
      shape,
      rotation: 0,
      x: getSpawnX(type),
      y: 0,
      lockResets: 0,
    };
    this.canHold = true;
    this.lockDelay = 0;

    if (this.checkCollision(this.currentPiece, 0, 0)) {
      this.gameOver = true;
    }
  }

  getPieceCells(piece) {
    const cells = [];
    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          cells.push({
            x: piece.x + c,
            y: piece.y + r,
          });
        }
      }
    }
    return cells;
  }

  checkCollision(piece, dx, dy, shape) {
    const s = shape || piece.shape;
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const nx = piece.x + c + dx;
        const ny = piece.y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny < 0) continue;
        if (this.board[ny][nx] !== null) return true;
      }
    }
    return false;
  }

  move(dx, dy) {
    if (!this.currentPiece || this.gameOver || this.paused) return false;
    if (!this.checkCollision(this.currentPiece, dx, dy)) {
      this.currentPiece.x += dx;
      this.currentPiece.y += dy;
      if (dy === 0) {
        this.lockDelay = 0;
      }
      return true;
    }
    return false;
  }

  rotate(clockwise) {
    if (!this.currentPiece || this.gameOver || this.paused) return false;
    const piece = this.currentPiece;
    if (piece.type === 'O') return false;

    const newShape = rotateMatrix(piece.shape, clockwise);
    const newRotation = clockwise
      ? (piece.rotation + 1) % 4
      : (piece.rotation + 3) % 4;

    const kickKey = `${piece.rotation}>${newRotation}`;
    const kickTable = piece.type === 'I' ? WALL_KICKS_I : WALL_KICKS_JLSTZ;
    const kicks = kickTable[kickKey] || [[0, 0]];

    for (const [kx, ky] of kicks) {
      const dx = kx;
      const dy = -ky;
      if (!this.checkCollision(piece, dx, dy, newShape)) {
        piece.shape = newShape;
        piece.rotation = newRotation;
        piece.x += dx;
        piece.y += dy;
        this.lockDelay = 0;
        return true;
      }
    }
    return false;
  }

  softDrop() {
    if (!this.currentPiece || this.gameOver || this.paused) return false;
    if (!this.checkCollision(this.currentPiece, 0, 1)) {
      this.currentPiece.y += 1;
      this.score += 1;
      return true;
    }
    return false;
  }

  hardDrop() {
    if (!this.currentPiece || this.gameOver || this.paused) return 0;
    let dropDistance = 0;
    while (!this.checkCollision(this.currentPiece, 0, 1)) {
      this.currentPiece.y += 1;
      dropDistance++;
    }
    this.score += dropDistance * 2;
    return dropDistance;
  }

  hold() {
    if (!this.currentPiece || this.gameOver || this.paused || !this.canHold) return false;
    const currentType = this.currentPiece.type;
    if (this.holdPiece) {
      const heldType = this.holdPiece;
      this.holdPiece = currentType;
      this.spawnPiece(heldType);
    } else {
      this.holdPiece = currentType;
      this.spawnPiece();
    }
    this.canHold = false;
    return true;
  }

  getGhostY() {
    if (!this.currentPiece) return 0;
    let dy = 0;
    while (!this.checkCollision(this.currentPiece, 0, dy + 1)) {
      dy++;
    }
    return this.currentPiece.y + dy;
  }

  lockPiece() {
    if (!this.currentPiece) return null;
    const cells = this.getPieceCells(this.currentPiece);
    const color = PIECE_COLORS[this.currentPiece.type];
    const pieceType = this.currentPiece.type;

    for (const cell of cells) {
      if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
        this.board[cell.y][cell.x] = color;
      }
    }

    const result = this.clearLines();
    this.spawnPiece();
    return { clearedRows: result.cleared, rowColors: result.rowColors, pieceCells: cells, pieceType };
  }

  clearLines() {
    const cleared = [];
    const rowColors = {};

    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(cell => cell !== null)) {
        cleared.push(r);
        rowColors[r] = [...this.board[r]];
      }
    }

    if (cleared.length > 0) {
      for (const r of cleared) {
        this.board.splice(r, 1);
        this.board.unshift(new Array(COLS).fill(null));
      }

      const lineScores = [0, 100, 300, 500, 800];
      this.score += lineScores[cleared.length] * this.level;

      this.combo++;
      if (this.combo > 0) {
        this.score += 50 * this.combo * this.level;
      }

      this.lines += cleared.length;
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
      }
    } else {
      this.combo = -1;
    }

    return { cleared, rowColors };
  }

  getDropInterval() {
    const speed = Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1);
    return Math.max(50, speed * 1000);
  }

  shouldLock(dt) {
    if (!this.currentPiece || this.gameOver || this.paused) return false;
    if (this.checkCollision(this.currentPiece, 0, 1)) {
      this.lockDelay += dt;
      if (this.lockDelay >= this.maxLockDelay) {
        return true;
      }
    } else {
      this.lockDelay = 0;
    }
    return false;
  }

  getNextPieces(count) {
    return this.nextQueue.slice(0, count);
  }
}
