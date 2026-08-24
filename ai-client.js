// Added for the modified chinese-chess project: non-blocking Web Worker search, 2026.

import { ChessAI, DIFFICULTY_CONFIGS, getSearchProfile } from './ai.js?v=20260824-checkmate2';

function createAbortError() {
    const error = new Error('Search cancelled');
    error.name = 'AbortError';
    return error;
}

/**
 * 在独立线程运行搜索，并在 Worker 不可用时提供有限深度回退。
 */
export class ChessAIClient {
    constructor(chess) {
        this.chess = chess;
        this.difficulty = 'standard';
        this.activeSearch = null;
        this.requestId = 0;
    }

    setDifficulty(difficulty) {
        if (!Object.prototype.hasOwnProperty.call(DIFFICULTY_CONFIGS, difficulty)) {
            return false;
        }

        this.difficulty = difficulty;
        return true;
    }

    async getBestMove({purpose = 'move'} = {}) {
        this.cancelSearch();

        const searchOptions = getSearchProfile(this.difficulty, purpose, {
            moveCount: this.chess.moveHistory.length
        });

        if (typeof Worker === 'undefined') {
            return this.getFallbackMove(searchOptions);
        }

        const id = ++this.requestId;
        let worker;
        try {
            worker = new Worker(new URL('./ai-worker.js?v=20260824-checkmate2', import.meta.url), {type: 'module'});
        } catch (error) {
            console.warn('无法创建后台搜索线程，改用轻量回退搜索:', error);
            return this.getFallbackMove(searchOptions);
        }

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(guardTimer);
                worker.terminate();
                if (this.activeSearch?.id === id) {
                    this.activeSearch = null;
                }
            };
            const fallback = (reason) => {
                console.warn('后台搜索不可用，改用轻量回退搜索:', reason);
                cleanup();
                this.getFallbackMove(searchOptions).then(resolve, reject);
            };
            const guardTimer = setTimeout(() => {
                fallback('搜索线程超时');
            }, searchOptions.timeLimitMs + 2500);

            this.activeSearch = {id, worker, reject, cleanup};

            worker.onmessage = (event) => {
                if (event.data?.id !== id) return;

                cleanup();
                if (event.data.error) {
                    reject(new Error(event.data.error));
                    return;
                }

                const stats = event.data.stats;
                console.log('搜索节点数:', stats.nodesSearched);
                console.log('剪枝次数:', stats.pruneCount);
                console.log('搜索时间:', stats.elapsedMs, 'ms');
                console.log('完成深度:', stats.depthReached);
                resolve(event.data.move);
            };

            worker.onerror = (event) => {
                event.preventDefault?.();
                fallback(event.message || '搜索线程加载失败');
            };

            worker.postMessage({
                id,
                difficulty: this.difficulty,
                searchOptions,
                state: {
                    board: this.chess.board.map((row) => row.slice()),
                    currentPlayer: this.chess.currentPlayer,
                    gameOver: this.chess.gameOver,
                    winner: this.chess.winner
                }
            });
        });
    }

    cancelSearch() {
        if (!this.activeSearch) return;

        const {reject, cleanup} = this.activeSearch;
        cleanup();
        reject(createAbortError());
    }

    async getFallbackMove(searchOptions = getSearchProfile(this.difficulty)) {
        const ai = new ChessAI(this.chess);
        ai.setDifficulty(this.difficulty);

        // 极少数不支持 Worker 的浏览器也要保持可用，回退搜索最多两层。
        return ai.getBestMove({
            ...searchOptions,
            maxDepth: Math.min(2, searchOptions.maxDepth),
            timeLimitMs: Math.min(650, searchOptions.timeLimitMs)
        });
    }
}
