const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;


const TILE_SIZE = 40;
const MAP_WIDTH = 10;
const MAP_HEIGHT = 15;
if (canvas) {
  canvas.width = MAP_WIDTH * TILE_SIZE;
  canvas.height = MAP_HEIGHT * TILE_SIZE;
} else {
  console.error('Canvas element not found');
}

const TOTAL_LEVELS = 12;

const COLORS = {
  background: '#1a1a1a',
  wall: '#6A1B9A',
  wallEdge: '#8E24AA',
  path: '#2E2E2E',
  coin: '#FFD600',
  player: '#BA68C8',
  finish: '#FFD600',
  uiText: '#FFFFFF',
  spike: '#FF4444'
};

const JUMP_DELAY = 300;
const SKINS_COUNT = 6;
const SKIN_PRICES = [0, 50, 100, 200, 300, 500];
const COIN_SIZE = TILE_SIZE / 8;

let gameState = {
  currentLevel: 1,
  totalCoins: 0,
  maxLevelReached: 1,
  keys: {},
  player: {
    x: 0,
    y: 0,
    width: TILE_SIZE * 0.8,
    height: TILE_SIZE * 0.8,
    lastJumpTime: 0,
    facing: 1,
    skinIndex: 0,
    isJumping: false,
    jumpTarget: {x: 0, y: 0}
  },
  mapData: [],
  coinsPositions: new Set(),
  finishPos: {x: 1, y: 1},
  levelCompleted: false,
  dynamicObstacles: [],
  levelStates: new Map(),
  discordUserId: null, 
  isSoundOn: true 
};


class StaticObstacle {
  constructor(x, y) {
    this.x = x * TILE_SIZE;
    this.y = y * TILE_SIZE;
  }

  draw() {
    
  }

  collidesWithPlayer(player) {
    
    return false;
  }
}


const skinImages = [];
for (let i = 0; i < SKINS_COUNT; i++) {
  const img = new Image();
  img.src = `skin${i + 1}.png`;
  img.onerror = () => {
    console.error(`Failed to load skin ${i+1}`);
    skinImages[i] = null;
  };
  skinImages.push(img);
}

const jumpSound = new Audio('jump.mp3');
const winSound = new Audio('win.mp3');

function generateMaze(width, height, level) {
  const maze = Array(height).fill().map(() => Array(width).fill(1));
  
  let startX = width - 2, startY = height - 2;
  maze[startY][startX] = 0;
  
  let finishX = 1, finishY = 1;
  maze[finishY][finishX] = 2;
  
  const directions = [
    {x: 1, y: 0}, {x: 0, y: 1},
    {x: -1, y: 0}, {x: 0, y: -1}
  ];
  
  const frontier = [];
  const addFrontier = (x, y) => {
    if (x > 0 && x < width-1 && y > 0 && y < height-1 && maze[y][x] === 1) {
      frontier.push({x, y});
    }
  };
  
  maze[startY][startX] = 0;
  addFrontier(startX+2, startY);
  addFrontier(startX-2, startY);
  addFrontier(startX, startY+2);
  addFrontier(startX, startY-2);
  
  while (frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const cell = frontier.splice(idx, 1)[0];
    
    const neighbors = [];
    for (const dir of directions) {
      const nx = cell.x - dir.x * 2;
      const ny = cell.y - dir.y * 2;
      if (nx > 0 && nx < width-1 && ny > 0 && ny < height-1 && maze[ny][nx] === 0) {
        neighbors.push({x: nx, y: ny, dir});
      }
    }
    
    if (neighbors.length > 0) {
      const neighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
      maze[cell.y][cell.x] = 0;
      maze[cell.y - neighbor.dir.y][cell.x - neighbor.dir.x] = 0;
      
      addFrontier(cell.x+2, cell.y);
      addFrontier(cell.x-2, cell.y);
      addFrontier(cell.x, cell.y+2);
      addFrontier(cell.x, cell.y-2);
    }
  }
  
  
  const getDistance = (x, y) => Math.abs(finishX - x) + Math.abs(finishY - y);
  const openSet = [{x: startX, y: startY, f: getDistance(startX, startY), g: 0}];
  const closedSet = new Set();
  const cameFrom = new Map();
  
  while (openSet.length > 0) {
    let current = openSet.reduce((min, node) => min.f < node.f ? min : node);
    if (current.x === finishX && current.y === finishY) {
      break;
    }
    
    openSet.splice(openSet.indexOf(current), 1);
    closedSet.add(`${current.x},${current.y}`);
    
    for (const dir of directions) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const posKey = `${nx},${ny}`;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && 
          maze[ny][nx] !== 1 && !closedSet.has(posKey)) {
        const gScore = current.g + 1;
        const fScore = gScore + getDistance(nx, ny);
        
        const existingNode = openSet.find(node => node.x === nx && node.y === ny);
        if (!existingNode) {
          openSet.push({x: nx, y: ny, f: fScore, g: gScore});
          cameFrom.set(posKey, {x: current.x, y: current.y});
        } else if (gScore < existingNode.g) {
          existingNode.g = gScore;
          existingNode.f = fScore;
          cameFrom.set(posKey, {x: current.x, y: current.y});
        }
      }
    }
  }
  
 
  if (cameFrom.has(`${finishX},${finishY}`)) {
    let current = {x: finishX, y: finishY};
    const path = [];
    while (current.x !== startX || current.y !== startY) {
      path.push({x: current.x, y: current.y});
      const prev = cameFrom.get(`${current.x},${current.y}`);
      if (!prev) break;
      current = prev;
    }
    path.push({x: startX, y: startY});
    for (let pos of path) {
      maze[pos.y][pos.x] = 0;
    }
    maze[startY][startX] = 0;
    maze[finishY][finishX] = 2;
    
    const visited = Array(height).fill().map(() => Array(width).fill(false));
    const stack = [{x: startX, y: startY}];
    let reachableFinish = false;
    while (stack.length > 0) {
      const {x, y} = stack.pop();
      if (x === finishX && y === finishY) {
        reachableFinish = true;
        break;
      }
      if (visited[y][x] || maze[y][x] === 1) continue;
      visited[y][x] = true;
      for (const dir of directions) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx]) {
          stack.push({x: nx, y: ny});
        }
      }
    }
    
    if (!reachableFinish) {
      
      let cx = startX, cy = startY;
      while (cx > finishX || cy > finishY) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && maze[ny][nx] === 1) {
              maze[ny][nx] = 0;
            }
          }
        }
        if (cx > finishX) cx--;
        else if (cy > finishY) cy--;
      }
      maze[finishY][finishX] = 2;
      console.log(`Level ${level} path validation failed, applied 5x5 fallback`);
    } else {
      console.log(`Level ${level} path validated successfully`);
    }
  } else {
    
    let cx = startX, cy = startY;
    while (cx > finishX || cy > finishY) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && maze[ny][nx] === 1) {
            maze[ny][nx] = 0;
          }
        }
      }
      if (cx > finishX) cx--;
      else if (cy > finishY) cy--;
    }
    maze[finishY][finishX] = 2;
    console.log(`Level ${level} A* failed, applied initial 5x5 fallback`);
  }
  
  return maze;
}

function calculateJump() {
  const p = gameState.player;
  const now = Date.now();
  
  if (now - p.lastJumpTime < JUMP_DELAY || p.isJumping) return;
  
  let dirX = 0, dirY = 0;
  if (gameState.keys['ArrowUp'] || gameState.keys['w']) dirY = -1;
  else if (gameState.keys['ArrowDown'] || gameState.keys['s']) dirY = 1;
  else if (gameState.keys['ArrowLeft'] || gameState.keys['a']) dirX = -1;
  else if (gameState.keys['ArrowRight'] || gameState.keys['d']) dirX = 1;
  
  if (dirX === 0 && dirY === 0) return;
  
  p.facing = dirX !== 0 ? dirX : p.facing;
  p.isJumping = true;
  p.lastJumpTime = now;
  
  let tx = Math.floor(p.x / TILE_SIZE);
  let ty = Math.floor(p.y / TILE_SIZE);
  let foundWall = false;
  
  while (true) {
    tx += dirX;
    ty += dirY;
    
    if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) {
      p.jumpTarget = {
        x: Math.max(0, Math.min(MAP_WIDTH - 1, tx - dirX)) * TILE_SIZE,
        y: Math.max(0, Math.min(MAP_HEIGHT - 1, ty - dirY)) * TILE_SIZE
      };
      break;
    }
    
    if (gameState.mapData[ty] && gameState.mapData[ty][tx] === 1) { 
      foundWall = true;
      p.jumpTarget = {
        x: (tx - dirX) * TILE_SIZE,
        y: (ty - dirY) * TILE_SIZE
      };
      break;
    }
  }
  
  if (foundWall) {
    p.jumpTarget.x += (TILE_SIZE - p.width) / 2;
    p.jumpTarget.y += (TILE_SIZE - p.height) / 2;
  }
  
  if (gameState.isSoundOn) {
    jumpSound.currentTime = 0; 
    jumpSound.play().catch(error => console.error('Jump sound failed to play:', error));
  }
}

function updatePlayer() {
  const p = gameState.player;
  const now = Date.now();
  
  if (p.isJumping) {
    const jumpProgress = Math.min(1, (now - p.lastJumpTime) / JUMP_DELAY);
    const easeProgress = easeOutQuad(jumpProgress);
    
    p.x = p.x + (p.jumpTarget.x - p.x) * easeProgress;
    p.y = p.y + (p.jumpTarget.y - p.y) * easeProgress;
    
    if (jumpProgress >= 1) {
      p.isJumping = false;
      checkFinish();
    }
  } else {
    calculateJump();
  }
  
  collectCoins();
}

function addStaticObstacle(mapData) {
  
  return [];
}

function easeOutQuad(t) {
  return t * (2 - t);
}

function checkFinish() {
  const p = gameState.player;
  const tx = Math.floor((p.x + p.width/2) / TILE_SIZE);
  const ty = Math.floor((p.y + p.height/2) / TILE_SIZE);
  
  if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT && 
      gameState.mapData[ty] && gameState.mapData[ty][tx] === 2) {
    completeLevel();
  }
}

function collectCoins() {
  const p = gameState.player;
  const px = Math.floor((p.x + p.width/2) / TILE_SIZE);
  const py = Math.floor((p.y + p.height/2) / TILE_SIZE);
  const posKey = `${px},${py}`;
  
  if (gameState.coinsPositions.has(posKey)) {
    gameState.coinsPositions.delete(posKey);
    gameState.totalCoins++;
    updateUI();
    saveProgress(); 
  }
}

function drawGame() {
  if (!ctx) {
    console.error('Canvas context is null');
    return;
  }
  drawBackground();
  drawMaze();
  drawCoins();
  drawPlayer();
}

function drawBackground() {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMaze() {
  if (!ctx || !gameState.mapData.length) return;
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const tile = gameState.mapData[y][x];
      if (tile === 1) {
        drawWall(x * TILE_SIZE, y * TILE_SIZE);
      } else if (tile === 2) {
        drawFinish(x * TILE_SIZE, y * TILE_SIZE);
      } else {
        drawPath(x * TILE_SIZE, y * TILE_SIZE);
      }
    }
  }
}

function drawWall(x, y) {
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  
  ctx.fillStyle = COLORS.wallEdge;
  const size = 6;
  for (let i = 0; i < TILE_SIZE; i += size * 2) {
    ctx.fillRect(x + i, y, size, size);
    ctx.fillRect(x, y + i, size, size);
  }
}

function drawFinish(x, y) {
  ctx.fillStyle = COLORS.finish;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  
  ctx.fillStyle = '#81C784';
  const size = 6;
  for (let i = 0; i < TILE_SIZE; i += size * 2) {
    ctx.fillRect(x + i, y, size, size);
    ctx.fillRect(x, y + i, size, size);
  }
}

function drawPath(x, y) {
  ctx.fillStyle = COLORS.path;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
}

function drawCoins() {
  if (!ctx) return;
  ctx.fillStyle = COLORS.coin;
  gameState.coinsPositions.forEach(pos => {
    const [x, y] = pos.split(',').map(Number);
    ctx.beginPath();
    ctx.arc(
      x * TILE_SIZE + TILE_SIZE/2,
      y * TILE_SIZE + TILE_SIZE/2,
      COIN_SIZE, 0, Math.PI*2
    );
    ctx.fill();
  });
}

function drawDynamicObstacles() {
  
}

function drawPlayer() {
  if (!ctx) return;
  const p = gameState.player;
  
  ctx.save();
  if (p.facing === -1) {
    ctx.translate(p.x + p.width, p.y);
    ctx.scale(-1, 1);
  }
  
  const skin = skinImages[p.skinIndex];
  if (skin && skin.complete) {
    ctx.drawImage(
      skin,
      p.facing === -1 ? 0 : p.x,
      p.facing === -1 ? 0 : p.y,
      p.width,
      p.height
    );
  } else {
    drawPlayerDefault();
  }
  ctx.restore();
}

function drawPlayerDefault() {
  if (!ctx) return;
  const p = gameState.player;
  ctx.fillStyle = COLORS.player;
  ctx.fillRect(
    p.facing === -1 ? 0 : p.x,
    p.facing === -1 ? 0 : p.y,
    p.width,
    p.height
  );
  
  ctx.fillStyle = '#000';
  const eyeX = p.facing === -1 ? p.width - 12 : 12;
  ctx.beginPath();
  ctx.arc(eyeX, 12, 4, 0, Math.PI*2);
  ctx.arc(eyeX, p.height - 12, 4, 0, Math.PI*2);
  ctx.fill();
}

function completeLevel() {
  if (gameState.levelCompleted) return;
  
  gameState.levelCompleted = true;
  if (gameState.currentLevel > gameState.maxLevelReached) {
    gameState.maxLevelReached = gameState.currentLevel;
    localStorage.setItem('maxLevelReached', gameState.maxLevelReached); 
    console.log(`Completed level ${gameState.currentLevel}, maxLevelReached updated to ${gameState.maxLevelReached}`);
  }
  
  if (gameState.isSoundOn) {
    winSound.currentTime = 0; 
    winSound.play().catch(error => console.error('Win sound failed to play:', error));
  }
  
  setTimeout(() => {
    if (gameState.currentLevel < TOTAL_LEVELS) {
      gameState.currentLevel++;
      startLevel(gameState.currentLevel);
    } else {
      alert('Congratulations! You completed all levels!');
    }
  }, 500);
  saveProgress(); 
}

function startLevel(level) {
  gameState.currentLevel = level;
  gameState.levelCompleted = false;
  
  
  const storedMaxLevel = localStorage.getItem('maxLevelReached');
  if (storedMaxLevel) {
    gameState.maxLevelReached = parseInt(storedMaxLevel);
    console.log(`Starting level ${level}, loaded maxLevelReached: ${gameState.maxLevelReached}`);
  } else {
    console.log(`Starting level ${level}, no stored maxLevelReached, using default: ${gameState.maxLevelReached}`);
  }
  
  
  let levelState = gameState.levelStates.get(level);
  if (!levelState) {
    const initialMap = generateMaze(MAP_WIDTH, MAP_HEIGHT, level);
    levelState = {
      mapData: [...initialMap.map(row => [...row])], 
      coinsPositions: placeCoins(initialMap, level),
      dynamicObstacles: addStaticObstacle(initialMap) 
    };
    gameState.levelStates.set(level, levelState);
  }
  
  gameState.mapData = [...levelState.mapData.map(row => [...row])]; 
  gameState.coinsPositions = new Set([...levelState.coinsPositions]); 
  gameState.dynamicObstacles = []; 
  
  gameState.player.x = (MAP_WIDTH - 2) * TILE_SIZE + (TILE_SIZE - gameState.player.width)/2;
  gameState.player.y = (MAP_HEIGHT - 2) * TILE_SIZE + (TILE_SIZE - gameState.player.height)/2;
  gameState.player.isJumping = false;
  
  updateUI();
  updateSkinsUI();
  if (document.getElementById('map-tab').classList.contains('active')) {
    renderLevelMap();
  }
}

function placeCoins(map, level) {
  const coins = new Set();
  const density = Math.max(0.4, 0.7 - level * 0.05);
  
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (map[y][x] === 0 && Math.random() < density) { 
        coins.add(`${x},${y}`);
      }
    }
  }
  
  coins.delete(`${MAP_WIDTH-2},${MAP_HEIGHT-2}`);
  coins.delete('1,1');
  
  return coins;
}

function updateUI() {
  const levelInfo = document.getElementById('level-info');
  if (levelInfo) {
    levelInfo.innerHTML = `
      <span id="current-level" style="color: #FFFFFF; margin-right: 15px;">Level ${gameState.currentLevel}</span>
      <span id="coin-count" style="color: #FFD600; margin-right: 15px;">Coins: ${gameState.totalCoins}</span>
    `;
    levelInfo.style.display = 'flex';
    levelInfo.style.alignItems = 'center';
    levelInfo.style.gap = '15px'; 
  } else {
    console.error('Level info element not found');
  }
}

function renderLevelMap() {
  const levelGrid = document.getElementById('level-grid');
  if (!levelGrid) {
    console.error('Level grid element not found');
    return;
  }
  console.log('Rendering level map, levelGrid exists:', levelGrid);
  levelGrid.innerHTML = '';
  const mapContent = document.getElementById('map-content');
  if (mapContent) {
    levelGrid.style.position = 'relative';
    levelGrid.style.top = '0';
    levelGrid.style.left = '0';
    levelGrid.style.display = 'flex';
    levelGrid.style.gap = '20px';
    levelGrid.style.width = '100%';
    levelGrid.style.justifyContent = 'center'; 
  } else {
    console.error('mapContent not found');
  }
  
  for (let block = 0; block < 2; block++) {
    const blockDiv = document.createElement('div');
    blockDiv.className = 'level-block';
    blockDiv.style.display = 'grid';
    blockDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
    blockDiv.style.gridTemplateRows = 'repeat(2, 1fr)';
    blockDiv.style.gap = '10px';
    
    for (let i = 0; i < 6; i++) {
      const levelNum = block * 6 + i + 1;
      if (levelNum > TOTAL_LEVELS) break;
      
      const levelItem = document.createElement('div');
      levelItem.className = 'level-item';
      levelItem.textContent = `Level ${levelNum}`;
      
      if (levelNum === gameState.currentLevel) {
        levelItem.classList.add('current');
      } else if (levelNum > gameState.maxLevelReached) {
        levelItem.classList.add('locked');
      }
      
      if (levelNum <= gameState.maxLevelReached) {
        levelItem.addEventListener('click', () => startLevel(levelNum));
      }
      
      blockDiv.appendChild(levelItem);
    }
    
    levelGrid.appendChild(blockDiv);
  }
}

function updateSkinsUI() {
  const skinsContainer = document.querySelector('.skins-container');
  if (!skinsContainer) {
    console.error('Skins container element not found');
    return;
  }
  skinsContainer.innerHTML = '';
  
  for (let i = 0; i < SKINS_COUNT; i++) {
    const skinItem = document.createElement('div');
    skinItem.className = 'skin-item';
    skinItem.dataset.skinId = i;
    skinItem.dataset.unlocked = gameState.totalCoins >= SKIN_PRICES[i] || i === 0 ? 'true' : 'false';
    
    const img = document.createElement('img');
    img.src = `skin${i + 1}.png`;
    img.alt = `Skin ${i + 1}`;
    skinItem.appendChild(img);
    
    const priceDiv = document.createElement('div');
    priceDiv.className = 'skin-price';
    priceDiv.textContent = i === 0 ? 'FREE' : `${SKIN_PRICES[i]} COINS`;
    skinItem.appendChild(priceDiv);
    
    if (i === gameState.player.skinIndex) {
      skinItem.classList.add('selected');
    }
    
    skinItem.addEventListener('click', () => {
      if (skinItem.dataset.unlocked === 'true' && i !== gameState.player.skinIndex) {
        gameState.player.skinIndex = i;
        if (i !== 0) { 
          gameState.totalCoins = Math.max(0, gameState.totalCoins - SKIN_PRICES[i]); 
        }
        document.querySelectorAll('.skin-item').forEach(s => s.classList.remove('selected'));
        skinItem.classList.add('selected');
        updateSkinsUI(); 
        updateUI(); 
        saveProgress(); 
      }
    });
    
    skinsContainer.appendChild(skinItem);
  }
}

function setupTabs() {
  const mapTab = document.getElementById('map-tab');
  const skinsTab = document.getElementById('skins-tab');
  const mapContent = document.getElementById('map-content');
  const skinsContent = document.getElementById('skins-content');

  console.log('Setting up tabs:', { mapTab, skinsTab, mapContent, skinsContent });
  if (!mapTab || !skinsTab || !mapContent || !skinsContent) {
    console.error('Tab elements not found:', { mapTab, skinsTab, mapContent, skinsContent });
    return;
  }

  mapTab.addEventListener('click', () => {
    console.log('Map tab clicked');
    mapTab.classList.add('active');
    skinsTab.classList.remove('active');
    mapContent.classList.add('active');
    skinsContent.classList.remove('active');
    renderLevelMap();
  });

  skinsTab.addEventListener('click', () => {
    console.log('Skins tab clicked');
    skinsTab.classList.add('active');
    mapTab.classList.remove('active');
    skinsContent.classList.add('active');
    mapContent.classList.remove('active');
    updateSkinsUI();
  });

  
  if (mapTab.classList.contains('active')) {
    renderLevelMap();
  }
}

function setupDiscordLogin() {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.right = '20px';
  container.style.top = '10px';
  container.style.zIndex = '10';
  container.style.display = 'flex';
  container.style.alignItems = 'center';

  const soundToggle = document.createElement('button');
  soundToggle.id = 'sound-toggle';
  soundToggle.textContent = 'Sound On';
  soundToggle.style.backgroundColor = '#FFD600';
  soundToggle.style.color = 'black';
  soundToggle.style.border = 'none';
  soundToggle.style.padding = '8px 15px';
  soundToggle.style.borderRadius = '5px';
  soundToggle.style.marginRight = '10px';
  soundToggle.style.cursor = 'pointer';
  soundToggle.style.fontFamily = "'Press Start 2P', cursive, monospace";
  soundToggle.style.fontSize = '12px';

  const loginButton = document.createElement('button');
  loginButton.id = 'login-button';
  loginButton.className = 'login-button';
  loginButton.textContent = 'Login with Discord';

  container.appendChild(soundToggle);
  container.appendChild(loginButton);
  document.body.appendChild(container);

  soundToggle.addEventListener('click', () => {
    gameState.isSoundOn = !gameState.isSoundOn;
    jumpSound.muted = !gameState.isSoundOn;
    winSound.muted = !gameState.isSoundOn;
    soundToggle.textContent = gameState.isSoundOn ? 'Sound On' : 'Sound Off';
  });

  loginButton.addEventListener('click', () => {
    
    const clientId = '1386817096184500325'; 
    const redirectUri = 'https://geniusiksl.github.io/irys-labyrinth/auth/callback'; 
    const scope = 'identify';
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
    
    
    const oauthWindow = window.open(oauthUrl, 'DiscordOAuth', 'width=600,height=600');
    
    
    const checkOAuth = setInterval(() => {
      if (oauthWindow.closed) {
        clearInterval(checkOAuth);
        
        const mockUserId = '803602745261031444'; 
        if (mockUserId) {
          gameState.discordUserId = mockUserId;
          loadProgress(); 
          console.log(`Logged in as Discord user ${gameState.discordUserId}`);
          updateDiscordLogin();
        } else {
          loginButton.textContent = 'Login with Discord';
          gameState.discordUserId = null;
          console.log('Login failed or cancelled');
        }
      }
    }, 500);
  });
}

function updateDiscordLogin() {
  const discordLogin = document.getElementById('discord-login');
  if (discordLogin) {
    discordLogin.innerHTML = '';
    const avatar = document.createElement('div');
    avatar.style.width = '40px';
    avatar.style.height = '40px';
    avatar.style.backgroundColor = '#7289DA'; 
    avatar.style.borderRadius = '50%';
    avatar.style.marginRight = '10px';
    avatar.style.display = 'inline-block';

    const logoutButton = document.createElement('button');
    logoutButton.textContent = 'Logout';
    logoutButton.style.backgroundColor = '#FF4444';
    logoutButton.style.border = 'none';
    logoutButton.style.color = 'white';
    logoutButton.style.padding = '5px 10px';
    logoutButton.style.borderRadius = '5px';
    logoutButton.style.cursor = 'pointer';
    logoutButton.addEventListener('click', () => {
      gameState.discordUserId = null;
      updateDiscordLogin();
      saveProgress(); 
      console.log('Logged out');
    });

    discordLogin.appendChild(avatar);
    discordLogin.appendChild(logoutButton);
  }
}

function saveProgress() {
  const progress = {
    maxLevelReached: gameState.maxLevelReached,
    totalCoins: gameState.totalCoins,
    skinIndex: gameState.player.skinIndex,
    levelStates: Object.fromEntries(gameState.levelStates)
  };
  if (gameState.discordUserId) {
    localStorage.setItem(`progress_${gameState.discordUserId}`, JSON.stringify(progress));
  } else {
    localStorage.setItem('progress', JSON.stringify(progress));
  }
  console.log('Progress saved:', progress);
}

function loadProgress() {
  let progress;
  if (gameState.discordUserId) {
    progress = localStorage.getItem(`progress_${gameState.discordUserId}`);
  } else {
    progress = localStorage.getItem('progress');
  }
  if (progress) {
    progress = JSON.parse(progress);
    gameState.maxLevelReached = progress.maxLevelReached || gameState.maxLevelReached;
    gameState.totalCoins = progress.totalCoins || gameState.totalCoins;
    gameState.player.skinIndex = progress.skinIndex || gameState.player.skinIndex;
    if (progress.levelStates) {
      gameState.levelStates = new Map(Object.entries(progress.levelStates));
    }
    console.log('Progress loaded:', progress);
    updateUI();
    updateSkinsUI();
  }
}

function init() {
  try {
    if (!canvas || !ctx) {
      throw new Error('Canvas or context not found. Check if <canvas id="game-canvas"> exists in HTML.');
    }

    loadProgress(); 

    const storedMaxLevel = localStorage.getItem('maxLevelReached');
    if (storedMaxLevel) {
      gameState.maxLevelReached = parseInt(storedMaxLevel);
    }

    jumpSound.preload = 'auto';
    winSound.preload = 'auto';

    window.addEventListener('keydown', (e) => {
      gameState.keys[e.key] = true;
      calculateJump();
    });
    window.addEventListener('keyup', (e) => {
      gameState.keys[e.key] = false;
    });
    
    jumpSound.preload = 'auto';
    winSound.preload = 'auto';

    
    window.addEventListener('keydown', (e) => {
      gameState.keys[e.key] = true;
      console.log('Key down:', e.key); 
      calculateJump(); 
    });
    window.addEventListener('keyup', (e) => {
      gameState.keys[e.key] = false;
      console.log('Key up:', e.key); 
    });

    setupTabs();
    
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading-screen');
      const gameContainer = document.getElementById('game-container');
      const logo = document.getElementById('logo');
      
      if (!loadingScreen || !gameContainer || !logo) {
        throw new Error('Loading screen, game container, or logo not found. Check HTML structure.');
      }
      
      logo.style.opacity = '0';
      logo.style.animation = 'fadeInOut 3s ease forwards';
      
      setTimeout(() => {
        loadingScreen.style.display = 'none';
        gameContainer.style.display = 'flex';
        startLevel(1);
        setupDiscordLogin(); 
        
        let lastTime = performance.now();
        function gameLoop(timestamp) {
          if (!ctx) {
            console.error('Context lost during game loop');
            return;
          }
          const deltaTime = timestamp - lastTime;
          lastTime = timestamp;
          
          updatePlayer();
          drawGame();
          requestAnimationFrame(gameLoop);
        }
        
        requestAnimationFrame(gameLoop);
      }, 3000); 
    }, 100);
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Game failed to start: ' + error.message + '. Check console for details.');
  }
}

window.onload = init;
