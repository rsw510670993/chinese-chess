// UI 渲染模块

// Modified from shibing624/chinese-chess-ai: optional clock, responsive board, inline status, checkmate decisions, and move suggestions, 2026.

/**
 * 根据容器可用宽度计算棋盘尺寸。
 * 预留 12px 作为边框安全空间，确保棋盘外框不会超出容器。
 */
export function calculateBoardMetrics(availableWidth) {
    const safeWidth = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
    const padding = safeWidth < 520
        ? Math.max(12, Math.min(24, Math.floor(safeWidth * 0.055)))
        : 30;
    const borderAllowance = 12;
    const availableGridWidth = Math.max(0, safeWidth - 2 * padding - borderAllowance);
    const cellSize = Math.max(12, Math.min(60, Math.floor(availableGridWidth / 8)));

    return {
        cellSize,
        padding,
        boardWidth: cellSize * 8 + padding * 2,
        boardHeight: cellSize * 9 + padding * 2
    };
}

/**
 * 棋盘渲染器
 */
export class BoardRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedPiece = null;
        this.legalMoves = [];
        this.lastMove = null;
        this.suggestedMove = null;
        this.onPieceClick = null;
        this.onMoveClick = null;
        
        this.resizeFrame = null;

        // 根据容器大小动态设置棋盘尺寸
        this.updateBoardSize();
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            if (this.resizeFrame) {
                window.cancelAnimationFrame(this.resizeFrame);
            }

            this.resizeFrame = window.requestAnimationFrame(() => {
                this.resizeFrame = null;
                this.updateBoardSize();
                this.initBoard();
                if (this.currentBoard) {
                    this.render(this.currentBoard, this.currentChess);
                }
            });
        });
        
        this.initBoard();
    }
    
    /**
     * 根据父容器可用宽度更新棋盘尺寸
     */
    updateBoardSize() {
        const parent = this.container.parentElement;
        const parentStyle = window.getComputedStyle(parent);
        const horizontalPadding = parseFloat(parentStyle.paddingLeft || 0)
            + parseFloat(parentStyle.paddingRight || 0);
        const fallbackWidth = Math.max(0, window.innerWidth - 32);
        const availableWidth = parent.clientWidth > 0
            ? parent.clientWidth - horizontalPadding
            : fallbackWidth;
        const metrics = calculateBoardMetrics(availableWidth);

        this.cellSize = metrics.cellSize;
        this.padding = metrics.padding;
        this.boardWidth = metrics.boardWidth;
        this.boardHeight = metrics.boardHeight;
    }

    /**
     * 初始化棋盘
     */
    initBoard() {
        this.container.innerHTML = '';
        
        // 根据尺寸设置容器样式
        this.container.style.width = this.boardWidth + 'px';
        this.container.style.height = this.boardHeight + 'px';
        
        // 创建 SVG 网格
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('board-grid');
        const gridWidth = this.cellSize * 8;
        const gridHeight = this.cellSize * 9;
        svg.setAttribute('width', gridWidth);
        svg.setAttribute('height', gridHeight);
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.left = this.padding + 'px';
        svg.style.top = this.padding + 'px';
        
        // 绘制横线
        for (let i = 0; i < 10; i++) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '0');
            line.setAttribute('y1', i * this.cellSize);
            line.setAttribute('x2', 8 * this.cellSize);
            line.setAttribute('y2', i * this.cellSize);
            line.classList.add(i === 0 || i === 9 ? 'board-line-bold' : 'board-line');
            svg.appendChild(line);
        }
        
        // 绘制竖线
        for (let i = 0; i < 9; i++) {
            // 上半部分
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', i * this.cellSize);
            line1.setAttribute('y1', '0');
            line1.setAttribute('x2', i * this.cellSize);
            line1.setAttribute('y2', 4 * this.cellSize);
            line1.classList.add(i === 0 || i === 8 ? 'board-line-bold' : 'board-line');
            svg.appendChild(line1);
            
            // 下半部分
            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', i * this.cellSize);
            line2.setAttribute('y1', 5 * this.cellSize);
            line2.setAttribute('x2', i * this.cellSize);
            line2.setAttribute('y2', 9 * this.cellSize);
            line2.classList.add(i === 0 || i === 8 ? 'board-line-bold' : 'board-line');
            svg.appendChild(line2);
        }
        
        // 绘制九宫格斜线
        // 上方九宫格
        const diag1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        diag1.setAttribute('x1', 3 * this.cellSize);
        diag1.setAttribute('y1', '0');
        diag1.setAttribute('x2', 5 * this.cellSize);
        diag1.setAttribute('y2', 2 * this.cellSize);
        diag1.classList.add('board-line');
        svg.appendChild(diag1);
        
        const diag2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        diag2.setAttribute('x1', 5 * this.cellSize);
        diag2.setAttribute('y1', '0');
        diag2.setAttribute('x2', 3 * this.cellSize);
        diag2.setAttribute('y2', 2 * this.cellSize);
        diag2.classList.add('board-line');
        svg.appendChild(diag2);
        
        // 下方九宫格
        const diag3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        diag3.setAttribute('x1', 3 * this.cellSize);
        diag3.setAttribute('y1', 7 * this.cellSize);
        diag3.setAttribute('x2', 5 * this.cellSize);
        diag3.setAttribute('y2', 9 * this.cellSize);
        diag3.classList.add('board-line');
        svg.appendChild(diag3);
        
        const diag4 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        diag4.setAttribute('x1', 5 * this.cellSize);
        diag4.setAttribute('y1', 7 * this.cellSize);
        diag4.setAttribute('x2', 3 * this.cellSize);
        diag4.setAttribute('y2', 9 * this.cellSize);
        diag4.classList.add('board-line');
        svg.appendChild(diag4);
        
        this.container.appendChild(svg);
        
        // 添加河界文字
        this.addRiverText();
    }

    /**
     * 添加河界文字
     */
    addRiverText() {
        const riverY = this.padding + 4.5 * this.cellSize;
        const fontSize = Math.max(16, this.cellSize * 0.5);
        
        const riverText1 = document.createElement('div');
        riverText1.classList.add('river-text');
        riverText1.textContent = '楚河';
        riverText1.style.left = (this.padding + 2 * this.cellSize) + 'px';
        riverText1.style.top = riverY + 'px';
        riverText1.style.fontSize = fontSize + 'px';
        this.container.appendChild(riverText1);
        
        const riverText2 = document.createElement('div');
        riverText2.classList.add('river-text');
        riverText2.textContent = '汉界';
        riverText2.style.left = (this.padding + 5.5 * this.cellSize) + 'px';
        riverText2.style.top = riverY + 'px';
        riverText2.style.fontSize = fontSize + 'px';
        this.container.appendChild(riverText2);
    }

    /**
     * 渲染棋盘状态
     */
    render(board, chess) {
        // 保存当前状态供resize使用
        this.currentBoard = board;
        this.currentChess = chess;
        
        // 清除旧的棋子和标记
        const oldPieces = this.container.querySelectorAll('.chess-piece, .move-hint, .last-move-from, .last-move-to, .suggestion-arrow-layer');
        oldPieces.forEach(el => el.remove());
        
        // 渲染最后一步移动标记
        if (this.lastMove) {
            this.renderLastMove(this.lastMove);
        }
        
        // 渲染棋子
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const piece = board[y][x];
                if (piece) {
                    this.renderPiece(piece, x, y, chess);
                }
            }
        }
        
        // 渲染可移动位置
        if (this.selectedPiece && this.legalMoves.length > 0) {
            this.renderLegalMoves(this.legalMoves, board);
        }

        // 推荐走法使用独立箭头和目标圆环，避免与普通合法落点混淆
        if (this.suggestedMove) {
            this.renderSuggestion(this.suggestedMove);
        }
    }

    /**
     * 渲染棋子
     */
    renderPiece(piece, x, y, chess) {
        const pieceEl = document.createElement('div');
        pieceEl.classList.add('chess-piece');
        
        const isRed = piece === piece.toUpperCase();
        pieceEl.classList.add(isRed ? 'red' : 'black');
        
        // 设置棋子文字
        const pieceNames = {
            'K': '帅', 'k': '将',
            'A': '仕', 'a': '士',
            'B': '相', 'b': '象',
            'N': '马', 'n': '马',
            'R': '车', 'r': '车',
            'C': '炮', 'c': '炮',
            'P': '兵', 'p': '卒'
        };
        
        pieceEl.textContent = pieceNames[piece] || piece;
        
        // 设置棋子大小和字体大小
        const pieceSize = Math.max(18, this.cellSize * 0.85);
        const fontSize = Math.max(12, this.cellSize * 0.38);
        pieceEl.style.width = pieceSize + 'px';
        pieceEl.style.height = pieceSize + 'px';
        pieceEl.style.fontSize = fontSize + 'px';
        
        // 设置位置
        const left = this.padding + x * this.cellSize;
        const top = this.padding + y * this.cellSize;
        pieceEl.style.left = left + 'px';
        pieceEl.style.top = top + 'px';
        
        // 设置数据属性
        pieceEl.dataset.x = x;
        pieceEl.dataset.y = y;
        pieceEl.dataset.piece = piece;
        
        // 检查是否为选中的棋子
        if (this.selectedPiece && this.selectedPiece.x === x && this.selectedPiece.y === y) {
            pieceEl.classList.add('selected');
        }
        
        // 移除disabled类，不虚化对方棋子
        // if (chess && !chess.isCurrentPlayerPiece(piece)) {
        //     pieceEl.classList.add('disabled');
        // }
        
        // 添加点击事件
        pieceEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onPieceClick) {
                this.onPieceClick(x, y, piece);
            }
        });
        
        this.container.appendChild(pieceEl);
    }

    /**
     * 渲染可移动位置
     */
    renderLegalMoves(moves, board) {
        for (const move of moves) {
            const hintEl = document.createElement('div');
            hintEl.classList.add('move-hint');
            
            const targetPiece = board[move.y][move.x];
            const hintSize = Math.max(10, this.cellSize * 0.3);
            const captureSize = Math.max(18, this.cellSize * 0.85);
            
            if (targetPiece) {
                hintEl.classList.add('capture');
                hintEl.style.width = captureSize + 'px';
                hintEl.style.height = captureSize + 'px';
            } else {
                hintEl.style.width = hintSize + 'px';
                hintEl.style.height = hintSize + 'px';
            }
            
            const left = this.padding + move.x * this.cellSize;
            const top = this.padding + move.y * this.cellSize;
            hintEl.style.left = left + 'px';
            hintEl.style.top = top + 'px';
            
            hintEl.dataset.x = move.x;
            hintEl.dataset.y = move.y;
            
            hintEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onMoveClick) {
                    this.onMoveClick(move.x, move.y);
                }
            });
            
            this.container.appendChild(hintEl);
        }
    }

    /**
     * 渲染最后一步移动 - 增强视觉效果
     */
    renderLastMove(move) {
        const markerSize = Math.max(20, this.cellSize * 0.95);
        const markerBorderWidth = Math.max(3, this.cellSize * 0.08);
        const fromEl = document.createElement('div');
        fromEl.classList.add('last-move-from');
        fromEl.style.width = markerSize + 'px';
        fromEl.style.height = markerSize + 'px';
        fromEl.style.borderWidth = markerBorderWidth + 'px';
        fromEl.style.left = (this.padding + move.from.x * this.cellSize) + 'px';
        fromEl.style.top = (this.padding + move.from.y * this.cellSize) + 'px';
        this.container.appendChild(fromEl);
        
        const toEl = document.createElement('div');
        toEl.classList.add('last-move-to');
        toEl.style.width = markerSize + 'px';
        toEl.style.height = markerSize + 'px';
        toEl.style.borderWidth = markerBorderWidth + 'px';
        toEl.style.left = (this.padding + move.to.x * this.cellSize) + 'px';
        toEl.style.top = (this.padding + move.to.y * this.cellSize) + 'px';
        this.container.appendChild(toEl);
    }

    /**
     * 绘制推荐走法箭头和目标圆环
     */
    renderSuggestion(move) {
        const startX = this.padding + move.from.x * this.cellSize;
        const startY = this.padding + move.from.y * this.cellSize;
        const targetX = this.padding + move.to.x * this.cellSize;
        const targetY = this.padding + move.to.y * this.cellSize;
        const deltaX = targetX - startX;
        const deltaY = targetY - startY;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance === 0) return;

        const unitX = deltaX / distance;
        const unitY = deltaY / distance;
        const startOffset = Math.min(this.cellSize * 0.38, distance * 0.2);
        const endOffset = Math.min(this.cellSize * 0.42, distance * 0.25);
        const arrowStartX = startX + unitX * startOffset;
        const arrowStartY = startY + unitY * startOffset;
        const arrowEndX = targetX - unitX * endOffset;
        const arrowEndY = targetY - unitY * endOffset;
        const markerId = 'suggestion-arrowhead';
        const arrowheadSize = Math.max(10, this.cellSize * 0.28);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('suggestion-arrow-layer');
        svg.setAttribute('width', this.boardWidth);
        svg.setAttribute('height', this.boardHeight);
        svg.setAttribute('viewBox', `0 0 ${this.boardWidth} ${this.boardHeight}`);
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('markerWidth', arrowheadSize);
        marker.setAttribute('markerHeight', arrowheadSize);
        marker.setAttribute('refX', arrowheadSize - 1);
        marker.setAttribute('refY', arrowheadSize / 2);
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('markerUnits', 'userSpaceOnUse');
        const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowhead.setAttribute('d', `M 0 0 L ${arrowheadSize} ${arrowheadSize / 2} L 0 ${arrowheadSize} z`);
        arrowhead.classList.add('suggestion-arrowhead');
        marker.appendChild(arrowhead);
        defs.appendChild(marker);
        svg.appendChild(defs);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('suggestion-arrow-line');
        line.setAttribute('x1', arrowStartX);
        line.setAttribute('y1', arrowStartY);
        line.setAttribute('x2', arrowEndX);
        line.setAttribute('y2', arrowEndY);
        line.setAttribute('stroke-width', Math.max(3, this.cellSize * 0.08));
        line.setAttribute('marker-end', `url(#${markerId})`);
        svg.appendChild(line);

        const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        target.classList.add('suggestion-target');
        target.setAttribute('cx', targetX);
        target.setAttribute('cy', targetY);
        target.setAttribute('r', Math.max(10, this.cellSize * 0.34));
        target.setAttribute('stroke-width', Math.max(3, this.cellSize * 0.07));
        svg.appendChild(target);

        this.container.appendChild(svg);
    }

    /**
     * 设置选中的棋子
     */
    setSelectedPiece(x, y) {
        this.suggestedMove = null;
        this.selectedPiece = x !== null ? {x, y} : null;
    }

    /**
     * 设置可移动位置
     */
    setLegalMoves(moves) {
        this.legalMoves = moves;
    }

    /**
     * 设置推荐走法
     */
    setSuggestedMove(move) {
        this.suggestedMove = move;
    }

    /**
     * 设置最后一步移动
     */
    setLastMove(move) {
        this.lastMove = move;
    }

    /**
     * 清除选择
     */
    clearSelection() {
        this.selectedPiece = null;
        this.legalMoves = [];
        this.suggestedMove = null;
    }
}

/**
 * 游戏信息显示器
 */
export class GameInfoDisplay {
    constructor() {
        this.currentTurnEl = document.getElementById('currentTurn');
        this.moveCountEl = document.getElementById('moveCount');
        this.gameStatusEl = document.getElementById('gameStatus');
        this.moveHistoryEl = document.getElementById('moveHistory');
        this.redPlayerLabelEl = document.getElementById('redPlayerLabel');
        this.blackPlayerLabelEl = document.getElementById('blackPlayerLabel');
        this.redTimerEl = document.getElementById('redTimer');
        this.blackTimerEl = document.getElementById('blackTimer');
    }

    /**
     * 更新当前回合
     */
    updateCurrentTurn(player) {
        this.currentTurnEl.textContent = player === 'red' ? '红方' : '黑方';
        this.currentTurnEl.className = player === 'red' ? 'turn-value red' : 'turn-value black';
    }

    /**
     * 更新回合数
     */
    updateMoveCount(count) {
        this.moveCountEl.textContent = count;
    }

    /**
     * 更新游戏状态
     */
    updateGameStatus(status) {
        this.gameStatusEl.textContent = status;
        const isWarning = status.includes('将军') || status.includes('将死');
        this.gameStatusEl.className = isWarning ? 'status-value warning' : 'status-value';
    }

    /**
     * 添加走法历史
     */
    addMoveToHistory(moveNumber, moveText, isRed) {
        const moveItem = document.createElement('div');
        moveItem.classList.add('move-item');
        
        const moveNumberSpan = document.createElement('span');
        moveNumberSpan.className = 'move-number';
        moveNumberSpan.textContent = `${moveNumber}. `;
        
        const moveTextSpan = document.createElement('span');
        moveTextSpan.className = isRed ? 'move-text red' : 'move-text black';
        moveTextSpan.textContent = moveText;
        
        moveItem.appendChild(moveNumberSpan);
        moveItem.appendChild(moveTextSpan);
        
        this.moveHistoryEl.appendChild(moveItem);
        this.moveHistoryEl.scrollTop = this.moveHistoryEl.scrollHeight;
    }

    /**
     * 清空走法历史
     */
    clearMoveHistory() {
        this.moveHistoryEl.innerHTML = '';
    }

    /**
     * 更新棋盘旁的玩家状态
     */
    setPlayerStatus(player, status = null) {
        const isRed = player === 'red';
        const label = isRed ? this.redPlayerLabelEl : this.blackPlayerLabelEl;
        const side = isRed ? '红方' : '黑方';
        const role = status || (isRed ? '玩家' : 'AI');
        label.textContent = `${side}（${role}）`;
    }

    /**
     * 更新计时器
     */
    updateTimer(player, time) {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        const timeText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        if (player === 'red') {
            this.redTimerEl.textContent = timeText;
        } else {
            this.blackTimerEl.textContent = timeText;
        }
    }

    /**
     * 显示或隐藏双方计时器
     */
    setTimerVisibility(visible) {
        this.redTimerEl.classList.toggle('hidden', !visible);
        this.blackTimerEl.classList.toggle('hidden', !visible);
    }
}

/**
 * 游戏结束弹窗
 */
export class GameOverModal {
    constructor() {
        this.modal = document.getElementById('gameOverModal');
        this.icon = document.getElementById('gameOverIcon');
        this.title = document.getElementById('gameOverTitle');
        this.message = document.getElementById('gameOverMessage');
        this.closeBtn = document.getElementById('closeModalBtn');
        this.undoBtn = document.getElementById('modalUndoButton');
        this.actionsEl = this.modal.querySelector('.modal-actions');
        this.undoCallback = null;
    }

    /**
     * 显示弹窗
     * @param {string|null} winner - 胜方：'red'、'black' 或 null（和棋）
     * @param {boolean} canUndo - 是否允许悔棋
     */
    show(winner, canUndo = false) {
        if (winner === 'red') {
            this.icon.textContent = '胜';
            this.title.textContent = '恭喜获胜！';
            this.message.textContent = '红方获得胜利';
        } else if (winner === 'black') {
            this.icon.textContent = '负';
            this.title.textContent = '遗憾落败';
            this.message.textContent = '黑方（AI）获得胜利';
        } else {
            this.icon.textContent = '和';
            this.title.textContent = '和棋';
            this.message.textContent = '双方平局';
        }

        if (this.undoBtn) {
            const showUndo = (winner === null || winner === 'draw') && canUndo;
            this.undoBtn.hidden = !showUndo;
            this.undoBtn.disabled = !showUndo;
        }

        this.actionsEl?.classList.toggle('single-action', !this.undoBtn || this.undoBtn.hidden);
        
        this.modal.hidden = false;
    }

    /**
     * 隐藏弹窗
     */
    hide() {
        this.modal.hidden = true;
    }

    /**
     * 设置关闭回调
     */
    onClose(callback) {
        this.closeBtn.addEventListener('click', callback);
    }

    /**
     * 设置悔棋回调
     */
    onUndo(callback) {
        this.undoCallback = callback;
        this.undoBtn?.addEventListener('click', callback);
    }
}

/**
 * 玩家被将死后的悔棋选择弹窗
 */
export class CheckmateUndoModal {
    constructor() {
        this.modal = document.getElementById('checkmateUndoModal');
        this.undoBtn = document.getElementById('checkmateUndoBtn');
        this.endBtn = document.getElementById('checkmateEndBtn');
        this.undoCallback = null;
        this.endCallback = null;
    }

    show() {
        if (!this.modal) {
            if (window.confirm('红方被将死，是否悔棋？')) {
                this.undoCallback?.();
            } else {
                this.endCallback?.();
            }
            return;
        }

        this.modal.hidden = false;
    }

    hide() {
        if (!this.modal) return;
        this.modal.hidden = true;
    }

    onUndo(callback) {
        this.undoCallback = callback;
        this.undoBtn?.addEventListener('click', callback);
    }

    onEnd(callback) {
        this.endCallback = callback;
        this.endBtn?.addEventListener('click', callback);
    }
}
