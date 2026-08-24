// Added for the modified chinese-chess project: background time-limited search, 2026.

import { ChessAI } from './ai.js?v=20260824-checkmate2';
import { ChineseChess } from './chess.js?v=20260824-checkmate2';

self.onmessage = async (event) => {
    const {id, difficulty, searchOptions, state} = event.data;

    try {
        const chess = new ChineseChess();
        chess.board = state.board.map((row) => row.slice());
        chess.currentPlayer = state.currentPlayer;
        chess.gameOver = state.gameOver;
        chess.winner = state.winner;
        chess.moveHistory = [];

        const ai = new ChessAI(chess);
        ai.setDifficulty(difficulty);
        const move = await ai.getBestMove(searchOptions);

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
