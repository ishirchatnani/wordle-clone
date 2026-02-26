// Core game logic for the Wordle clone.
// This file connects the game rules with the HTML elements.

const NUM_ROWS = 6;
const NUM_COLS = 5;

let secretWord = "";
let currentRow = 0;
let currentCol = 0;
let isGameOver = false;
let hasAttachedKeyboardListeners = false;
let hasUsedHint = false;

let gamesPlayed = 0;
let gamesWon = 0;
let currentStreak = 0;

// We keep a map of the best status seen so far for each letter.
// This helps us color the on-screen keyboard correctly.
const keyStatuses = {};

/**
 * Show a short message to the player.
 * The message area already exists in the HTML.
 */
function showMessage(text) {
  const messageEl = document.getElementById("message");
  if (!messageEl) return;
  messageEl.textContent = text;
}

/**
 * Clear the current message.
 */
function clearMessage() {
  showMessage("");
}

/**
 * Choose a random secret word from ANSWER_WORDS and build the UI.
 */
function initGame() {
  if (!Array.isArray(ANSWER_WORDS) || ANSWER_WORDS.length === 0) {
    console.error("ANSWER_WORDS is not defined or empty.");
    return;
  }

  // Reset core state for a new game.
  secretWord = "";
  currentRow = 0;
  currentCol = 0;
  isGameOver = false;
  hasUsedHint = false;

  // Clear previous key statuses.
  for (const letter in keyStatuses) {
    if (Object.prototype.hasOwnProperty.call(keyStatuses, letter)) {
      delete keyStatuses[letter];
    }
  }

  const randomIndex = Math.floor(Math.random() * ANSWER_WORDS.length);
  secretWord = ANSWER_WORDS[randomIndex].toUpperCase();

  buildBoard();
  buildKeyboard();

  if (!hasAttachedKeyboardListeners) {
    attachKeyboardListeners();
    hasAttachedKeyboardListeners = true;
  }

  enableKeyboard();

  clearMessage();

  const restartButton = document.getElementById("restart");
  if (restartButton) {
    restartButton.removeAttribute("disabled");
  }

  const hintButton = document.getElementById("hint");
  if (hintButton) {
    hintButton.removeAttribute("disabled");
  }
}

/**
 * Build the 6x5 board in the DOM.
 * Each tile is a div with classes we can style and update later.
 */
function buildBoard() {
  const board = document.getElementById("board");
  if (!board) return;

  board.innerHTML = "";

  for (let row = 0; row < NUM_ROWS; row++) {
    const rowEl = document.createElement("div");
    rowEl.className = "board-row";
    rowEl.dataset.row = String(row);

    for (let col = 0; col < NUM_COLS; col++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = String(row);
      tile.dataset.col = String(col);

      const inner = document.createElement("div");
      inner.className = "tile-inner";

      tile.appendChild(inner);
      rowEl.appendChild(tile);
    }

    board.appendChild(rowEl);
  }
}

/**
 * Build the on-screen keyboard using three rows of buttons.
 */
function buildKeyboard() {
  const keyboard = document.getElementById("keyboard");
  if (!keyboard) return;

  keyboard.innerHTML = "";

  const rows = [
    "QWERTYUIOP",
    "ASDFGHJKL",
    "ZXCVBNM"
  ];

  rows.forEach((rowLetters, rowIndex) => {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";

    // Add the Enter key at the start of the last row.
    if (rowIndex === 2) {
      const enterKey = createKeyButton("Enter", "Enter", true);
      rowEl.appendChild(enterKey);
    }

    for (const letter of rowLetters) {
      const keyButton = createKeyButton(letter, letter);
      rowEl.appendChild(keyButton);
    }

    // Add the Backspace key at the end of the last row.
    if (rowIndex === 2) {
      const backspaceKey = createKeyButton("Backspace", "⌫", true);
      rowEl.appendChild(backspaceKey);
    }

    keyboard.appendChild(rowEl);
  });
}

/**
 * Helper to create a single key button for the on-screen keyboard.
 */
function createKeyButton(value, label, wide = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "key" + (wide ? " key-wide" : "");
  button.dataset.key = value;
  button.textContent = label;

  button.addEventListener("click", () => {
    handleKey(value);
  });

  return button;
}

/**
 * Attach listeners for the physical keyboard.
 */
function attachKeyboardListeners() {
  document.addEventListener("keydown", (event) => {
    if (isGameOver) return;

    const key = event.key;

    // Letters: A-Z
    if (key.length === 1 && key.match(/[a-zA-Z]/)) {
      handleKey(key.toUpperCase());
      return;
    }

    if (key === "Enter" || key === "Backspace") {
      handleKey(key);
    }
  });
}

/**
 * Handle a logical key press (from physical or on-screen keyboard).
 */
function handleKey(key) {
  if (isGameOver) return;

  if (key === "Enter") {
    submitGuess();
  } else if (key === "Backspace") {
    deleteLetter();
  } else if (key.length === 1 && key.match(/[A-Z]/)) {
    addLetter(key);
  }
}

/**
 * Add a letter to the current tile in the current row.
 */
function addLetter(letter) {
  if (currentCol >= NUM_COLS || currentRow >= NUM_ROWS) {
    return;
  }

  const tile = getTile(currentRow, currentCol);
  if (!tile) return;

  const inner = tile.querySelector(".tile-inner");
  if (!inner) return;

  inner.textContent = letter;
  tile.classList.add("tile-filled");

  currentCol += 1;
}

/**
 * Remove the last letter from the current row.
 */
function deleteLetter() {
  if (currentCol === 0 || currentRow >= NUM_ROWS) {
    return;
  }

  currentCol -= 1;

  const tile = getTile(currentRow, currentCol);
  if (!tile) return;

  const inner = tile.querySelector(".tile-inner");
  if (!inner) return;

  inner.textContent = "";
  tile.classList.remove("tile-filled");
}

/**
 * Submit the current guess when the player presses Enter.
 */
function submitGuess() {
  if (currentCol < NUM_COLS) {
    showTemporaryMessage("Not enough letters");
    return;
  }

  const guess = getCurrentGuess();

  if (!isValidGuess(guess)) {
    shakeRow(currentRow);
    showTemporaryMessage("Not in word list");
    return;
  }

  const evaluation = evaluateGuess(guess, secretWord);
  revealEvaluation(currentRow, guess, evaluation);

  if (guess === secretWord) {
    endGame(true);
    return;
  }

  currentRow += 1;
  currentCol = 0;

  if (currentRow === NUM_ROWS) {
    endGame(false);
  }
}

/**
 * Build the guess string from the current row tiles.
 */
function getCurrentGuess() {
  let guess = "";
  for (let col = 0; col < NUM_COLS; col++) {
    const tile = getTile(currentRow, col);
    if (!tile) continue;

    const inner = tile.querySelector(".tile-inner");
    if (!inner || !inner.textContent) continue;

    guess += inner.textContent.toUpperCase();
  }
  return guess;
}

/**
 * Check whether the guess is acceptable.
 * For now we accept any 5-letter guess so the small word list
 * does not block valid English words.
 */
function isValidGuess(guess) {
  return guess.length === NUM_COLS;
}

/**
 * Add a quick shake animation to a row (used for invalid words).
 */
function shakeRow(row) {
  const rowEl = document.querySelector(`.board-row[data-row="${row}"]`);
  if (!rowEl) return;

  rowEl.classList.add("shake");
  setTimeout(() => {
    rowEl.classList.remove("shake");
  }, 400);
}

/**
 * Show a message that automatically clears after a short delay.
 */
function showTemporaryMessage(text, durationMs = 1200) {
  showMessage(text);
  setTimeout(() => {
    clearMessage();
  }, durationMs);
}

/**
 * Evaluate a guess against the secret word.
 * Returns an array of statuses: "correct", "present", or "absent" for each letter.
 */
function evaluateGuess(guess, secret) {
  const result = Array(NUM_COLS).fill("absent");
  const secretChars = secret.split("");
  const guessChars = guess.split("");

  const letterCounts = {};
  for (const ch of secretChars) {
    const upper = ch.toUpperCase();
    letterCounts[upper] = (letterCounts[upper] || 0) + 1;
  }

  // First pass: mark correct positions.
  for (let i = 0; i < NUM_COLS; i++) {
    const g = guessChars[i].toUpperCase();
    const s = secretChars[i].toUpperCase();
    if (g === s) {
      result[i] = "correct";
      letterCounts[g] -= 1;
    }
  }

  // Second pass: mark present letters.
  for (let i = 0; i < NUM_COLS; i++) {
    if (result[i] === "correct") continue;

    const g = guessChars[i].toUpperCase();
    if (letterCounts[g] > 0) {
      result[i] = "present";
      letterCounts[g] -= 1;
    } else {
      result[i] = "absent";
    }
  }

  return result;
}

/**
 * Apply the evaluation results to the tiles and update keyboard colors.
 */
function revealEvaluation(row, guess, evaluation) {
  for (let col = 0; col < NUM_COLS; col++) {
    const tile = getTile(row, col);
    if (!tile) continue;

    const status = evaluation[col]; // "correct", "present", or "absent"

    tile.classList.remove("tile-correct", "tile-present", "tile-absent");

    if (status === "correct") {
      tile.classList.add("tile-correct");
    } else if (status === "present") {
      tile.classList.add("tile-present");
    } else {
      tile.classList.add("tile-absent");
    }

    const letter = guess[col].toUpperCase();
    updateKeyStatus(letter, status);
  }
}

/**
 * Update the best-known status for a letter and reflect it on the keyboard.
 */
function updateKeyStatus(letter, newStatus) {
  const current = keyStatuses[letter];
  const priority = { correct: 3, present: 2, absent: 1 };

  if (!current || priority[newStatus] > priority[current]) {
    keyStatuses[letter] = newStatus;
  } else {
    return;
  }

  const keyButton = document.querySelector(`.key[data-key="${letter}"]`);
  if (!keyButton) return;

  keyButton.classList.remove("key-correct", "key-present", "key-absent");

  if (keyStatuses[letter] === "correct") {
    keyButton.classList.add("key-correct");
  } else if (keyStatuses[letter] === "present") {
    keyButton.classList.add("key-present");
  } else if (keyStatuses[letter] === "absent") {
    keyButton.classList.add("key-absent");
  }
}

/**
 * When the game ends, show a message and prevent more input.
 */
function endGame(didWin) {
  isGameOver = true;

  gamesPlayed += 1;
  if (didWin) {
    gamesWon += 1;
    currentStreak += 1;
  } else {
    currentStreak = 0;
  }

  if (didWin) {
    showMessage("You won! 🎉");
  } else {
    showMessage(`You lost. The word was ${secretWord}.`);
  }

  disableKeyboard();

  const hintButton = document.getElementById("hint");
  if (hintButton) {
    hintButton.setAttribute("disabled", "true");
  }

  updateStatsPanel();
}

/**
 * Disable the on-screen keyboard buttons.
 */
function disableKeyboard() {
  const buttons = document.querySelectorAll(".key");
  buttons.forEach((button) => {
    button.disabled = true;
  });
}

/**
 * Enable the on-screen keyboard buttons.
 */
function enableKeyboard() {
  const buttons = document.querySelectorAll(".key");
  buttons.forEach((button) => {
    button.disabled = false;
  });
}

/**
 * Helper to get a tile element by row and column.
 */
function getTile(row, col) {
  return document.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
}

/**
 * Update the simple stats panel in the DOM.
 */
function updateStatsPanel() {
  const gamesPlayedEl = document.getElementById("stat-games-played");
  const gamesWonEl = document.getElementById("stat-games-won");
  const currentStreakEl = document.getElementById("stat-current-streak");

  if (!gamesPlayedEl || !gamesWonEl || !currentStreakEl) {
    return;
  }

  gamesPlayedEl.textContent = String(gamesPlayed);
  gamesWonEl.textContent = String(gamesWon);
  currentStreakEl.textContent = String(currentStreak);
}

/**
 * Handle the one-time hint for the current game.
 */
function handleHint() {
  if (isGameOver || hasUsedHint || !secretWord) {
    return;
  }

  hasUsedHint = true;

  const hintButton = document.getElementById("hint");
  if (hintButton) {
    hintButton.setAttribute("disabled", "true");
  }

  const firstLetter = secretWord[0];
  showMessage(`Hint: The word starts with "${firstLetter}".`);
}

// Initialize the game when the page is fully loaded.
window.addEventListener("DOMContentLoaded", () => {
  updateStatsPanel();
  initGame();

  const restartButton = document.getElementById("restart");
  if (restartButton) {
    restartButton.addEventListener("click", () => {
      initGame();
    });
  }

  const hintButton = document.getElementById("hint");
  if (hintButton) {
    hintButton.addEventListener("click", () => {
      handleHint();
    });
  }
});
