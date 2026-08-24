// Modified from shibing624/chinese-chess-ai: optional clock and inline player status support, 2026.
// 主程序入口

import { ChineseChess } from './chess.js';
import { ChessAI } from './ai.js';
import { BoardRenderer, GameInfoDisplay, GameOverModal } from './ui.js';
import { AudioManager } from './audio.js';

/**
 * 游戏控制器
 */
class GameController {
    constructor() {
        this.chess = new ChineseChess();
        this.ai = new ChessAI(this.chess);
        this.renderer = new BoardRenderer('chessboard');
        this.infoDisplay = new GameInfoDisplay();
        this.gameOverModal = new GameOverModal();
        this.audioManager = new AudioManager();
        
        this.isAIThinking = false;
        this.isHintSearching = false;
        this.redTime = 900; // 15分钟
        this.blackTime = 900;
        this.timerEnabled = false;
        this.timerInterval = null;
        
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
        document.getElementById('timerToggle').addEventListener('change', (event) => {
            this.setTimerEnabled(event.target.checked);
        });
        
        // 设置游戏结束弹窗
        this.gameOverModal.onClose(() => {
            this.gameOverModal.hide();
            this.newGame();
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
        
        this.updateDisplay();
        
        // 检查游戏是否结束
        if (this.chess.gameOver) {
            this.handleGameOver();
            return;
        }
        
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
            
            this.updateDisplay();
            
            // 检查游戏是否结束
            if (this.chess.gameOver) {
                this.handleGameOver();
            }
            
        } catch (error) {
            console.error('AI 移动错误:', error);
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
        
        if (this.chess.gameOver) {
            this.infoDisplay.updateGameStatus('游戏结束');
        } else {
            this.infoDisplay.updateGameStatus('进行中');
        }
    }

    /**
     * 新游戏
     */
    newGame() {
        this.audioManager.playNewGameSound();
        
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

        this.isHintSearching = true;
        this.infoDisplay.setPlayerStatus('red', '检索提示中');
        
        try {
            // 获取AI建议
            const hintMove = await this.ai.getBestMove();
            
            if (hintMove && hintMove.from && hintMove.to) {
                // 高亮提示的棋子和可移动位置
                this.renderer.setSelectedPiece(hintMove.from.x, hintMove.from.y);
                const legalMoves = this.chess.getLegalMoves(hintMove.from.x, hintMove.from.y);
                this.renderer.setLegalMoves(legalMoves);
                this.updateDisplay();
                
                // 3秒后清除高亮，但保持正常的游戏状态
                setTimeout(() => {
                    // 只有当前仍然是提示状态时才清除（避免用户已经选择了其他棋子）
                    if (this.renderer.selectedPiece && 
                        this.renderer.selectedPiece.x === hintMove.from.x && 
                        this.renderer.selectedPiece.y === hintMove.from.y) {
                        this.renderer.clearSelection();
                        this.updateDisplay();
                    }
                }, 3000);
            }
        } catch (error) {
            console.error('提示错误:', error);
        } finally {
            this.isHintSearching = false;
            this.infoDisplay.setPlayerStatus('red');
        }
    }

    /**
     * 切换音效
     */
    toggleSound() {
        const enabled = this.audioManager.toggle();
        const soundBtn = document.getElementById('soundBtn');
        const icon = soundBtn.querySelector('i');
        
        if (enabled) {
            icon.className = 'fas fa-volume-up';
            soundBtn.classList.remove('opacity-50');
            this.audioManager.playSelectSound();
        } else {
            icon.className = 'fas fa-volume-mute';
            soundBtn.classList.add('opacity-50');
        }
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
