(() => {
    "use strict";

    const canvas = document.getElementById("game-board");
    const ctx = canvas.getContext("2d");
    const movesEl = document.getElementById("moves-left");
    const scoreEl = document.getElementById("score");
    const highScoreEl = document.getElementById("high-score");
    const hintEl = document.getElementById("game-hint");
    const newGameBtn = document.getElementById("new-game");

    const COLS = 6;
    const ROWS = 6;
    const COLORS = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#29B6F6", "#1E88E5", "#8E24AA"];
    const TOTAL_MOVES = 30;
    const STORAGE_KEY = "match3_highscore";

    const BOARD_W = 540;
    const BOARD_H = 540;
    const CELL = BOARD_W / COLS;
    const RADIUS = CELL * 0.38;
    const FILL_MS = 400;   // fall animation duration
    const POP_MS = 280;    // disappear animation
    const SWAP_MS = 200;   // swap animation

    let board = [];
    let movesLeft = TOTAL_MOVES;
    let score = 0;
    let highScore = 0;
    let selected = null;
    let animating = false;
    let swapAnim = null;

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const randColor = () => COLORS[(Math.random() * COLORS.length) | 0];

    function lightenColor(hex, amount) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const mix = (c) => Math.round(c + (255 - c) * amount);
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }

    function loadHighScore() {
        try {
            highScore = parseInt(localStorage.getItem(STORAGE_KEY), 10) || 0;
        } catch (_) {
            highScore = 0;
        }
    }

    function saveHighScore() {
        try {
            if (score > highScore) {
                highScore = score;
                localStorage.setItem(STORAGE_KEY, String(highScore));
            }
        } catch (_) {
            console.log("Storage unavailable")
        }
    }

    function updateHUD() {
        movesEl.textContent = String(movesLeft);
        scoreEl.textContent = String(score);
        highScoreEl.textContent = String(highScore);
    }

    function setHint(text, isError) {
        hintEl.textContent = text;
        hintEl.classList.toggle("error", !!isError);
    }

    function makeBoard() {
        const b = [];
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            for (let c = 0; c < COLS; c++) {
                row.push({ color: randColor(), y: r, vy: 0, targetY: r });
            }
            b.push(row);
        }
        return b;
    }

    function generateBoard() {
        let guard = 0;
        let b;
        do {
            b = makeBoard();
            guard++;
        } while ((hasMatch(b) || !hasAvailableMove(b)) && guard < 200);
        return b;
    }

    function prepareDropIn(board) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const p = board[r][c];
                if (p) {
                    p.y = r - ROWS;
                    p.vy = 0;
                    p.targetY = r;
                }
            }
        }
    }

    function findMatches(board) {
        const matched = new Set();
        const key = (r, c) => r * COLS + c;

        for (let r = 0; r < ROWS; r++) {
            let c = 0;
            while (c < COLS) {
                const color = board[r][c] && board[r][c].color;
                let run = 1;
                while (c + run < COLS && board[r][c + run] && board[r][c + run].color === color) run++;
                if (color && run >= 3) {
                    for (let i = 0; i < run; i++) matched.add(key(r, c + i));
                }
                c += run;
            }
        }

        for (let c = 0; c < COLS; c++) {
            let r = 0;
            while (r < ROWS) {
                const color = board[r][c] && board[r][c].color;
                let run = 1;
                while (r + run < ROWS && board[r + run][c] && board[r + run][c].color === color) run++;
                if (color && run >= 3) {
                    for (let i = 0; i < run; i++) matched.add(key(r + i, c));
                }
                r += run;
            }
        }

        return matched;
    }

    function hasMatch(board) {
        return findMatches(board).size > 0;
    }

    function hasAvailableMove(board) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (c + 1 < COLS) {
                    swap(board, r, c, r, c + 1);
                    const ok = hasMatch(board);
                    swap(board, r, c, r, c + 1);
                    if (ok) return true;
                }
                if (r + 1 < ROWS) {
                    swap(board, r, c, r + 1, c);
                    const ok = hasMatch(board);
                    swap(board, r, c, r + 1, c);
                    if (ok) return true;
                }
            }
        }
        return false;
    }

    function swap(board, r1, c1, r2, c2) {
        const tmp = board[r1][c1];
        board[r1][c1] = board[r2][c2];
        board[r2][c2] = tmp;
    }

    function syncSwappedCells(board, a, b) {
        if (board[a.r] && board[a.r][a.c]) board[a.r][a.c].y = a.r;
        if (board[b.r] && board[b.r][b.c]) board[b.r][b.c].y = b.r;
    }

    function applyGravityAndRefill(board) {
        for (let c = 0; c < COLS; c++) {
            let writeRow = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) {
                const p = board[r][c];
                if (p) {
                    if (writeRow !== r) {
                        board[writeRow][c] = p;
                        board[r][c] = null;
                        p.y = r;
                        p.vy = 0.2;
                        p.targetY = writeRow;
                    } else {
                        p.y = r;
                        p.vy = 0;
                        p.targetY = r;
                    }
                    writeRow--;
                }
            }
            for (let tr = writeRow; tr >= 0; tr--) {
                board[tr][c] = { color: randColor(), y: -(writeRow - tr) - 1, vy: 0.2, targetY: tr };
            }
        }
    }

    function animateFall(board) {
        let anyNeedsToMove = false;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const p = board[r][c];
                if (p && p.y !== p.targetY) {
                    p.startY = p.y;
                    anyNeedsToMove = true;
                }
            }
        }
        if (!anyNeedsToMove) return Promise.resolve();

        const startTime = performance.now();
        return new Promise((resolve) => {
            function step(now) {
                let anyMoving = false;
                const t = Math.min(1, (now - startTime) / FILL_MS);
                const eased = 1 - Math.pow(1 - t, 3);
                for (let r = 0; r < ROWS; r++) {
                    for (let c = 0; c < COLS; c++) {
                        const p = board[r][c];
                        if (p && p.startY !== undefined && p.y !== p.targetY) {
                            anyMoving = true;
                            p.y = p.startY + (p.targetY - p.startY) * eased;
                            if (t >= 1 || p.y >= p.targetY) {
                                p.y = p.targetY;
                                delete p.startY;
                            }
                        }
                    }
                }
                render();
                if (anyMoving) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    function animatePop(board) {
        const startTime = performance.now();
        return new Promise((resolve) => {
            function step(now) {
                const t = Math.min(1, (now - startTime) / POP_MS);
                let anyPop = false;
                for (let r = 0; r < ROWS; r++) {
                    for (let c = 0; c < COLS; c++) {
                        const p = board[r][c];
                        if (p && p.dying) {
                            p.pop = t;
                            anyPop = true;
                            if (t >= 1) board[r][c] = null;
                        }
                    }
                }
                render();
                if (anyPop) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    async function resolveMatches(board) {
        let gained = 0;
        let guard = 0;
        while (true) {
            const matched = findMatches(board);
            if (matched.size === 0) break;
            gained += matched.size * 10;

            for (const k of matched) {
                const p = board[Math.floor(k / COLS)][k % COLS];
                if (p) {
                    p.dying = true;
                    p.pop = 0;
                }
            }
            render();
            await animatePop(board);
            await wait(60);
            applyGravityAndRefill(board);
            await animateFall(board);
            if (++guard > 60) break;
        }
        return gained;
    }

    const cellCenterX = (c) => c * CELL + CELL / 2;
    const cellCenterY = (r) => r * CELL + CELL / 2;
    const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    function drawGemBody(px, py, color, radius) {
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        // Gloss: a soft, lighter circle — no outline.
        ctx.beginPath();
        ctx.arc(px - radius * 0.3, py - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = lightenColor(color, 0.45);
        ctx.fill();
    }

    function drawGems() {
        ctx.clearRect(0, 0, BOARD_W, BOARD_H);
        ctx.fillStyle = "#F7F9FC";
        ctx.fillRect(0, 0, BOARD_W, BOARD_H);

        ctx.strokeStyle = "#E5E9F0";
        ctx.lineWidth = 1;
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * CELL, 0);
            ctx.lineTo(c * CELL, BOARD_H);
            ctx.stroke();
        }
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * CELL);
            ctx.lineTo(BOARD_W, r * CELL);
            ctx.stroke();
        }

        const skip = new Set();
        let swapSegments = [];
        let swapT = 0;
        if (swapAnim) {
            swapSegments = swapAnim.segments;
            swapT = Math.min(1, (performance.now() - swapAnim.startTime) / SWAP_MS);
            for (const s of swapSegments) {
                skip.add(s.from.r * COLS + s.from.c);
                skip.add(s.to.r * COLS + s.to.c);
            }
        }

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (skip.has(r * COLS + c)) continue;
                const p = board[r][c];
                if (!p) continue;

                drawGem(c, p.y, p.color, selected && selected.r === r && selected.c === c, p.pop);
            }
        }

        if (swapSegments.length) {
            const eased = easeInOutQuad(swapT);
            for (const s of swapSegments) {
                const px = cellCenterX(s.from.c) + (cellCenterX(s.to.c) - cellCenterX(s.from.c)) * eased;
                const py = cellCenterY(s.from.r) + (cellCenterY(s.to.r) - cellCenterY(s.from.r)) * eased;
                drawGemBody(px, py, s.gem.color, RADIUS);
            }
        }
    }

    function drawGem(col, row, color, isSelected, pop) {
        const prog = Math.min(1, pop == null ? 0 : pop);
        const radius = RADIUS * (1 - prog);
        const alpha = 1 - prog;
        if (radius <= 0.5 || alpha <= 0.02) return;
        const px = cellCenterX(col);
        const py = cellCenterY(row);
        if (isSelected) {
            ctx.fillStyle = "rgba(171,0,234,0.15)";
            ctx.fillRect(col * CELL, Math.floor(row) * CELL, CELL, CELL);
        }
        ctx.globalAlpha = alpha;
        drawGemBody(px, py, color, radius);
        ctx.globalAlpha = 1;
    }

    function render() {
        drawGems();
    }

    // ---------- Input ----------
    function cellFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * BOARD_W;
        const y = ((e.clientY - rect.top) / rect.height) * BOARD_H;
        const c = Math.floor(x / CELL);
        const r = Math.floor(y / CELL);
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
        return { r, c };
    }

    canvas.addEventListener("pointerdown", (e) => {
        if (animating || movesLeft <= 0) return;
        const cell = cellFromEvent(e);
        if (!cell) return;

        if (selected) {
            const dr = Math.abs(cell.r - selected.r);
            const dc = Math.abs(cell.c - selected.c);
            if ((dr + dc) === 1) {
                doSwap(selected, cell);
                selected = null;
            } else {
                selected = cell;
                render();
            }
            return;
        }

        selected = cell;
        render();
    });

    function animateSwap(segments, duration) {
        const total = duration || SWAP_MS;
        const startTime = performance.now();
        swapAnim = { segments, startTime };
        return new Promise((resolve) => {
            function step() {
                render();
                if (performance.now() - startTime < total) {
                    requestAnimationFrame(step);
                } else {
                    swapAnim = null;
                    render();
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    async function doSwap(a, b) {
        animating = true;
        selected = null;
        render();

        const gemA = board[a.r][a.c];
        const gemB = board[b.r][b.c];
        const forward = [
            { gem: gemA, from: a, to: b },
            { gem: gemB, from: b, to: a }
        ];

        await animateSwap(forward, SWAP_MS);

        swap(board, a.r, a.c, b.r, b.c);
        syncSwappedCells(board, a, b);

        const matched = findMatches(board);
        if (matched.size === 0) {
            setHint("Неверный ход", true);

            const back = [
                { gem: gemA, from: b, to: a },
                { gem: gemB, from: a, to: b }
            ];
            await animateSwap(back, SWAP_MS);

            swap(board, a.r, a.c, b.r, b.c);
            syncSwappedCells(board, a, b);
            render();
            animating = false;
            return;
        }

        movesLeft--;
        updateHUD();

        const gained = await resolveMatches(board);
        score += gained;
        saveHighScore();
        updateHUD();

        if (!hasAvailableMove(board)) {
            setHint("Нет ходов…", true);
            await wait(1000);
            board = generateBoard();
            prepareDropIn(board);
            render();
            await animateFall(board);
            setHint("Поле пересоздано. Очки и ходы сохранены");
        } else {
            setHint("Получено +" + gained + " очков");
        }

        if (movesLeft <= 0) {
            setHint("Игра окончена! Ваш результат: " + score + ". Рекорд: " + highScore);
        }

        animating = false;
    }

    // ---------- New game ----------
    async function startNewGame() {
        score = 0;
        movesLeft = TOTAL_MOVES;
        selected = null;
        board = generateBoard();
        updateHUD();
        prepareDropIn(board);
        render();
        setHint("Заполняем поле…");
        await animateFall(board);
        setHint("Кликните две соседних фишки, чтобы поменять их местами");
    }

    newGameBtn.addEventListener("click", startNewGame);

    // ---------- Init ----------
    loadHighScore();
    updateHUD();
    startNewGame();
})();