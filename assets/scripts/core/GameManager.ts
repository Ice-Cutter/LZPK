import { _decorator, Component, sys, input, Input, KeyCode, EventTouch } from 'cc';
import { GameConfig } from './GameConfig';
import { EventBus, GameEvent } from './EventBus';
import { PickupType } from '../pickup/PickupItem';

const { ccclass, property } = _decorator;

export enum GameState {
    START,
    PLAYING,
    GAME_OVER,
}

@ccclass('GameManager')
export class GameManager extends Component {
    // ========== 运行时状态 ==========
    private _state: GameState = GameState.START;
    private _score: number = 0;
    private _highScore: number = 0;
    private _currentSpeed: number = 0;
    private _difficultyLevel: number = 0;
    private _totalGames: number = 0;
    private _lastMilestone: number = 0;
    private _introComplete: boolean = false;   // 介绍界面是否已通过

    // 道具状态
    private _shieldActive: boolean = false;
    private _magnetActive: boolean = false;
    private _speedBoostActive: boolean = false;
    private _speedBoostTimer: number = 0;
    private _magnetTimer: number = 0;
    private _speedMultiplier: number = 1.0;

    // 单例
    private static _instance: GameManager = null;

    static get instance(): GameManager {
        return GameManager._instance;
    }

    // ========== 属性访问器 ==========
    get state(): GameState { return this._state; }
    get score(): number { return this._score; }
    get highScore(): number { return this._highScore; }
    get currentSpeed(): number { return this._currentSpeed; }
    get difficultyLevel(): number { return this._difficultyLevel; }
    get shieldActive(): boolean { return this._shieldActive; }
    get speedMultiplier(): number { return this._speedMultiplier; }

    // ========== 生命周期 ==========
    onLoad(): void {
        GameManager._instance = this;
        this._loadHighScore();
        this._totalGames = this._loadTotalGames();
        this._registerInput();
        EventBus.on(GameEvent.PLAYER_DIE, this._onPlayerDie, this);
        EventBus.on(GameEvent.PICKUP_COLLECTED, this._onPickupCollected, this);
        EventBus.on(GameEvent.INTRO_COMPLETE, this._onIntroComplete, this);
    }

    start(): void {
        this._enterStartState();
    }

    update(deltaTime: number): void {
        if (this._state !== GameState.PLAYING) return;

        // 分数累积
        const speedMultiplier = this._currentSpeed / GameConfig.INITIAL_SPEED;
        this._score += GameConfig.SCORE_PER_SECOND * speedMultiplier * deltaTime;
        const integerScore = Math.floor(this._score);
        EventBus.emit(GameEvent.SCORE_CHANGE, integerScore);

        // 里程碑检测（每 100 分触发一次）
        const currentMilestone = Math.floor(integerScore / GameConfig.MILESTONE_INTERVAL);
        if (currentMilestone > this._lastMilestone) {
            this._lastMilestone = currentMilestone;
            EventBus.emit(GameEvent.MILESTONE, integerScore);
        }

        // 磁铁倒计时
        if (this._magnetActive) {
            this._magnetTimer -= deltaTime;
            if (this._magnetTimer <= 0) {
                this._magnetActive = false;
                EventBus.emit(GameEvent.POWERUP_END, PickupType.MAGNET);
            }
        }

        // 加速鞋倒计时
        if (this._speedBoostActive) {
            this._speedBoostTimer -= deltaTime;
            if (this._speedBoostTimer <= 0) {
                this._speedBoostActive = false;
                this._speedMultiplier = 1.0;
                EventBus.emit(GameEvent.SPEED_CHANGE, this._currentSpeed);
                EventBus.emit(GameEvent.POWERUP_END, PickupType.SPEED_BOOST);
            }
        }

        // 更新难度
        this._updateDifficulty();
    }

    onDestroy(): void {
        this._unregisterInput();
        EventBus.off(GameEvent.PLAYER_DIE, this._onPlayerDie, this);
        EventBus.off(GameEvent.PICKUP_COLLECTED, this._onPickupCollected, this);
        EventBus.off(GameEvent.INTRO_COMPLETE, this._onIntroComplete, this);
        if (GameManager._instance === this) {
            GameManager._instance = null;
        }
    }

    // ========== 公有方法 ==========

    /** 开始游戏 */
    startGame(): void {
        if (this._state !== GameState.START) return;

        this._score = 0;
        this._currentSpeed = GameConfig.INITIAL_SPEED;
        this._difficultyLevel = 0;
        this._lastMilestone = 0;
        this._shieldActive = false;
        this._magnetActive = false;
        this._speedBoostActive = false;
        this._magnetTimer = 0;
        this._speedBoostTimer = 0;
        this._speedMultiplier = 1.0;
        this._state = GameState.PLAYING;

        EventBus.emit(GameEvent.GAME_START);
        EventBus.emit(GameEvent.SPEED_CHANGE, this._currentSpeed);
        EventBus.emit(GameEvent.SCORE_CHANGE, 0);
    }

    /** 游戏结束 */
    gameOver(): void {
        if (this._state !== GameState.PLAYING) return;
        this._state = GameState.GAME_OVER;

        const finalScore = Math.floor(this._score);
        let isNewRecord = false;

        if (finalScore > this._highScore) {
            this._highScore = finalScore;
            this._saveHighScore();
            isNewRecord = true;
            EventBus.emit(GameEvent.NEW_HIGH_SCORE, this._highScore);
        }

        this._totalGames++;
        this._saveTotalGames();

        EventBus.emit(GameEvent.GAME_OVER, finalScore, this._highScore, isNewRecord);
    }

    /** 重新开始 */
    restartGame(): void {
        this._state = GameState.START;
        EventBus.emit(GameEvent.GAME_RESTART);
        this.startGame();
    }

    /** 给分数加值（用于通过障碍物加分） */
    addScore(points: number): void {
        this._score += points;
        EventBus.emit(GameEvent.SCORE_CHANGE, Math.floor(this._score));
    }

    // ========== 私有方法 ==========

    private _enterStartState(): void {
        this._state = GameState.START;
        this._currentSpeed = 0;
    }

    private _onPlayerDie(): void {
        // 护盾激活时抵挡一次致命碰撞
        if (this._shieldActive) {
            this._shieldActive = false;
            EventBus.emit(GameEvent.SHIELD_BROKEN);
            return;
        }
        this.gameOver();
    }

    private _onPickupCollected(type: string, points: number): void {
        this.addScore(points);

        switch (type) {
            case PickupType.SHIELD:
                this._shieldActive = true;
                EventBus.emit(GameEvent.SHIELD_ACTIVATED);
                break;
            case PickupType.MAGNET:
                this._magnetActive = true;
                this._magnetTimer = GameConfig.MAGNET_DURATION;
                EventBus.emit(GameEvent.POWERUP_START, PickupType.MAGNET, GameConfig.MAGNET_DURATION);
                break;
            case PickupType.SPEED_BOOST:
                this._speedBoostActive = true;
                this._speedBoostTimer = GameConfig.SPEED_BOOST_DURATION;
                this._speedMultiplier = GameConfig.SPEED_BOOST_MULTIPLIER;
                // 通知速度变化（实际速度 = 基础速度 × 倍率）
                const boostedSpeed = this._currentSpeed * this._speedMultiplier;
                EventBus.emit(GameEvent.SPEED_CHANGE, boostedSpeed);
                EventBus.emit(GameEvent.POWERUP_START, PickupType.SPEED_BOOST, GameConfig.SPEED_BOOST_DURATION);
                break;
        }
    }

    private _updateDifficulty(): void {
        // 根据分数计算速度
        let newSpeed = GameConfig.INITIAL_SPEED;
        for (let i = GameConfig.SPEED_LEVELS.length - 1; i >= 0; i--) {
            if (this._score >= GameConfig.SPEED_LEVELS[i][0]) {
                newSpeed = GameConfig.SPEED_LEVELS[i][1];
                this._difficultyLevel = i;
                break;
            }
        }

        // 2000 分之后的额外加速
        if (this._score > 2000) {
            const extra = Math.floor((this._score - 2000) / 500) * GameConfig.SPEED_BEYOND_2000_PER_500;
            newSpeed = Math.min(newSpeed + extra, GameConfig.MAX_SPEED);
        }

        if (newSpeed !== this._currentSpeed) {
            this._currentSpeed = newSpeed;
            const effectiveSpeed = this._speedBoostActive ? newSpeed * this._speedMultiplier : newSpeed;
            EventBus.emit(GameEvent.SPEED_CHANGE, effectiveSpeed);
        }
    }

    private _loadHighScore(): void {
        const val = sys.localStorage.getItem(GameConfig.STORAGE_HIGH_SCORE);
        this._highScore = val ? parseInt(val) : 0;
    }

    private _saveHighScore(): void {
        sys.localStorage.setItem(GameConfig.STORAGE_HIGH_SCORE, String(this._highScore));
    }

    private _loadTotalGames(): number {
        const val = sys.localStorage.getItem(GameConfig.STORAGE_TOTAL_GAMES);
        return val ? parseInt(val) : 0;
    }

    private _saveTotalGames(): void {
        sys.localStorage.setItem(GameConfig.STORAGE_TOTAL_GAMES, String(this._totalGames));
    }

    // ========== 输入处理 ==========

    private _registerInput(): void {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    }

    private _unregisterInput(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    }

    private _onKeyDown(event: any): void {
        if (!this._introComplete) return;

        const key = event.keyCode;
        if (key === KeyCode.SPACE || key === KeyCode.ENTER || key === KeyCode.ARROW_UP) {
            if (this._state === GameState.START) this.startGame();
            else if (this._state === GameState.GAME_OVER) this.restartGame();
        }
    }

    private _onTouchStart(event: EventTouch): void {
        if (!this._introComplete) return;

        if (this._state === GameState.START) this.startGame();
        else if (this._state === GameState.GAME_OVER) this.restartGame();
    }

    private _onIntroComplete(): void {
        this._introComplete = true;
    }
}
