// 请把真实照片放入 assets/photos/ 文件夹，并命名为 photo1.jpg 到 photo8.jpg。
// 游戏会直接读取下面这些默认路径，不需要玩家上传图片。
const photoList = [
  'assets/photos/photo1.jpg',
  'assets/photos/photo2.jpg',
  'assets/photos/photo3.jpg',
  'assets/photos/photo4.jpg',
  'assets/photos/photo5.jpg',
  'assets/photos/photo6.jpg',
  'assets/photos/photo7.jpg',
  'assets/photos/photo8.jpg'
];

const DIFFICULTIES = {
  easy: { label: '简单', pairs: 4 },
  normal: { label: '普通', pairs: 6 },
  hard: { label: '困难', pairs: 8 }
};

const NEXT_DIFFICULTY = {
  easy: 'normal',
  normal: 'hard',
  hard: null
};

const FLIP_DURATION = 260;
const MISMATCH_SHOW_TIME = 1100;
const MATCH_SHOW_TIME = 800;
const MATCH_ANIMATION_TIME = 300;
const ERROR_ANIMATION_TIME = 360;
const SOUND_STORAGE_KEY = 'simonGameSoundEnabled';
const VIBRATION_STORAGE_KEY = 'simonGameVibrationEnabled';

document.documentElement.style.setProperty('--flip-duration', `${FLIP_DURATION}ms`);
document.documentElement.style.setProperty('--match-animation-time', `${MATCH_ANIMATION_TIME}ms`);
document.documentElement.style.setProperty('--error-animation-time', `${ERROR_ANIMATION_TIME}ms`);

const gameBoard = document.getElementById('gameBoard');
const soundToggle = document.getElementById('soundToggle');
const vibrationToggle = document.getElementById('vibrationToggle');
const unlockAudioButton = document.getElementById('unlockAudioButton');
const audioHint = document.getElementById('audioHint');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const exitButton = document.getElementById('exitButton');
const playAgainButton = document.getElementById('playAgainButton');
const nextLevelButton = document.getElementById('nextLevelButton');
const homeButton = document.getElementById('homeButton');
const difficultyButtons = document.querySelectorAll('.difficulty-button');
const controls = document.querySelector('.controls');
const timeDisplay = document.getElementById('timeDisplay');
const movesDisplay = document.getElementById('movesDisplay');
const matchedDisplay = document.getElementById('matchedDisplay');
const totalDisplay = document.getElementById('totalDisplay');
const bestDisplay = document.getElementById('bestDisplay');
const winOverlay = document.getElementById('winOverlay');
const finalDifficulty = document.getElementById('finalDifficulty');
const finalTime = document.getElementById('finalTime');
const finalMoves = document.getElementById('finalMoves');
const finalBestTime = document.getElementById('finalBestTime');
const finalBestMoves = document.getElementById('finalBestMoves');
const resultMessage = document.getElementById('resultMessage');

// 集中管理游戏状态，方便初学时理解每个变量的作用。
const gameState = {
  cards: [],
  firstSelectedCard: null,
  secondSelectedCard: null,
  lockBoard: true,
  moves: 0,
  matchedCount: 0,
  timer: null,
  pendingTimers: [],
  elapsedSeconds: 0,
  hasStarted: false,
  currentDifficulty: 'hard',
  screen: 'home',
  roundId: 0,
  soundEnabled: loadBooleanSetting(SOUND_STORAGE_KEY, true),
  vibrationEnabled: loadBooleanSetting(VIBRATION_STORAGE_KEY, true),
  audioContext: null,
  audioUnlocked: false
};

const photoPreloadPromise = preloadPhotos();

function loadBooleanSetting(key, defaultValue) {
  let storedValue = null;

  try {
    storedValue = localStorage.getItem(key);
  } catch (error) {
    return defaultValue;
  }

  if (storedValue === null) return defaultValue;
  return storedValue === 'true';
}

function saveBooleanSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    // 设置保存失败不影响游戏。
  }
}

function updateSettingButtons() {
  let soundLabel = '音效：关';

  if (gameState.soundEnabled) {
    soundLabel = gameState.audioUnlocked ? '音效：开，已开启' : '音效：开，未解锁';
  }

  soundToggle.textContent = soundLabel;
  soundToggle.classList.toggle('is-on', gameState.soundEnabled);
  soundToggle.setAttribute('aria-pressed', String(gameState.soundEnabled));

  vibrationToggle.textContent = `震动：${gameState.vibrationEnabled ? '开' : '关'}`;
  vibrationToggle.classList.toggle('is-on', gameState.vibrationEnabled);
  vibrationToggle.setAttribute('aria-pressed', String(gameState.vibrationEnabled));

  const shouldShowUnlock = gameState.soundEnabled && !gameState.audioUnlocked;
  unlockAudioButton.classList.toggle('is-hidden', !shouldShowUnlock);
  audioHint.classList.toggle('is-hidden', !shouldShowUnlock);
}

async function toggleSound() {
  gameState.soundEnabled = !gameState.soundEnabled;
  saveBooleanSetting(SOUND_STORAGE_KEY, gameState.soundEnabled);

  if (!gameState.soundEnabled) {
    gameState.audioUnlocked = false;
  }

  updateSettingButtons();
}

function toggleVibration() {
  gameState.vibrationEnabled = !gameState.vibrationEnabled;
  saveBooleanSetting(VIBRATION_STORAGE_KEY, gameState.vibrationEnabled);
  updateSettingButtons();
  vibrate(10);
}

async function handleUnlockAudioClick() {
  const didUnlock = await unlockAudio();

  if (didUnlock) {
    playUnlockSound();
  }
}

async function unlockAudio() {
  if (!gameState.soundEnabled) return false;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    console.warn('Web Audio API not supported');
    return false;
  }

  try {
    if (!gameState.audioContext) {
      gameState.audioContext = new AudioContextClass();
    }

    if (gameState.audioContext.state === 'suspended') {
      await gameState.audioContext.resume();
    }

    gameState.audioUnlocked = gameState.audioContext.state === 'running';
  } catch (error) {
    gameState.audioContext = null;
    gameState.audioUnlocked = false;
    console.warn('Audio unlock failed:', error);
    updateSettingButtons();
    return false;
  }

  updateSettingButtons();
  return gameState.audioUnlocked;
}

function getPlayableAudioContext() {
  if (!gameState.soundEnabled || !gameState.audioContext) return null;

  if (gameState.audioContext.state === 'suspended') {
    gameState.audioContext.resume()
      .then(() => {
        gameState.audioUnlocked = gameState.audioContext.state === 'running';
        updateSettingButtons();
      })
      .catch(() => {});
  }

  if (gameState.audioContext.state !== 'running') {
    gameState.audioUnlocked = false;
    updateSettingButtons();
    return null;
  }

  gameState.audioUnlocked = true;
  return gameState.audioContext;
}

function playTone(frequency, startOffset = 0, duration = 0.08, volume = 0.035, type = 'sine') {
  const audioContext = getPlayableAudioContext();
  if (!audioContext) return;

  try {
    const startTime = audioContext.currentTime + startOffset;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  } catch (error) {
    // 音效失败时静默跳过，避免影响游戏逻辑。
  }
}

function playButtonSound() {
  playTone(420, 0, 0.045, 0.025, 'triangle');
}

function playFlipSound() {
  playTone(520, 0, 0.055, 0.025, 'sine');
}

function playMatchSound() {
  playTone(660, 0, 0.09, 0.035, 'sine');
  playTone(880, 0.085, 0.11, 0.032, 'sine');
}

function playMismatchSound() {
  playTone(220, 0, 0.13, 0.032, 'sawtooth');
}

function playWinSound() {
  playTone(523, 0, 0.11, 0.034, 'triangle');
  playTone(659, 0.12, 0.11, 0.034, 'triangle');
  playTone(784, 0.24, 0.13, 0.034, 'triangle');
  playTone(1046, 0.39, 0.18, 0.03, 'triangle');
}

function playUnlockSound() {
  playTone(587, 0, 0.08, 0.034, 'triangle');
  playTone(784, 0.085, 0.1, 0.032, 'triangle');
}

function vibrate(pattern) {
  if (!gameState.vibrationEnabled) return;
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

async function triggerButtonFeedback() {
  await unlockAudio();
  playButtonSound();
  vibrate(10);
}

function preloadPhotos() {
  const preloadTasks = photoList.map((photoPath) => preloadPhoto(photoPath));
  return Promise.allSettled(preloadTasks);
}

function preloadPhoto(photoPath) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';

    image.onload = async () => {
      if (image.decode) {
        try {
          await image.decode();
        } catch (error) {
          // 有些浏览器会在图片已加载后拒绝 decode，不影响游戏继续。
        }
      }
      resolve();
    };

    image.onerror = () => {
      console.warn(`图片预加载失败：${photoPath}`);
      resolve();
    };

    image.src = photoPath;
  });
}

function createCards() {
  const selectedPhotos = getRandomPhotos(getCurrentDifficulty().pairs);
  const pairedPhotos = [...selectedPhotos, ...selectedPhotos];

  gameState.cards = pairedPhotos.map((photoPath, index) => ({
    id: index,
    photoPath,
    matched: false
  }));
}

function getCurrentDifficulty() {
  return DIFFICULTIES[gameState.currentDifficulty];
}

function getTotalCards() {
  return getCurrentDifficulty().pairs * 2;
}

function getRandomPhotos(count) {
  const shuffledPhotos = [...photoList];

  for (let index = shuffledPhotos.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledPhotos[index], shuffledPhotos[randomIndex]] = [
      shuffledPhotos[randomIndex],
      shuffledPhotos[index]
    ];
  }

  return shuffledPhotos.slice(0, count);
}

function getBestStorageKey(difficultyKey = gameState.currentDifficulty) {
  return `simonGameBest_${difficultyKey}`;
}

function loadBestRecord(difficultyKey = gameState.currentDifficulty) {
  const rawRecord = localStorage.getItem(getBestStorageKey(difficultyKey));

  if (!rawRecord) return null;

  try {
    const record = JSON.parse(rawRecord);
    if (!Number.isFinite(record.bestTime) || !Number.isFinite(record.bestMoves)) {
      return null;
    }
    return record;
  } catch (error) {
    return null;
  }
}

function saveBestRecord(record, difficultyKey = gameState.currentDifficulty) {
  localStorage.setItem(getBestStorageKey(difficultyKey), JSON.stringify(record));
}

function updateBestRecord() {
  const currentRecord = loadBestRecord();
  const nextRecord = {
    bestTime: currentRecord ? Math.min(currentRecord.bestTime, gameState.elapsedSeconds) : gameState.elapsedSeconds,
    bestMoves: currentRecord ? Math.min(currentRecord.bestMoves, gameState.moves) : gameState.moves
  };

  saveBestRecord(nextRecord);
  return nextRecord;
}

function updateBestDisplay() {
  const record = loadBestRecord();
  bestDisplay.textContent = record
    ? `最佳：${formatTime(record.bestTime)} / ${record.bestMoves} 步`
    : '最佳：暂无';
}

function getResultMessage() {
  const moves = gameState.moves;
  const difficultyKey = gameState.currentDifficulty;

  if (difficultyKey === 'easy') {
    if (moves <= 6) return '记忆大师！';
    if (moves <= 10) return '太棒了！';
    return '继续挑战！';
  }

  if (difficultyKey === 'normal') {
    if (moves <= 10) return '记忆大师！';
    if (moves <= 16) return '太棒了！';
    return '继续挑战！';
  }

  if (moves <= 16) return '记忆大师！';
  if (moves <= 24) return '太棒了！';
  return '继续挑战！';
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    const isActive = button.dataset.difficulty === gameState.currentDifficulty;
    button.classList.toggle('is-active', isActive);
  });
}

function setDifficultyControlsDisabled(isDisabled) {
  difficultyButtons.forEach((button) => {
    button.disabled = isDisabled;
  });
}

function setManagedTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    gameState.pendingTimers = gameState.pendingTimers.filter((id) => id !== timeoutId);
    callback();
  }, delay);

  gameState.pendingTimers.push(timeoutId);
  return timeoutId;
}

function clearPendingTimers() {
  gameState.pendingTimers.forEach((timeoutId) => clearTimeout(timeoutId));
  gameState.pendingTimers = [];
}

function updateScreen() {
  const isHome = gameState.screen === 'home';
  const isPlaying = gameState.screen === 'playing';
  const isCompleted = gameState.screen === 'completed';

  controls.classList.toggle('is-home', isHome);
  controls.classList.toggle('is-playing', isPlaying);
  gameBoard.classList.toggle('is-hidden', isHome);
  startButton.classList.toggle('is-hidden', !isHome && !isPlaying);
  restartButton.classList.toggle('is-hidden', !isPlaying);
  exitButton.classList.toggle('is-hidden', !isPlaying);

  startButton.disabled = isPlaying || isCompleted;
  startButton.textContent = isPlaying ? '游戏进行中' : '开始游戏';
  restartButton.disabled = !isPlaying;
  exitButton.disabled = !isPlaying;
  setDifficultyControlsDisabled(!isHome);
  updateDifficultyButtons();
}

function shuffleCards() {
  for (let index = gameState.cards.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [gameState.cards[index], gameState.cards[randomIndex]] = [
      gameState.cards[randomIndex],
      gameState.cards[index]
    ];
  }
}

function renderBoard() {
  gameBoard.innerHTML = '';

  gameState.cards.forEach((card) => {
    const cardButton = document.createElement('button');
    cardButton.className = 'card';
    cardButton.type = 'button';
    cardButton.dataset.id = card.id;
    cardButton.dataset.photoPath = card.photoPath;
    cardButton.setAttribute('aria-label', '未翻开的照片卡片');

    cardButton.innerHTML = `
      <div class="card-back" aria-hidden="true">Simon</div>
      <img class="card-photo" src="${card.photoPath}" alt="待配对照片">
    `;

    const image = cardButton.querySelector('img');
    image.decoding = 'async';
    image.loading = 'eager';

    if (!image.getAttribute('src')) {
      console.warn(`卡片图片路径为空：cardId=${card.id}，path=${card.photoPath}`);
    }

    image.addEventListener('error', () => {
      console.warn(`卡片图片加载失败：cardId=${card.id}，path=${card.photoPath}`);
    });

    cardButton.addEventListener('click', () => handleCardClick(cardButton));
    gameBoard.appendChild(cardButton);
  });
}

function resetRound() {
  stopTimer();
  clearPendingTimers();
  gameState.roundId += 1;
  createCards();
  shuffleCards();

  gameState.firstSelectedCard = null;
  gameState.secondSelectedCard = null;
  gameState.lockBoard = true;
  gameState.moves = 0;
  gameState.matchedCount = 0;
  gameState.elapsedSeconds = 0;
  gameState.hasStarted = false;

  totalDisplay.textContent = getTotalCards();
  updateStatus();
  updateBestDisplay();
  renderBoard();
  hideWinPanel();
  updateScreen();
}

async function startGame(shouldFeedback = true) {
  if (shouldFeedback) {
    await triggerButtonFeedback();
  }
  startButton.disabled = true;
  startButton.textContent = '准备中';
  restartButton.disabled = true;
  exitButton.disabled = true;
  playAgainButton.disabled = true;
  setDifficultyControlsDisabled(true);
  await photoPreloadPromise;

  gameState.screen = 'playing';
  resetRound();
  gameState.lockBoard = false;
  gameState.hasStarted = true;
  startTimer();
  updateScreen();
  playAgainButton.disabled = false;
}

function restartGame() {
  if (gameState.screen !== 'playing') return;
  startGame();
}

async function goHome(shouldFeedback = true) {
  if (shouldFeedback) {
    await triggerButtonFeedback();
  }
  stopTimer();
  clearPendingTimers();
  gameState.roundId += 1;
  gameState.cards = [];
  gameState.firstSelectedCard = null;
  gameState.secondSelectedCard = null;
  gameState.lockBoard = true;
  gameState.moves = 0;
  gameState.matchedCount = 0;
  gameState.elapsedSeconds = 0;
  gameState.hasStarted = false;
  gameState.screen = 'home';
  totalDisplay.textContent = getTotalCards();
  updateStatus();
  updateBestDisplay();
  hideWinPanel();
  renderBoard();
  updateScreen();
}

function changeDifficulty(difficultyKey) {
  if (gameState.screen !== 'home' || !DIFFICULTIES[difficultyKey]) return;
  triggerButtonFeedback();
  gameState.currentDifficulty = difficultyKey;
  goHome(false);
}

function handleCardClick(cardElement) {
  if (gameState.lockBoard) return;
  if (!gameState.hasStarted) return;
  if (cardElement.classList.contains('matched')) return;
  if (cardElement === gameState.firstSelectedCard) return;

  flipCard(cardElement);

  if (!gameState.firstSelectedCard) {
    gameState.firstSelectedCard = cardElement;
    return;
  }

  gameState.secondSelectedCard = cardElement;
  gameState.moves += 1;
  gameState.lockBoard = true;
  updateStatus();
  checkForMatch();
}

function flipCard(cardElement) {
  cardElement.classList.add('flipped');
  cardElement.setAttribute('aria-label', '已翻开的照片卡片');
  playFlipSound();
}

function checkForMatch() {
  const firstPhotoPath = gameState.firstSelectedCard.dataset.photoPath;
  const secondPhotoPath = gameState.secondSelectedCard.dataset.photoPath;

  if (firstPhotoPath === secondPhotoPath) {
    handleMatchSuccess();
  } else {
    handleMatchFailure();
  }
}

function handleMatchSuccess() {
  const firstCard = gameState.firstSelectedCard;
  const secondCard = gameState.secondSelectedCard;
  const roundId = gameState.roundId;

  firstCard.disabled = true;
  secondCard.disabled = true;
  playMatchSound();
  vibrate(30);

  setManagedTimeout(() => {
    if (roundId !== gameState.roundId || gameState.screen !== 'playing') return;

    firstCard.classList.add('matched');
    secondCard.classList.add('matched');
    gameState.matchedCount += 2;
    updateStatus();

    const isGameComplete = gameState.matchedCount === getTotalCards();

    setManagedTimeout(() => {
      if (roundId !== gameState.roundId || gameState.screen !== 'playing') return;

      clearSelectedCards();

      if (isGameComplete) {
        showWinPanel();
      }
    }, MATCH_ANIMATION_TIME);
  }, MATCH_SHOW_TIME);
}

function handleMatchFailure() {
  const roundId = gameState.roundId;

  gameState.firstSelectedCard.classList.add('shake');
  gameState.secondSelectedCard.classList.add('shake');
  playMismatchSound();
  vibrate([30, 40, 30]);

  setManagedTimeout(() => {
    if (roundId !== gameState.roundId || gameState.screen !== 'playing') return;

    gameState.firstSelectedCard.classList.remove('flipped', 'shake');
    gameState.secondSelectedCard.classList.remove('flipped', 'shake');
    gameState.firstSelectedCard.setAttribute('aria-label', '未翻开的照片卡片');
    gameState.secondSelectedCard.setAttribute('aria-label', '未翻开的照片卡片');
    clearSelectedCards();
  }, MISMATCH_SHOW_TIME);
}

function clearSelectedCards() {
  gameState.firstSelectedCard = null;
  gameState.secondSelectedCard = null;
  gameState.lockBoard = gameState.screen !== 'playing';
}

function startTimer() {
  stopTimer();
  gameState.timer = setInterval(() => {
    gameState.elapsedSeconds += 1;
    updateStatus();
  }, 1000);
}

function stopTimer() {
  if (gameState.timer) {
    clearInterval(gameState.timer);
    gameState.timer = null;
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateStatus() {
  timeDisplay.textContent = formatTime(gameState.elapsedSeconds);
  movesDisplay.textContent = gameState.moves;
  matchedDisplay.textContent = gameState.matchedCount;
}

function showWinPanel() {
  stopTimer();
  clearPendingTimers();
  gameState.lockBoard = true;
  gameState.hasStarted = false;
  gameState.screen = 'completed';
  const bestRecord = updateBestRecord();
  updateBestDisplay();
  updateScreen();
  finalDifficulty.textContent = getCurrentDifficulty().label;
  finalTime.textContent = formatTime(gameState.elapsedSeconds);
  finalMoves.textContent = gameState.moves;
  finalBestTime.textContent = formatTime(bestRecord.bestTime);
  finalBestMoves.textContent = `${bestRecord.bestMoves} 步`;
  resultMessage.textContent = getResultMessage();
  nextLevelButton.classList.toggle('is-hidden', !NEXT_DIFFICULTY[gameState.currentDifficulty]);
  winOverlay.classList.remove('hidden');
  playWinSound();
  vibrate([50, 50, 80]);
}

function hideWinPanel() {
  winOverlay.classList.add('hidden');
}

function goToNextLevel() {
  const nextDifficulty = NEXT_DIFFICULTY[gameState.currentDifficulty];
  if (!nextDifficulty) return;

  gameState.currentDifficulty = nextDifficulty;
  startGame();
}

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', restartGame);
exitButton.addEventListener('click', goHome);
playAgainButton.addEventListener('click', startGame);
homeButton.addEventListener('click', goHome);
nextLevelButton.addEventListener('click', goToNextLevel);
soundToggle.addEventListener('click', toggleSound);
vibrationToggle.addEventListener('click', toggleVibration);
unlockAudioButton.addEventListener('click', handleUnlockAudioClick);
difficultyButtons.forEach((button) => {
  button.addEventListener('click', () => changeDifficulty(button.dataset.difficulty));
});

updateSettingButtons();
goHome(false);
