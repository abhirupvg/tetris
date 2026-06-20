import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { TetrisGame, PIECE_COLORS, PIECE_SHAPES } from './tetris.js';
import { AudioManager } from './audio.js';

// ─── Constants ───────────────────────────────────────────────
const BLOCK_SIZE = 1.0;
const BOARD_COLS = 10;
const BOARD_ROWS = 20;
const BOARD_OFFSET_X = -BOARD_COLS / 2;
const BOARD_OFFSET_Y = 0;

const PREVIEW_SHAPES = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]],
};

// ─── State ───────────────────────────────────────────────────
let scene, camera, renderer, composer, bloomPass;
let game, audio;
let gameState = 'loading';
let lastTime = 0;
let dropTimer = 0;

let boardBlockMeshes = {};
let currentPieceMeshes = [];
let ghostPieceMeshes = [];
let particles = [];
let animations = [];
let ambientStars = [];

let dasDir = 0;
let dasTimer = 0;
const DAS_DELAY = 170;
const DAS_REPEAT = 50;
let softDropTimer = 0;
const SOFT_DROP_REPEAT = 50;
let softDropHeld = false;

let renderedPieceX = 0;
let renderedPieceY = 0;

const blockGeometry = new RoundedBoxGeometry(0.92, 0.92, 0.92, 3, 0.08);
const ghostGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 0.92, 0.92));
const materialCache = {};

// ─── Materials ───────────────────────────────────────────────
function getMaterial(color) {
  if (!materialCache[color]) {
    materialCache[color] = new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: 0.3,
      roughness: 0.15,
      clearcoat: 0.7,
      clearcoatRoughness: 0.1,
      emissive: color,
      emissiveIntensity: 0.12,
      envMapIntensity: 1.0,
    });
  }
  return materialCache[color];
}

function getGhostMaterial(color) {
  const key = `ghost_${color}`;
  if (!materialCache[key]) {
    materialCache[key] = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.35,
    });
  }
  return materialCache[key];
}

// ─── Three.js Setup ──────────────────────────────────────────
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080810);
  scene.fog = new THREE.FogExp2(0x080810, 0.025);

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 12, 19.5);
  camera.lookAt(0, 8.7, 0);

  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Lights
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(8, 25, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 25;
  keyLight.shadow.camera.bottom = -5;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x4466ff, 0.4);
  fillLight.position.set(-10, 12, 5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xff4488, 0.3);
  rimLight.position.set(0, 8, -15);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0x222233, 0.5);
  scene.add(ambient);

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55,
    0.4,
    0.82
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Load HDRI
  loadEnvironment();

  // Build board frame
  buildBoardFrame();

  // Ambient stars
  buildAmbientStars();

  // Current piece meshes
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(blockGeometry, getMaterial(0xffffff));
    mesh.visible = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    currentPieceMeshes.push(mesh);
  }

  // Ghost piece meshes
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.LineSegments(
      ghostGeometry,
      getGhostMaterial(0xffffff)
    );
    mesh.visible = false;
    scene.add(mesh);
    ghostPieceMeshes.push(mesh);
  }

  window.addEventListener('resize', onResize);
}

function loadEnvironment() {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const loader = new RGBELoader();
  loader.load(
    'assets/hdri/studio_small_09_1k.hdr',
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      texture.dispose();
      pmremGenerator.dispose();
    },
    undefined,
    (err) => {
      console.warn('HDRI load failed, using lights only', err);
      pmremGenerator.dispose();
    }
  );
}

function buildBoardFrame() {
  const wallMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a2e,
    metalness: 0.4,
    roughness: 0.3,
    transparent: true,
    opacity: 0.4,
    emissive: 0x0a0a1a,
    emissiveIntensity: 0.3,
    envMapIntensity: 0.8,
  });

  // Left wall
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, BOARD_ROWS + 0.3, 0.5),
    wallMat
  );
  leftWall.position.set(BOARD_OFFSET_X - 0.075, BOARD_ROWS / 2, -0.25);
  scene.add(leftWall);

  // Right wall
  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, BOARD_ROWS + 0.3, 0.5),
    wallMat
  );
  rightWall.position.set(BOARD_OFFSET_X + BOARD_COLS + 0.075, BOARD_ROWS / 2, -0.25);
  scene.add(rightWall);

  // Floor
  const floorGeo = new THREE.BoxGeometry(BOARD_COLS + 0.3, 0.15, 0.5);
  const floor = new THREE.Mesh(floorGeo, wallMat);
  floor.position.set(BOARD_OFFSET_X + BOARD_COLS / 2 - 0.5, -0.075, -0.25);
  floor.receiveShadow = true;
  scene.add(floor);

  // Back panel
  const backPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_COLS + 2, BOARD_ROWS + 2),
    new THREE.MeshStandardMaterial({
      color: 0x0d0d1a,
      roughness: 0.9,
      metalness: 0.1,
    })
  );
  backPanel.position.set(BOARD_OFFSET_X + BOARD_COLS / 2 - 0.5, BOARD_ROWS / 2 - 0.5, -0.6);
  backPanel.receiveShadow = true;
  scene.add(backPanel);

  // Ground plane for shadows
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({
      color: 0x050508,
      roughness: 0.6,
      metalness: 0.2,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Subtle grid lines on the board
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x222244,
    transparent: true,
    opacity: 0.15,
  });
  const gridPoints = [];
  for (let c = 0; c <= BOARD_COLS; c++) {
    gridPoints.push(c + BOARD_OFFSET_X, 0, -0.55);
    gridPoints.push(c + BOARD_OFFSET_X, BOARD_ROWS, -0.55);
  }
  for (let r = 0; r <= BOARD_ROWS; r++) {
    gridPoints.push(BOARD_OFFSET_X, r, -0.55);
    gridPoints.push(BOARD_OFFSET_X + BOARD_COLS, r, -0.55);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  scene.add(new THREE.LineSegments(gridGeo, gridMat));
}

function buildAmbientStars() {
  const starCount = 200;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 80;
    positions[i * 3 + 1] = Math.random() * 40;
    positions[i * 3 + 2] = -10 - Math.random() * 30;
    const c = 0.3 + Math.random() * 0.4;
    colors[i * 3] = c * 0.6;
    colors[i * 3 + 1] = c * 0.7;
    colors[i * 3 + 2] = c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
  ambientStars.push(stars);
}

// ─── Coordinate conversion ───────────────────────────────────
function boardToWorld(col, row) {
  return {
    x: col + BOARD_OFFSET_X + 0.5,
    y: BOARD_ROWS - 1 - row + BOARD_OFFSET_Y + 0.5,
    z: 0,
  };
}

// ─── Block rendering ─────────────────────────────────────────
function updateCurrentPiece() {
  if (!game.currentPiece || gameState !== 'playing') {
    currentPieceMeshes.forEach(m => (m.visible = false));
    return;
  }

  const piece = game.currentPiece;
  const color = PIECE_COLORS[piece.type];
  const mat = getMaterial(color);
  const cells = game.getPieceCells(piece);

  // Smooth interpolation
  renderedPieceX += (piece.x - renderedPieceX) * 0.4;
  renderedPieceY += (piece.y - renderedPieceY) * 0.4;

  for (let i = 0; i < 4; i++) {
    const mesh = currentPieceMeshes[i];
    if (i < cells.length) {
      const cell = cells[i];
      // Use rendered position for smooth movement
      const dx = renderedPieceX - piece.x;
      const dy = renderedPieceY - piece.y;
      const pos = boardToWorld(cell.x + dx, cell.y + dy);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.material = mat;
      mesh.visible = true;
    } else {
      mesh.visible = false;
    }
  }
}

function updateGhostPiece() {
  if (!game.currentPiece || gameState !== 'playing') {
    ghostPieceMeshes.forEach(m => (m.visible = false));
    return;
  }

  const piece = game.currentPiece;
  const ghostY = game.getGhostY();
  const color = PIECE_COLORS[piece.type];
  const mat = getGhostMaterial(color);
  const cells = game.getPieceCells(piece);

  for (let i = 0; i < 4; i++) {
    const mesh = ghostPieceMeshes[i];
    if (i < cells.length) {
      const cell = cells[i];
      const pos = boardToWorld(cell.x, cell.y + (ghostY - piece.y));
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.material = mat;
      mesh.visible = true;
    } else {
      mesh.visible = false;
    }
  }
}

function rebuildBoardMeshes() {
  // Remove all existing board meshes
  for (const key in boardBlockMeshes) {
    scene.remove(boardBlockMeshes[key]);
    delete boardBlockMeshes[key];
  }

  // Recreate from board state
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const color = game.board[r][c];
      if (color !== null) {
        const mesh = new THREE.Mesh(blockGeometry, getMaterial(color));
        const pos = boardToWorld(c, r);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        boardBlockMeshes[`${r},${c}`] = mesh;
      }
    }
  }
}

// ─── Line clear effects ──────────────────────────────────────
function handleLineClear(clearedRows, rowColors) {
  if (clearedRows.length === 0) return;

  // Spawn particles for each cleared row using captured colors
  for (const row of clearedRows) {
    const colors = rowColors[row] || [];
    for (let col = 0; col < BOARD_COLS; col++) {
      const color = colors[col] || 0xffffff;
      const pos = boardToWorld(col, row);
      spawnParticles(pos.x, pos.y, pos.z, color, 8);
    }
  }

  // Rebuild board meshes (lines already cleared in game state)
  rebuildBoardMeshes();

  // Flash effect via bloom
  flashBloom(clearedRows.length);

  // Show line clear text
  showLineClearText(clearedRows.length);
}

function flashBloom(intensity) {
  const original = bloomPass.strength;
  bloomPass.strength = original + intensity * 0.4;
  animations.push({
    duration: 400,
    elapsed: 0,
    update: (t) => {
      bloomPass.strength = original + (1 - t) * intensity * 0.4;
    },
    onComplete: () => {
      bloomPass.strength = original;
    },
  });
}

function showLineClearText(count) {
  const el = document.getElementById('line-clear-text');
  const texts = ['', 'Single', 'Double', 'Triple', 'Tetris!'];
  el.textContent = texts[count] || '';
  if (count >= 1) {
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
}

// ─── Particles ───────────────────────────────────────────────
function spawnParticles(x, y, z, color, count) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.06 + Math.random() * 0.04, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1,
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.set(x, y, z);
    p.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      Math.random() * 6 + 3,
      (Math.random() - 0.5) * 3
    );
    p.userData.lifetime = 0.8 + Math.random() * 0.4;
    p.userData.age = 0;
    particles.push(p);
    scene.add(p);
  }
}

function updateParticles(dt) {
  const dts = dt / 1000;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.age += dts;
    if (p.userData.age >= p.userData.lifetime) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.userData.velocity.y -= 18 * dts;
    p.position.x += p.userData.velocity.x * dts;
    p.position.y += p.userData.velocity.y * dts;
    p.position.z += p.userData.velocity.z * dts;
    const lifeRatio = p.userData.age / p.userData.lifetime;
    p.material.opacity = 1 - lifeRatio;
    const scale = 1 - lifeRatio * 0.6;
    p.scale.set(scale, scale, scale);
  }
}

// ─── Animations ──────────────────────────────────────────────
function updateAnimations(dt) {
  for (let i = animations.length - 1; i >= 0; i--) {
    const anim = animations[i];
    anim.elapsed += dt;
    const t = Math.min(1, anim.elapsed / anim.duration);
    anim.update(t);
    if (t >= 1) {
      if (anim.onComplete) anim.onComplete();
      animations.splice(i, 1);
    }
  }
}

function lockPieceFlash(cells, color) {
  for (const cell of cells) {
    const key = `${cell.y},${cell.x}`;
    const mesh = boardBlockMeshes[key];
    if (mesh) {
      const mat = mesh.material;
      const originalIntensity = 0.12;
      animations.push({
        duration: 350,
        elapsed: 0,
        update: (t) => {
          mat.emissiveIntensity = originalIntensity + (1 - t) * 0.6;
        },
        onComplete: () => {
          mat.emissiveIntensity = originalIntensity;
        },
      });
    }
  }
}

// ─── Camera ──────────────────────────────────────────────────
function updateCamera(time) {
  const t = time * 0.001;
  camera.position.x = Math.sin(t * 0.15) * 1.2;
  camera.position.y = 12 + Math.sin(t * 0.2) * 0.4;
  camera.position.z = 19.5 + Math.sin(t * 0.1) * 0.3;
  camera.lookAt(0, 8.7, 0);
}

// ─── Game actions ────────────────────────────────────────────
function handlePieceLock() {
  const prevLevel = game.level;
  const prevLines = game.lines;
  const pieceCells = game.getPieceCells(game.currentPiece);
  const pieceColor = PIECE_COLORS[game.currentPiece.type];

  const result = game.lockPiece();

  if (!result) return;

  if (result.clearedRows && result.clearedRows.length > 0) {
    handleLineClear(result.clearedRows, result.rowColors);
    audio.playLineClear(result.clearedRows.length);
  } else {
    // Add locked blocks to board meshes
    for (const cell of pieceCells) {
      if (cell.y >= 0 && cell.y < BOARD_ROWS && cell.x >= 0 && cell.x < BOARD_COLS) {
        const mesh = new THREE.Mesh(blockGeometry, getMaterial(pieceColor));
        const pos = boardToWorld(cell.x, cell.y);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        boardBlockMeshes[`${cell.y},${cell.x}`] = mesh;
      }
    }
    lockPieceFlash(pieceCells, pieceColor);
    audio.playLock();
  }

  // Check level up
  if (game.level > prevLevel) {
    audio.playLevelUp();
  }

  // Reset rendered piece position
  if (game.currentPiece) {
    renderedPieceX = game.currentPiece.x;
    renderedPieceY = game.currentPiece.y;
  }

  // Check game over
  if (game.gameOver) {
    handleGameOver();
  }

  updateUI();
}

function handleGameOver() {
  gameState = 'gameover';
  audio.playGameOver();
  const overlay = document.getElementById('gameover-overlay');
  document.getElementById('final-score').textContent = game.score.toLocaleString();
  document.getElementById('final-level').textContent = game.level;
  document.getElementById('final-lines').textContent = game.lines;
  overlay.classList.add('show');
}

function startGame() {
  ensureAudioLoaded().then(() => audio.startBgm());

  // Clear all meshes
  for (const key in boardBlockMeshes) {
    scene.remove(boardBlockMeshes[key]);
    delete boardBlockMeshes[key];
  }
  particles.forEach(p => scene.remove(p));
  particles = [];
  animations = [];

  game.reset();
  renderedPieceX = game.currentPiece.x;
  renderedPieceY = game.currentPiece.y;
  dropTimer = 0;
  gameState = 'playing';

  document.getElementById('start-overlay').classList.remove('show');
  document.getElementById('gameover-overlay').classList.remove('show');
  document.getElementById('pause-overlay').classList.remove('show');

  updateUI();
}

function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused';
    document.getElementById('pause-overlay').classList.add('show');
  } else if (gameState === 'paused') {
    gameState = 'playing';
    document.getElementById('pause-overlay').classList.remove('show');
  }
}

// ─── UI ──────────────────────────────────────────────────────
function updateUI() {
  document.getElementById('score').textContent = game.score.toLocaleString();
  document.getElementById('level').textContent = game.level;
  document.getElementById('lines').textContent = game.lines;

  if (game.currentPiece) {
    renderedPieceX = game.currentPiece.x;
    renderedPieceY = game.currentPiece.y;
  }

  updateNextPreview();
  updateHoldPreview();
}

function createPieceGrid(type) {
  const container = document.createElement('div');
  container.className = 'piece-preview';
  const shape = PREVIEW_SHAPES[type];
  if (!shape) return container;
  const color = '#' + PIECE_COLORS[type].toString(16).padStart(6, '0');
  for (let r = 0; r < shape.length; r++) {
    const row = document.createElement('div');
    row.className = 'preview-row';
    for (let c = 0; c < shape[r].length; c++) {
      const cell = document.createElement('div');
      cell.className = 'preview-cell';
      if (shape[r][c]) {
        cell.classList.add('filled');
        cell.style.background = color;
        cell.style.boxShadow = `0 0 6px ${color}88, inset 0 0 4px rgba(255,255,255,0.3)`;
      }
      row.appendChild(cell);
    }
    container.appendChild(row);
  }
  return container;
}

function updateNextPreview() {
  const container = document.getElementById('next-pieces');
  container.innerHTML = '';
  const next = game.getNextPieces(5);
  for (const type of next) {
    container.appendChild(createPieceGrid(type));
  }
}

function updateHoldPreview() {
  const container = document.getElementById('hold-piece');
  container.innerHTML = '';
  if (game.holdPiece) {
    const preview = createPieceGrid(game.holdPiece);
    if (!game.canHold) {
      preview.classList.add('disabled');
    }
    container.appendChild(preview);
  }
}

// ─── Input ───────────────────────────────────────────────────
function initInput() {
  document.addEventListener('keydown', (e) => {
    if (audio) audio.init();

    if (gameState === 'start' || gameState === 'gameover') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startGame();
      }
      return;
    }

    if (gameState === 'paused') {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        togglePause();
      }
      return;
    }

    if (gameState !== 'playing') return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        if (game.move(-1, 0)) audio.playMove();
        dasDir = -1;
        dasTimer = 0;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        if (game.move(1, 0)) audio.playMove();
        dasDir = 1;
        dasTimer = 0;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        if (game.softDrop()) audio.playMove();
        softDropTimer = 0;
        softDropHeld = true;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case 'x':
      case 'X':
        e.preventDefault();
        if (game.rotate(true)) audio.playRotate();
        break;
      case 'z':
      case 'Z':
        e.preventDefault();
        if (game.rotate(false)) audio.playRotate();
        break;
      case ' ':
        e.preventDefault();
        game.hardDrop();
        audio.playHardDrop();
        handlePieceLock();
        break;
      case 'c':
      case 'C':
      case 'Shift':
        e.preventDefault();
        if (game.hold()) {
          audio.playHold();
          updateUI();
        }
        break;
      case 'p':
      case 'P':
      case 'Escape':
        e.preventDefault();
        togglePause();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      if (dasDir === -1) dasDir = 0;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      if (dasDir === 1) dasDir = 0;
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      softDropHeld = false;
    }
  });
}

function updateDAS(dt) {
  if (dasDir !== 0) {
    dasTimer += dt;
    if (dasTimer >= DAS_DELAY) {
      if (game.move(dasDir, 0)) audio.playMove();
      dasTimer = DAS_DELAY - DAS_REPEAT;
    }
  }
}

// ─── Resize ──────────────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ─── Game loop ───────────────────────────────────────────────
function animate(time) {
  requestAnimationFrame(animate);

  const dt = Math.min(50, time - lastTime);
  lastTime = time;

  if (gameState === 'playing') {
    // Gravity
    dropTimer += dt;
    const dropInterval = game.getDropInterval();
    if (dropTimer >= dropInterval) {
      dropTimer = 0;
      game.move(0, 1);
    }

    // Soft drop
    if (softDropHeld) {
      softDropTimer += dt;
      if (softDropTimer >= SOFT_DROP_REPEAT) {
        softDropTimer = 0;
        if (game.softDrop()) {}
      }
    }

    // DAS
    updateDAS(dt);

    // Lock delay
    if (game.shouldLock(dt)) {
      handlePieceLock();
    }

    updateCurrentPiece();
    updateGhostPiece();
  }

  updateAnimations(dt);
  updateParticles(dt);
  updateCamera(time);

  // Animate ambient stars
  if (ambientStars.length > 0) {
    ambientStars[0].rotation.y = time * 0.00003;
  }

  composer.render();
}

// ─── Init ────────────────────────────────────────────────────
async function init() {
  game = new TetrisGame();
  audio = new AudioManager();

  initThree();
  initInput();

  // Start rendering immediately
  lastTime = performance.now();
  animate(lastTime);

  // Show start screen right away — audio loads on first interaction
  gameState = 'start';
  document.getElementById('start-overlay').classList.add('show');
  document.getElementById('loading-overlay').classList.remove('show');
}

let audioLoaded = false;
async function ensureAudioLoaded() {
  if (audioLoaded) return;
  audioLoaded = true;
  try {
    audio.init();
    await audio.loadAll();
  } catch (e) {
    console.warn('Audio initialization failed', e);
  }
}

let musicMuted = false;
function toggleMusic() {
  if (musicMuted) {
    audio.startBgm();
    musicMuted = false;
    document.getElementById('music-toggle').classList.remove('muted');
  } else {
    audio.stopBgm();
    musicMuted = true;
    document.getElementById('music-toggle').classList.add('muted');
  }
}

document.getElementById('music-toggle').addEventListener('click', () => {
  ensureAudioLoaded().then(() => toggleMusic());
});

init();
