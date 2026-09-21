import { _decorator, Component, Node } from 'cc';
import { EventBus, GameEvent } from '../core/EventBus';
import { GameManager } from '../core/GameManager';
import { ScoreDisplay } from './ScoreDisplay';
import { StarRating } from './StarRating';

const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    // ========== 编辑器属性 ==========
    @property({ type: Node, tooltip: '游戏介绍界面（全屏覆盖）' })
    introPanel: Node = null;

    @property(Node)
    startPanel: Node = null;

    @property(Node)
    gameOverPanel: Node = null;

    @property(Node)
    scorePanel: Node = null;

    @property(ScoreDisplay)
    scoreDisplay: ScoreDisplay = null;

    @property(StarRating)
    starRating: StarRating = null;

    // ========== 生命周期 ==========
    onLoad(): void {
        EventBus.on(GameEvent.GAME_START, this._onGameStart, this);
        EventBus.on(GameEvent.GAME_OVER, this._onGameOver, this);
        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);
        EventBus.on(GameEvent.INTRO_COMPLETE, this._onIntroComplete, this);

        this._showIntroPanel();
    }

    onDestroy(): void {
        EventBus.off(GameEvent.GAME_START, this._onGameStart, this);
        EventBus.off(GameEvent.GAME_OVER, this._onGameOver, this);
        EventBus.off(GameEvent.GAME_RESTART, this._onGameRestart, this);
        EventBus.off(GameEvent.INTRO_COMPLETE, this._onIntroComplete, this);
    }

    // ========== 私有方法 ==========

    private _showIntroPanel(): void {
        // 没有配置介绍界面时，直接显示开始界面
        if (!this.introPanel) {
            this._showStartPanel();
            return;
        }

        this._setActive(this.introPanel, true);
        this._setActive(this.startPanel, false);
        this._setActive(this.gameOverPanel, false);
        this._setActive(this.scorePanel, false);
    }

    private _showStartPanel(): void {
        this._setActive(this.introPanel, false);
        this._setActive(this.startPanel, true);
        this._setActive(this.gameOverPanel, false);
        this._setActive(this.scorePanel, false);

        if (this.scoreDisplay) {
            const highScore = GameManager.instance?.highScore ?? 0;
            this.scoreDisplay.resetDisplay();
            this.scoreDisplay.updateHighScore(highScore);
        }
    }

    private _hideAllPanels(): void {
        this._setActive(this.introPanel, false);
        this._setActive(this.startPanel, false);
        this._setActive(this.gameOverPanel, false);
        this._setActive(this.scorePanel, true);
    }

    private _setActive(node: Node, active: boolean): void {
        if (node) node.active = active;
    }

    // ========== 事件回调 ==========

    private _onIntroComplete(): void {
        this._showStartPanel();
    }

    private _onGameStart(): void {
        this._hideAllPanels();

        if (this.scoreDisplay) {
            const highScore = GameManager.instance?.highScore ?? 0;
            this.scoreDisplay.resetDisplay();
            this.scoreDisplay.updateHighScore(highScore);
        }
    }

    private _onGameOver(score: number, highScore: number, isNewRecord: boolean): void {
        this._setActive(this.gameOverPanel, true);

        if (this.scoreDisplay) {
            this.scoreDisplay.updateFinalScore(score);
            this.scoreDisplay.updateHighScore(highScore);
            this.scoreDisplay.showNewRecord(isNewRecord);
        }

        if (this.starRating) {
            this.starRating.evaluate(score);
        }
    }

    private _onGameRestart(): void {
        this._showStartPanel();
    }
}
