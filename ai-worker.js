// Added for the modified chinese-chess project: background time-limited search, 2026.

import { ChessAI } from './ai.js';
import { ChineseChess } from './chess.js';

self.onmessage = async (event) => {
    const {id, difficulty, state} = event.data;

    try {
        const chess = new ChineseChess();
        chess.board = state.board.map((row) => row.slice());
        chess.currentPlayer = state.currentPlayer;
        chess.gameOver = state.gameOver;
        chess.winner = state.winner;
        chess.moveHistory = [];

        const ai = new ChessAI(chess);
        ai.setDifficulty(difficulty);
        const move = await ai.getBestMove();

        self.postMessage({
            id,
            move,
            stats: {
                ...ai.lastSearchStats,
                nodesSearched: ai.nodesSearched,
                pruneCount: ai.pruneCount
            }
        });
    } catch (error) {
        self.postMessage({
            id,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
