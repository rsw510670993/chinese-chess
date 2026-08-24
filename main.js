// Modified from shibing624/chinese-chess-ai: background search, check/checkmate flow, difficulty controls, optional clock, and hints, 2026.
// 主程序入口

import { ChineseChess } from './chess.js?v=20260824-checkmate2';
import { ChessAIClient } from './ai-client.js?v=20260824-checkmate2';
import { BoardRenderer, CheckmateUndoModal, GameInfoDisplay, GameOverModal } from './ui.js?v=20260824-checkmate2';
import { AudioManager } from './audio.js?v=20260824-checkmate2';

/**
 * 游戏控制器
 */
class GameController {
    constructor() {
        this.chess = new ChineseChess();
        this.ai = new ChessAIClient(this.chess);
        this.renderer = new BoardRenderer('chessboard');
        this.infoDisplay = new GameInfoDisplay();
        this.gameOverModal = new GameOverModal();
        this.checkmateUndoModal = new CheckmateUndoModal();
        this.audioManager = new AudioManager();
        
        this.isAIThinking = false;
        this.isHintSearching = false;
        this.redTime = 900; // 15分钟
        this.blackTime = 900;
        this.timerEnabled = false;
        this.timerInterval = null;
        this.hintCountdownInterval = null;
        this.pendingCheckmateDecision = false;
        
        this.init();
    }

    /**
     * 初始化游戏
     */
    init() {
        // 设置渲染器回调
        this.renderer.onPieceClick = (x, y, piece) => this.handlePieceClick(x, y, piece);
        this.renderer.onMoveClick = (x, y) => this.handleMoveClick(x, y);
        
        // 设置按钮事件
        document.getElementById('newGameBtn').addEventListener('click', () => this.newGame());
        document.getElementById('undoBtn').addEventListener('click', () => this.undoMove());
        document.getElementById('hintBtn').addEventListener('click', () => this.showHint());
        document.getElementById('soundBtn').addEventListener('click', () => this.toggleSound());
        document.getElementById('themeButton').addEventListener('click', () => this.toggleTheme());
        this.initTheme();
        document.getElementById('timerToggle').addEventListener('change', (event) => {
            this.setTimerEnabled(event.target.checked);
        });
        const difficultySelect = document.getElementById('difficultySelect');
        this.ai.setDifficulty(difficultySelect.value);
        difficultySelect.addEventListener('change', (event) => {
            this.ai.setDifficulty(event.target.value);
        });
        
        // 设置游戏结束弹窗
        this.gameOverModal.onClose(() => {
            this.gameOverModal.hide();
            this.newGame();
        });
        this.checkmateUndoModal.onUndo(() => this.undoPlayerCheckmate());
        this.checkmateUndoModal.onEnd(() => {
            this.checkmateUndoModal.hide();
            this.pendingCheckmateDecision = false;
            this.handleGameOver();
        });
        
        // 初始渲染
        this.updateDisplay();
        this.infoDisplay.setTimerVisibility(this.timerEnabled);
    }

    /**
     * 处理棋子点击
     */
    handlePieceClick(x, y, piece) {
        if (this.chess.gameOver || this.isAIThinking || this.isHintSearching) return;

        this.cancelHintCountdown();
        
        // 如果不是当前玩家的棋子，检查是否可以吃子
        if (!this.chess.isCurrentPlayerPiece(piece)) {
            if (this.renderer.selectedPiece) {
                const legalMoves = this.renderer.legalMoves;
                const targetMove = legalMoves.find(m => m.x === x && m.y === y);
                if (targetMove) {
                    this.handleMoveClick(x, y);
                }
            }
            return;
        }
        
        // 选中棋子
        if (this.renderer.selectedPiece && 
            this.renderer.selectedPiece.x === x && 
            this.renderer.selectedPiece.y === y) {
            // 取消选中
            this.renderer.clearSelection();
        } else {
            // 选中新棋子
            this.audioManager.playSelectSound();
            this.renderer.setSelectedPiece(x, y);
            const legalMoves = this.chess.getLegalMoves(x, y);
            this.renderer.setLegalMoves(legalMoves);
        }
        
        this.updateDisplay();
    }

    /**
     * 处理移动点击
     */
    async handleMoveClick(toX, toY) {
        if (!this.renderer.selectedPiece || this.chess.gameOver || this.isAIThinking || this.isHintSearching) return;

        this.cancelHintCountdown();
        
        const fromX = this.renderer.selectedPiece.x;
        const fromY = this.renderer.selectedPiece.y;
        
        // 执行移动
        const moveResult = this.chess.makeMove(fromX, fromY, toX, toY);
        
        // 播放音效
        if (moveResult.captured) {
            this.audioManager.playCaptureSound();
        } else {
            this.audioManager.playMoveSound();
        }
        
        // 更新显示
        this.renderer.setLastMove(moveResult);
        this.renderer.clearSelection();
        
        const moveNumber = Math.floor(this.chess.moveHistory.length / 2);
        this.infoDisplay.addMoveToHistory(moveNumber, this.formatMove(moveResult), moveResult.isRed);
        
        if (this.resolvePostMoveState()) {
            return;
        }

        this.updateDisplay();
        
        // AI 回合
        if (this.chess.currentPlayer === 'black') {
            await this.aiMove();
        }
    }

    /**
     * AI 移动
     */
    async aiMove() {
        this.isAIThinking = true;
        this.infoDisplay.setPlayerStatus('black', '处理中');
        
        try {
            // 获取 AI 的最佳移动
            const aiMove = await this.ai.getBestMove();
            
            if (!aiMove) {
                this.handleGameOver();
                return;
            }
            
            // 执行 AI 移动
            const moveResult = this.chess.makeMove(
                aiMove.from.x, 
                aiMove.from.y, 
                aiMove.to.x, 
                aiMove.to.y
            );
            
            // 播放音效
            if (moveResult.captured) {
                this.audioManager.playCaptureSound();
            } else {
                this.audioManager.playMoveSound();
            }
            
            // 更新显示
            this.renderer.setLastMove(moveResult);
            
            const moveNumber = Math.floor(this.chess.moveHistory.length / 2);
            this.infoDisplay.addMoveToHistory(moveNumber, this.formatMove(moveResult), moveResult.isRed);
            
            if (this.resolvePostMoveState()) {
                return;
            }

            this.updateDisplay();
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('AI 移动错误:', error);
            }
        } finally {
            this.isAIThinking = false;
            this.infoDisplay.setPlayerStatus('black');
        }
    }

    /**
     * 更新显示
     */
    updateDisplay() {
        this.renderer.render(this.chess.board, this.chess);
        this.infoDisplay.updateCurrentTurn(this.chess.currentPlayer);
        this.infoDisplay.updateMoveCount(this.chess.moveHistory.length);

        const checkedPlayer = !this.chess.gameOver && this.chess.isInCheck(this.chess.currentPlayer)
            ? this.chess.currentPlayer
            : null;

        if (this.pendingCheckmateDecision) {
            this.infoDisplay.setPlayerStatus('red', '被将死');
        } else if (!this.isHintSearching) {
            this.infoDisplay.setPlayerStatus('red', checkedPlayer === 'red' ? '被将军' : null);
        }
        if (!this.isAIThinking) {
            this.infoDisplay.setPlayerStatus('black', checkedPlayer === 'black' ? '被将军' : null);
        }

        if (this.pendingCheckmateDecision) {
            this.infoDisplay.updateGameStatus('红方被将死');
        } else if (this.chess.gameOver) {
            this.infoDisplay.updateGameStatus('游戏结束');
        } else if (checkedPlayer) {
            const side = checkedPlayer === 'red' ? '红方' : '黑方';
            this.infoDisplay.updateGameStatus(`${side}被将军`);
        } else {
            this.infoDisplay.updateGameStatus('进行中');
        }
    }

    /**
     * 处理一步棋后的将军和将死状态。
     */
    resolvePostMoveState() {
        if (this.chess.gameOver) {
            this.handleGameOver();
            return true;
        }

        const checkState = this.chess.getCheckState(this.chess.currentPlayer);
        if (!checkState.checkmate) return false;

        this.chess.gameOver = true;
        this.chess.winner = this.chess.currentPlayer === 'red' ? 'black' : 'red';

        if (this.chess.currentPlayer === 'red') {
            this.handlePlayerCheckmate();
        } else {
            // AI 被将死时直接结束对局。
            this.handleGameOver();
        }

        return true;
    }

    /**
     * 玩家被将死时暂停对局并询问是否悔棋。
     */
    handlePlayerCheckmate() {
        this.pendingCheckmateDecision = true;
        this.stopTimer();
        this.renderer.clearSelection();
        this.updateDisplay();
        this.checkmateUndoModal.show();
    }

    /**
     * 从玩家被将死的局面撤销 AI 和玩家最近各一步。
     */
    undoPlayerCheckmate() {
        this.checkmateUndoModal.hide();
        this.pendingCheckmateDecision = false;

        const result = this.chess.undoMove();
        if (!result) {
            this.handleGameOver();
            return;
        }

        this.audioManager.playUndoSound();
        this.renderer.clearSelection();
        this.renderer.setLastMove(null);
        this.rebuildMoveHistory();
        this.updateDisplay();

        if (this.timerEnabled) {
            this.startTimer();
        }
    }

    /**
     * 新游戏
     */
    newGame() {
        this.audioManager.playNewGameSound();

        this.ai.cancelSearch();
        this.cancelHintCountdown();
        this.checkmateUndoModal.hide();
        this.pendingCheckmateDecision = false;
        
        this.chess.reset();
        this.renderer.clearSelection();
        this.renderer.setLastMove(null);
        this.infoDisplay.clearMoveHistory();
        this.infoDisplay.setPlayerStatus('black');
        this.infoDisplay.setPlayerStatus('red');
        
        this.redTime = 900;
        this.blackTime = 900;
        this.infoDisplay.updateTimer('red', this.redTime);
        this.infoDisplay.updateTimer('black', this.blackTime);
        
        this.isAIThinking = false;
        this.isHintSearching = false;
        
        this.updateDisplay();
        if (this.timerEnabled) {
            this.startTimer();
        } else {
            this.stopTimer();
        }
    }

    /**
     * 悔棋
     */
    undoMove() {
        // 检查游戏状态
        if (this.isAIThinking || this.chess.gameOver) {
            console.log('无法悔棋：游戏状态不允许');
            return;
        }
        
        // 调用 chess.js 中的 undoMove 方法（会撤销两步）
        const result = this.chess.undoMove();
        
        if (!result) {
            console.log('悔棋失败');
            return;
        }

        this.cancelHintCountdown();
        
        // 播放悔棋音效
        this.audioManager.playUndoSound();
        
        // 清除选择和最后一步标记
        this.renderer.clearSelection();
        this.renderer.setLastMove(null);
        
        // 重新构建走法历史显示
        this.rebuildMoveHistory();
        
        // 更新显示
        this.updateDisplay();
        
        console.log('悔棋成功');
    }

    /**
     * 重新构建走法历史显示
     */
    rebuildMoveHistory() {
        this.infoDisplay.clearMoveHistory();
        
        const moves = this.chess.moveHistory;
        for (let i = 0; i < moves.length; i++) {
            const moveNumber = Math.floor(i / 2) + 1;
            const isRed = i % 2 === 0;
            const moveText = this.formatMove(moves[i]);
            this.infoDisplay.addMoveToHistory(moveNumber, moveText, isRed);
        }
    }

    /**
     * 显示提示
     */
    async showHint() {
        if (this.chess.gameOver || this.chess.currentPlayer !== 'red' || this.isAIThinking || this.isHintSearching) return;

        this.cancelHintCountdown();
        this.renderer.clearSelection();
        this.updateDisplay();
        this.isHintSearching = true;
        this.infoDisplay.setPlayerStatus('red', '检索提示中');
        
        try {
            // 获取AI建议
            const hintMove = await this.ai.getBestMove({purpose: 'hint'});
            
            if (hintMove && hintMove.from && hintMove.to) {
                // 选中推荐棋子，使玩家可以直接按提示落子
                this.renderer.setSelectedPiece(hintMove.from.x, hintMove.from.y);
                this.renderer.setLegalMoves(this.chess.getLegalMoves(hintMove.from.x, hintMove.from.y));
                this.renderer.setSuggestedMove(hintMove);
                this.updateDisplay();
                this.startHintCountdown(hintMove, 3);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('提示错误:', error);
            }
        } finally {
            this.isHintSearching = false;
            this.updateDisplay();
        }
    }

    /**
     * 启动提示自动消失倒计时
     */
    startHintCountdown(hintMove, durationSeconds) {
        this.cancelHintCountdown();

        const countdownEl = document.getElementById('hintCountdown');
        const expiresAt = Date.now() + durationSeconds * 1000;
        const updateCountdown = () => {
            const remaining = Math.ceil((expiresAt - Date.now()) / 1000);

            if (remaining <= 0) {
                this.cancelHintCountdown();
                if (this.renderer.suggestedMove === hintMove) {
                    this.renderer.clearSelection();
                    this.updateDisplay();
                }
                return;
            }

            countdownEl.textContent = `${remaining}秒`;
            countdownEl.classList.remove('hidden');
        };

        updateCountdown();
        this.hintCountdownInterval = setInterval(updateCountdown, 200);
    }

    /**
     * 停止提示倒计时，但保留当前棋盘状态供调用方处理
     */
    cancelHintCountdown() {
        if (this.hintCountdownInterval) {
            clearInterval(this.hintCountdownInterval);
            this.hintCountdownInterval = null;
        }

        const countdownEl = document.getElementById('hintCountdown');
        if (countdownEl) {
            countdownEl.textContent = '';
            countdownEl.classList.add('hidden');
        }
    }

    /**
     * 切换音效
     */
    toggleSound() {
        const enabled = this.audioManager.toggle();
        const soundBtn = document.getElementById('soundBtn');
        soundBtn.classList.toggle('is-muted', !enabled);
        soundBtn.textContent = enabled ? '音效：开' : '音效：关';
        if (enabled) {
            this.audioManager.playSelectSound();
        }
    }

    /**
     * 切换夜间模式
     */
    toggleTheme() {
        const dark = !document.body.classList.contains('dark');
        document.body.classList.toggle('dark', dark);
        const themeButton = document.getElementById('themeButton');
        themeButton.setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
        themeButton.title = dark ? '切换浅色模式' : '切换深色模式';
        try {
            localStorage.setItem('chinese-chess-theme', dark ? 'dark' : 'light');
        } catch {}
    }

    /**
     * 初始化夜间模式
     */
    initTheme() {
        try {
            const dark = localStorage.getItem('chinese-chess-theme') === 'dark';
            document.body.classList.toggle('dark', dark);
            const themeButton = document.getElementById('themeButton');
            themeButton.setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
            themeButton.title = dark ? '切换浅色模式' : '切换深色模式';
        } catch {}
    }

    /**
     * 格式化移动为文本
     */
    formatMove(move) {
        const pieceNames = {
            'K': '帅', 'k': '将',
            'A': '仕', 'a': '士',
            'B': '相', 'b': '象',
            'N': '马', 'n': '马',
            'R': '车', 'r': '车',
            'C': '炮', 'c': '炮',
            'P': '兵', 'p': '卒'
        };
        
        const pieceName = pieceNames[move.piece] || move.piece;
        const fromPos = `(${move.from.x},${move.from.y})`;
        const toPos = `(${move.to.x},${move.to.y})`;
        
        return `${pieceName}${fromPos}→${toPos}`;
    }

    /**
     * 处理游戏结束
     */
    handleGameOver() {
        this.ai.cancelSearch();
        this.stopTimer();
        
        // 播放游戏结束音效
        if (this.chess.winner === 'red') {
            this.audioManager.playVictorySound();
        } else if (this.chess.winner === 'black') {
            this.audioManager.playDefeatSound();
        } else {
            this.audioManager.playDrawSound();
        }
        
        if (this.chess.winner) {
            this.gameOverModal.show(this.chess.winner);
        } else {
            this.gameOverModal.show('draw');
        }
        
        this.updateDisplay();
    }

    /**
     * 开启或关闭对局计时
     */
    setTimerEnabled(enabled) {
        this.timerEnabled = enabled;
        this.infoDisplay.setTimerVisibility(enabled);

        if (enabled && !this.chess.gameOver) {
            this.startTimer();
        } else {
            this.stopTimer();
        }
    }

    /**
     * 启动计时器
     */
    startTimer() {
        this.stopTimer();

        if (!this.timerEnabled || this.chess.gameOver) {
            return;
        }
        
        this.timerInterval = setInterval(() => {
            if (!this.timerEnabled || this.chess.gameOver) {
                this.stopTimer();
                return;
            }
            
            if (this.chess.currentPlayer === 'red' && !this.isAIThinking) {
                this.redTime--;
                this.infoDisplay.updateTimer('red', this.redTime);
                
                if (this.redTime <= 0) {
                    this.chess.gameOver = true;
                    this.chess.winner = 'black';
                    this.handleGameOver();
                }
            } else if (this.chess.currentPlayer === 'black' || this.isAIThinking) {
                // AI思考时也要计时黑方
                this.blackTime--;
                this.infoDisplay.updateTimer('black', this.blackTime);
                
                if (this.blackTime <= 0) {
                    this.chess.gameOver = true;
                    this.chess.winner = 'red';
                    this.handleGameOver();
                }
            }
        }, 1000);
    }

    /**
     * 停止计时器
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}

// 启动游戏
document.addEventListener('DOMContentLoaded', () => {
    new GameController();
});
