// Modified from shibing624/chinese-chess-ai: time-limited iterative search and varied near-best move selection, 2026.
// AI 对弈模块 - 极小化极大算法 + Alpha-Beta剪枝

export const DIFFICULTY_CONFIGS = Object.freeze({
    fast: Object.freeze({
        maxDepth: 1,
        timeLimitMs: 180,
        hintTimeLimitMs: 650,
        randomCandidateLimit: 5,
        maxRandomScoreGap: 220,
        randomTemperature: 150
    }),
    standard: Object.freeze({
        maxDepth: 2,
        timeLimitMs: 650,
        hintTimeLimitMs: 1600,
        randomCandidateLimit: 5,
        maxRandomScoreGap: 160,
        randomTemperature: 105
    }),
    hard: Object.freeze({
        maxDepth: 4,
        timeLimitMs: 2200,
        hintTimeLimitMs: 7000,
        randomCandidateLimit: 5,
        maxRandomScoreGap: 120,
        randomTemperature: 75
    }),
    master: Object.freeze({
        maxDepth: 6,
        timeLimitMs: 5000,
        hintTimeLimitMs: 10000,
        randomCandidateLimit: 5,
        maxRandomScoreGap: 90,
        randomTemperature: 50
    })
});

export const DIFFICULTY_LEVELS = Object.freeze(
    Object.fromEntries(
        Object.entries(DIFFICULTY_CONFIGS).map(([name, config]) => [name, config.maxDepth])
    )
);

/**
 * 提示比同档对手多搜索一层，并缩小随机范围，使建议整体更可靠。
 */
export function getSearchProfile(difficulty, purpose = 'move') {
    const config = DIFFICULTY_CONFIGS[difficulty] ?? DIFFICULTY_CONFIGS.standard;

    if (purpose !== 'hint') {
        return {
            maxDepth: config.maxDepth,
            timeLimitMs: config.timeLimitMs,
            randomCandidateLimit: config.randomCandidateLimit,
            maxRandomScoreGap: config.maxRandomScoreGap,
            randomTemperature: config.randomTemperature
        };
    }

    return {
        maxDepth: config.maxDepth + 1,
        timeLimitMs: config.hintTimeLimitMs,
        randomCandidateLimit: Math.min(3, config.randomCandidateLimit),
        maxRandomScoreGap: Math.round(config.maxRandomScoreGap * 0.75),
        randomTemperature: Math.max(30, Math.round(config.randomTemperature * 0.65))
    };
}

const DEEP_SEARCH_CANDIDATE_LIMIT = 8;
const DEEP_SEARCH_SCORE_GAP = 500;

class SearchTimeoutError extends Error {
    constructor() {
        super('Search time limit reached');
        this.name = 'SearchTimeoutError';
    }
}

/**
 * 从评分接近最优的前五个候选中随机选择走法。
 * 120 分低于一个兵的基础价值，避免为了随机性选择明显亏子的走法。
 */
export function selectVariedMove(scoredMoves, random = Math.random, options = {}) {
    if (!Array.isArray(scoredMoves) || scoredMoves.length === 0) {
        return null;
    }

    const candidateLimit = options.candidateLimit ?? 5;
    const maxScoreGap = options.maxScoreGap ?? 120;
    const temperature = Math.max(1, options.temperature ?? 80);
    const topCandidates = scoredMoves
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, candidateLimit);
    const bestScore = topCandidates[0].score;
    const nearBestCandidates = topCandidates.filter(
        (candidate) => bestScore - candidate.score <= maxScoreGap
    );
    const randomValue = Number(random());
    const normalizedRandom = Number.isFinite(randomValue)
        ? Math.min(Math.max(randomValue, 0), 0.999999999999)
        : 0;
    const weights = nearBestCandidates.map(
        (candidate) => Math.exp((candidate.score - bestScore) / temperature)
    );
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    let threshold = normalizedRandom * totalWeight;

    for (let i = 0; i < nearBestCandidates.length; i++) {
        threshold -= weights[i];
        if (threshold < 0) {
            return nearBestCandidates[i].move;
        }
    }

    return nearBestCandidates[nearBestCandidates.length - 1].move;
}

/**
 * 象棋 AI 类 - 使用极小化极大算法 + Alpha-Beta剪枝
 * 
 * 算法说明：
 * 1. 极小化极大算法：假设对手总是选择对自己最有利的走法
 * 2. Alpha-Beta剪枝：通过剪枝减少搜索节点，提高效率
 * 3. 搜索深度：由界面难度选项控制
 * 4. 评估函数：综合考虑棋子价值、位置价值、机动性、控制力等因素
 */
export class ChessAI {
    constructor(chess) {
        this.chess = chess;
        this.difficulty = 'standard';
        this.maxDepth = DIFFICULTY_LEVELS[this.difficulty];
        this.thinkingTime = 0; // 仅让出一次事件循环，确保处理状态先完成绘制
        this.nodesSearched = 0; // 搜索节点数统计
        this.pruneCount = 0; // 剪枝次数统计
        this.searchDeadline = Infinity;
        this.lastSearchStats = null;
        
        // 棋子基础价值表（参考专业象棋引擎）
        this.pieceValues = {
            'K': 10000, 'k': 10000,  // 将/帅（无价）
            'R': 1000, 'r': 1000,    // 车（最强子力）
            'C': 550, 'c': 550,      // 炮（中局强力）
            'N': 400, 'n': 400,      // 马（灵活机动）
            'B': 250, 'b': 250,      // 相/象（防守）
            'A': 250, 'a': 250,      // 士/仕（防守）
            'P': 150, 'p': 150       // 兵/卒（过河后价值提升）
        };
        
        // 位置价值表 - 车（控制要道）
        this.rookPositionValue = [
            [206, 208, 207, 213, 214, 213, 207, 208, 206],
            [206, 212, 209, 216, 233, 216, 209, 212, 206],
            [206, 208, 207, 214, 216, 214, 207, 208, 206],
            [206, 213, 213, 216, 216, 216, 213, 213, 206],
            [208, 211, 211, 214, 215, 214, 211, 211, 208],
            [208, 212, 212, 214, 215, 214, 212, 212, 208],
            [204, 209, 204, 212, 214, 212, 204, 209, 204],
            [198, 208, 204, 212, 212, 212, 204, 208, 198],
            [200, 208, 206, 212, 200, 212, 206, 208, 200],
            [194, 206, 204, 212, 200, 212, 204, 206, 194]
        ];
        
        // 位置价值表 - 炮（中路优势）
        this.cannonPositionValue = [
            [100, 100,  96, 91,  90,  91,  96, 100, 100],
            [ 98,  98,  96, 92,  89,  92,  96,  98,  98],
            [ 97,  97,  96, 91,  92,  91,  96,  97,  97],
            [ 96,  99,  99, 98, 100,  98,  99,  99,  96],
            [ 96,  96,  96, 96, 100,  96,  96,  96,  96],
            [ 95,  96,  99, 96, 100,  96,  99,  96,  95],
            [ 96,  96,  96, 96,  96,  96,  96,  96,  96],
            [ 97,  96, 100, 99, 101,  99, 100,  96,  97],
            [ 96,  97,  98, 98,  98,  98,  98,  97,  96],
            [ 96,  96,  97, 99,  99,  99,  97,  96,  96]
        ];
        
        // 位置价值表 - 马（中心控制）
        this.knightPositionValue = [
            [ 90,  90,  90,  96,  90,  96,  90,  90,  90],
            [ 90,  96, 103,  97,  94,  97, 103,  96,  90],
            [ 92,  98,  99, 103,  99, 103,  99,  98,  92],
            [ 93, 108, 100, 107, 100, 107, 100, 108,  93],
            [ 90, 100,  99, 103, 104, 103,  99, 100,  90],
            [ 90,  98, 101, 102, 103, 102, 101,  98,  90],
            [ 92,  94,  98,  95,  98,  95,  98,  94,  92],
            [ 93,  92,  94,  95,  92,  95,  94,  92,  93],
            [ 85,  90,  92,  93,  78,  93,  92,  90,  85],
            [ 88,  85,  90,  88,  90,  88,  90,  85,  88]
        ];
        
        // 位置价值表 - 兵/卒（过河后价值大增）
        this.pawnPositionValue = [
            [  9,   9,   9,  11,  13,  11,   9,   9,   9],
            [ 19,  24,  34,  42,  44,  42,  34,  24,  19],
            [ 19,  24,  32,  37,  37,  37,  32,  24,  19],
            [ 19,  23,  27,  29,  30,  29,  27,  23,  19],
            [ 14,  18,  20,  27,  29,  27,  20,  18,  14],
            [  7,   0,  13,   0,  16,   0,  13,   0,   7],
            [  7,   0,   7,   0,  15,   0,   7,   0,   7],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0]
        ];
        
        // 位置价值表 - 将/帅（九宫格内安全）
        this.kingPositionValue = [
            [  0,   0,   0,   8,   8,   8,   0,   0,   0],
            [  0,   0,   0,   9,   9,   9,   0,   0,   0],
            [  0,   0,   0,  10,  10,  10,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,  -1,  -1,  -1,   0,   0,   0],
            [  0,   0,   0,  -2,  -2,  -2,   0,   0,   0],
            [  0,   0,   0,  -3,  -3,  -3,   0,   0,   0]
        ];
        
        // 位置价值表 - 士/仕（九宫格防守）
        this.advisorPositionValue = [
            [  0,   0,   0,  20,   0,  20,   0,   0,   0],
            [  0,   0,   0,   0,  23,   0,   0,   0,   0],
            [  0,   0,   0,  20,   0,  20,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,   0,  20,   0,  20,   0,   0,   0],
            [  0,   0,   0,   0,  23,   0,   0,   0,   0],
            [  0,   0,   0,  20,   0,  20,   0,   0,   0]
        ];
        
        // 位置价值表 - 相/象（防守要位）
        this.bishopPositionValue = [
            [  0,   0,  20,   0,   0,   0,  20,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [ 18,   0,   0,  20,  23,  20,   0,   0,  18],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,  20,   0,   0,   0,  20,   0,   0],
            [  0,   0,  20,   0,   0,   0,  20,   0,   0],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [ 18,   0,   0,  20,  23,  20,   0,   0,  18],
            [  0,   0,   0,   0,   0,   0,   0,   0,   0],
            [  0,   0,  20,   0,   0,   0,  20,   0,   0]
        ];
    }

    /**
     * 设置检索难度
     */
    setDifficulty(difficulty) {
        if (!Object.prototype.hasOwnProperty.call(DIFFICULTY_CONFIGS, difficulty)) {
            return false;
        }

        this.difficulty = difficulty;
        this.maxDepth = DIFFICULTY_LEVELS[difficulty];
        return true;
    }

    /**
     * AI 思考并返回最佳移动
     * 主入口函数
     */
    async getBestMove(options = {}) {
        // 先让出事件循环，确保处理状态完成绘制
        await this.sleep(this.thinkingTime);
        
        // 重置统计
        this.nodesSearched = 0;
        this.pruneCount = 0;
        
        console.log('=== AI 开始思考 ===');
        const config = DIFFICULTY_CONFIGS[this.difficulty];
        const maxDepth = options.maxDepth ?? config.maxDepth;
        const timeLimitMs = options.timeLimitMs ?? config.timeLimitMs;
        const variation = {
            candidateLimit: options.randomCandidateLimit ?? config.randomCandidateLimit,
            maxScoreGap: options.maxRandomScoreGap ?? config.maxRandomScoreGap,
            temperature: options.randomTemperature ?? config.randomTemperature
        };

        console.log('最大搜索深度:', maxDepth);
        console.log('思考时间上限:', timeLimitMs, 'ms');
        
        const startTime = Date.now();
        
        const bestMove = this.iterativeDeepeningSearch({
            maxDepth,
            timeLimitMs,
            random: options.random ?? Math.random,
            variation
        });
        
        const endTime = Date.now();
        const timeUsed = endTime - startTime;
        
        console.log('搜索节点数:', this.nodesSearched);
        console.log('剪枝次数:', this.pruneCount);
        console.log('搜索时间:', timeUsed, 'ms');
        console.log('完成深度:', this.lastSearchStats?.depthReached ?? 0);
        console.log('=== AI 思考完成 ===');
        
        return bestMove;
    }

    /**
     * Alpha-Beta 剪枝搜索（根节点）
     * 返回最佳走法
     */
    alphaBetaSearch() {
        const profile = getSearchProfile(this.difficulty);
        return this.iterativeDeepeningSearch({
            maxDepth: this.maxDepth,
            timeLimitMs: Infinity,
            random: Math.random,
            variation: {
                candidateLimit: profile.randomCandidateLimit,
                maxScoreGap: profile.maxRandomScoreGap,
                temperature: profile.randomTemperature
            }
        });
    }

    /**
     * 在固定时间内逐层加深。超时的层会被丢弃，只使用最后完整层的评分。
     */
    iterativeDeepeningSearch({maxDepth, timeLimitMs, random, variation}) {
        const allMoves = this.sortMoves(this.getAllPossibleMoves());

        if (allMoves.length === 0) {
            console.log('无可用走法');
            this.lastSearchStats = {
                depthReached: 0,
                elapsedMs: 0,
                timedOut: false,
                candidatesSearched: 0
            };
            return null;
        }

        const startedAt = Date.now();
        this.searchDeadline = Number.isFinite(timeLimitMs)
            ? startedAt + Math.max(1, timeLimitMs)
            : Infinity;

        let searchMoves = allMoves;
        let completedScores = null;
        let depthReached = 0;
        let timedOut = false;

        for (let depth = 1; depth <= maxDepth; depth++) {
            try {
                const iterationScores = this.scoreRootMoves(searchMoves, depth);
                completedScores = iterationScores;
                depthReached = depth;

                // 前两层覆盖全部走法；更深层只深化浅层表现较好的候选。
                if (depth >= 2) {
                    const nextCandidateLimit = depth >= 4
                        ? 2
                        : depth === 3
                            ? 6
                            : DEEP_SEARCH_CANDIDATE_LIMIT;
                    searchMoves = this.buildDeepSearchCandidates(iterationScores, nextCandidateLimit);
                } else {
                    searchMoves = iterationScores.map((candidate) => candidate.move);
                }
            } catch (error) {
                if (!(error instanceof SearchTimeoutError)) {
                    throw error;
                }
                timedOut = true;
                break;
            }
        }

        const selectedMove = completedScores
            ? selectVariedMove(completedScores, random, variation)
            : allMoves[Math.floor(Math.min(Math.max(Number(random()) || 0, 0), 0.999999) * Math.min(3, allMoves.length))];

        this.lastSearchStats = {
            depthReached,
            elapsedMs: Date.now() - startedAt,
            timedOut,
            candidatesSearched: completedScores?.length ?? 0
        };
        this.searchDeadline = Infinity;

        return selectedMove;
    }

    /**
     * 使用完整窗口为本轮候选评分；只有整轮完成后评分才会生效。
     */
    scoreRootMoves(moves, depth) {
        const scoredMoves = [];

        for (const move of moves) {
            this.checkSearchDeadline(true);
            const moveResult = this.chess.makeMove(
                move.from.x, move.from.y,
                move.to.x, move.to.y
            );

            try {
                const score = -this.alphaBeta(depth - 1, -Infinity, Infinity);
                scoredMoves.push({move, score});
            } finally {
                this.chess.undoSingleMove(moveResult);
            }
        }

        return scoredMoves.sort((a, b) => b.score - a.score);
    }

    /**
     * 深层搜索只保留浅层排名靠前且分差合理的候选。
     */
    buildDeepSearchCandidates(scoredMoves, candidateLimit) {
        const rankedMoves = scoredMoves.slice().sort((a, b) => b.score - a.score);
        const bestScore = rankedMoves[0].score;
        let candidates = rankedMoves
            .filter((candidate) => bestScore - candidate.score <= DEEP_SEARCH_SCORE_GAP)
            .slice(0, candidateLimit);

        // 浅层至少深化前三名；第五层以后保留两名，仍有变化但更偏向强招。
        const minimumCandidates = Math.min(candidateLimit, 3, rankedMoves.length);
        if (candidates.length < minimumCandidates) {
            candidates = rankedMoves.slice(0, minimumCandidates);
        }

        return candidates.map((candidate) => candidate.move);
    }

    checkSearchDeadline(force = false) {
        if ((force || (this.nodesSearched & 127) === 0) && Date.now() >= this.searchDeadline) {
            throw new SearchTimeoutError();
        }
    }

    /**
     * Alpha-Beta 剪枝核心算法（递归）
     * 
     * @param {number} depth - 剩余搜索深度
     * @param {number} alpha - Alpha 值（当前玩家的最好选择）
     * @param {number} beta - Beta 值（对手的最好选择）
     * @returns {number} 局面评分
     */
    alphaBeta(depth, alpha, beta) {
        this.nodesSearched++;
        this.checkSearchDeadline();
        
        // 终止条件：达到最大深度或游戏结束
        if (depth === 0 || this.chess.gameOver) {
            return this.evaluate();
        }
        
        // 获取所有可能的走法
        const allMoves = this.getAllPossibleMoves();
        
        if (allMoves.length === 0) {
            // 无子可走，判负
            return -10000;
        }
        
        // 移动排序（提高剪枝效率）
        const sortedMoves = this.sortMoves(allMoves);
        
        // 遍历所有走法
        for (const move of sortedMoves) {
            // 执行移动
            const moveResult = this.chess.makeMove(
                move.from.x, move.from.y, 
                move.to.x, move.to.y
            );

            let score;
            try {
                // 递归搜索（极小化对手的得分）
                score = -this.alphaBeta(depth - 1, -beta, -alpha);
            } finally {
                // 超时也必须完整恢复棋盘。
                this.chess.undoSingleMove(moveResult);
            }
            
            // Beta 剪枝：如果当前分数已经大于等于 beta，
            // 说明对手不会选择这条路径，可以直接剪枝
            if (score >= beta) {
                this.pruneCount++;
                return beta;
            }
            
            // 更新 alpha 值（当前玩家的最好选择）
            alpha = Math.max(alpha, score);
        }
        
        return alpha;
    }

    /**
     * 评估函数 - 评估当前局面的优劣
     * 返回值：正数表示当前玩家优势，负数表示劣势
     */
    evaluate() {
        let score = 0;
        
        // 1. 物质评估：棋子价值 + 位置价值
        score += this.evaluateMaterial();
        
        // 2. 机动性评估：可移动的位置数量
        score += this.evaluateMobility();
        
        // 3. 控制力评估：威胁对方棋子
        score += this.evaluateControl();
        
        // 4. 将军威胁评估
        score += this.evaluateCheck();
        
        // 5. 防守评估：保护己方将/帅
        score += this.evaluateDefense();
        
        return score;
    }

    /**
     * 物质评估：棋子价值 + 位置价值
     */
    evaluateMaterial() {
        let score = 0;
        const currentPlayer = this.chess.currentPlayer;
        
        // 遍历棋盘上的所有棋子
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const piece = this.chess.getPiece(x, y);
                
                if (piece) {
                    const pieceScore = this.evaluatePiece(piece, x, y);
                    
                    // 判断是否为当前玩家的棋子
                    const isCurrentPlayer = this.chess.isCurrentPlayerPiece(piece);
                    
                    if (isCurrentPlayer) {
                        score += pieceScore;
                    } else {
                        score -= pieceScore;
                    }
                }
            }
        }
        
        return score;
    }

    /**
     * 评估单个棋子的价值（基础价值 + 位置价值）
     */
    evaluatePiece(piece, x, y) {
        const pieceType = piece.toUpperCase();
        const isRed = this.chess.isRed(piece);
        
        // 基础价值
        let value = this.pieceValues[piece] || 0;
        
        // 位置价值
        let posValue = 0;
        const posY = isRed ? (9 - y) : y; // 红方需要翻转Y坐标
        
        switch (pieceType) {
            case 'R':
                posValue = this.rookPositionValue[posY][x];
                break;
            case 'C':
                posValue = this.cannonPositionValue[posY][x];
                break;
            case 'N':
                posValue = this.knightPositionValue[posY][x];
                break;
            case 'P':
                posValue = this.pawnPositionValue[posY][x];
                // 过河兵价值提升
                if ((isRed && y < 5) || (!isRed && y > 4)) {
                    posValue += 50;
                }
                break;
            case 'K':
                posValue = this.kingPositionValue[posY][x];
                break;
            case 'A':
                posValue = this.advisorPositionValue[posY][x];
                break;
            case 'B':
                posValue = this.bishopPositionValue[posY][x];
                break;
        }
        
        return value + posValue;
    }

    /**
     * 机动性评估：可移动的位置数量
     * 机动性越强，局面越灵活
     */
    evaluateMobility() {
        let myMobility = 0;
        let enemyMobility = 0;
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const piece = this.chess.getPiece(x, y);
                
                if (piece) {
                    const moves = this.chess.getLegalMoves(x, y);
                    
                    if (this.chess.isCurrentPlayerPiece(piece)) {
                        myMobility += moves.length;
                    } else {
                        enemyMobility += moves.length;
                    }
                }
            }
        }
        
        // 机动性差值 * 权重
        return (myMobility - enemyMobility) * 3;
    }

    /**
     * 控制力评估：威胁对方棋子
     */
    evaluateControl() {
        let myControl = 0;
        let enemyControl = 0;
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const piece = this.chess.getPiece(x, y);
                
                if (piece) {
                    const moves = this.chess.getLegalMoves(x, y);
                    
                    for (const move of moves) {
                        const target = this.chess.getPiece(move.x, move.y);
                        if (target) {
                            const threatValue = this.pieceValues[target] / 10;
                            
                            if (this.chess.isCurrentPlayerPiece(piece)) {
                                myControl += threatValue;
                            } else {
                                enemyControl += threatValue;
                            }
                        }
                    }
                }
            }
        }
        
        return myControl - enemyControl;
    }

    /**
     * 将军威胁评估
     */
    evaluateCheck() {
        let checkScore = 0;
        
        // 检查是否将军对方
        const enemyKingPos = this.findEnemyKing();
        
        if (enemyKingPos) {
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 9; x++) {
                    const piece = this.chess.getPiece(x, y);
                    
                    if (piece && this.chess.isCurrentPlayerPiece(piece)) {
                        const moves = this.chess.getLegalMoves(x, y);
                        
                        if (moves.some(m => m.x === enemyKingPos.x && m.y === enemyKingPos.y)) {
                            checkScore += 100; // 将军奖励
                        }
                    }
                }
            }
        }
        
        // 检查是否被将军
        const myKingPos = this.findMyKing();
        
        if (myKingPos) {
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 9; x++) {
                    const piece = this.chess.getPiece(x, y);
                    
                    if (piece && !this.chess.isCurrentPlayerPiece(piece)) {
                        const moves = this.chess.getLegalMoves(x, y);
                        
                        if (moves.some(m => m.x === myKingPos.x && m.y === myKingPos.y)) {
                            checkScore -= 100; // 被将军惩罚
                        }
                    }
                }
            }
        }
        
        return checkScore;
    }

    /**
     * 防守评估：保护己方将/帅
     */
    evaluateDefense() {
        let defenseScore = 0;
        
        const myKingPos = this.findMyKing();
        
        if (myKingPos) {
            // 检查九宫格内的防守棋子数量
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const checkX = myKingPos.x + dx;
                    const checkY = myKingPos.y + dy;
                    
                    if (checkX >= 0 && checkX < 9 && checkY >= 0 && checkY < 10) {
                        const piece = this.chess.getPiece(checkX, checkY);
                        
                        if (piece && this.chess.isCurrentPlayerPiece(piece)) {
                            const pieceType = piece.toUpperCase();
                            if (pieceType === 'A' || pieceType === 'B') {
                                defenseScore += 20; // 士象防守加分
                            }
                        }
                    }
                }
            }
        }
        
        return defenseScore;
    }

    /**
     * 查找敌方将/帅
     */
    findEnemyKing() {
        const enemyKing = this.chess.currentPlayer === 'red' ? 'k' : 'K';
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                if (this.chess.board[y][x] === enemyKing) {
                    return {x, y};
                }
            }
        }
        
        return null;
    }

    /**
     * 查找己方将/帅
     */
    findMyKing() {
        const myKing = this.chess.currentPlayer === 'red' ? 'K' : 'k';
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                if (this.chess.board[y][x] === myKing) {
                    return {x, y};
                }
            }
        }
        
        return null;
    }

    /**
     * 移动排序 - 提高 Alpha-Beta 剪枝效率
     * 优先搜索可能更好的走法，提高剪枝概率
     */
    sortMoves(moves) {
        return moves.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;
            
            // 1. 优先考虑吃子移动
            const aCapture = this.chess.getPiece(a.to.x, a.to.y);
            const bCapture = this.chess.getPiece(b.to.x, b.to.y);
            
            if (aCapture) {
                scoreA += this.pieceValues[aCapture];
            }
            if (bCapture) {
                scoreB += this.pieceValues[bCapture];
            }
            
            // 2. 按棋子类型排序（车、炮优先）
            const aType = a.piece.toUpperCase();
            const bType = b.piece.toUpperCase();
            
            const priority = {'R': 300, 'C': 200, 'N': 100};
            scoreA += priority[aType] || 0;
            scoreB += priority[bType] || 0;
            
            // 3. 中心位置优先
            const centerX = 4;
            const centerY = 5;
            const aDistance = Math.abs(a.to.x - centerX) + Math.abs(a.to.y - centerY);
            const bDistance = Math.abs(b.to.x - centerX) + Math.abs(b.to.y - centerY);
            scoreA -= aDistance * 5;
            scoreB -= bDistance * 5;
            
            return scoreB - scoreA;
        });
    }

    /**
     * 获取所有可能的移动
     */
    getAllPossibleMoves() {
        const moves = [];
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const piece = this.chess.getPiece(x, y);
                
                if (piece && this.chess.isCurrentPlayerPiece(piece)) {
                    const legalMoves = this.chess.getLegalMoves(x, y);
                    
                    for (const move of legalMoves) {
                        moves.push({
                            from: {x, y},
                            to: move,
                            piece: piece
                        });
                    }
                }
            }
        }
        
        return moves;
    }

    /**
     * 生成 AI 思考过程描述
     */
    generateThinkingProcess(move) {
        const thoughts = [];
        
        const targetPiece = this.chess.getPiece(move.to.x, move.to.y);
        
        if (targetPiece) {
            const pieceName = this.getPieceName(targetPiece);
            thoughts.push(`吃掉对方的${pieceName}`);
        }
        
        const pieceType = move.piece.toUpperCase();
        const pieceName = this.getPieceName(move.piece);
        
        if (pieceType === 'R') {
            thoughts.push(`${pieceName}控制要道`);
        } else if (pieceType === 'C') {
            thoughts.push(`${pieceName}占据关键位置`);
        } else if (pieceType === 'N') {
            thoughts.push(`${pieceName}跳跃进攻`);
        } else if (pieceType === 'P') {
            const isRed = this.chess.isRed(move.piece);
            const crossed = isRed ? move.to.y < 5 : move.to.y > 4;
            if (crossed) {
                thoughts.push(`${pieceName}过河增强攻击`);
            } else {
                thoughts.push(`${pieceName}向前推进`);
            }
        }
        
        if (thoughts.length === 0) {
            thoughts.push('优化棋子位置，寻找机会');
        }
        
        return thoughts.join('，');
    }

    /**
     * 获取棋子中文名称
     */
    getPieceName(piece) {
        const names = {
            'K': '帅', 'k': '将',
            'A': '仕', 'a': '士',
            'B': '相', 'b': '象',
            'N': '马', 'n': '马',
            'R': '车', 'r': '车',
            'C': '炮', 'c': '炮',
            'P': '兵', 'p': '卒'
        };
        
        return names[piece] || '棋子';
    }

    /**
     * 睡眠函数（模拟思考时间）
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
