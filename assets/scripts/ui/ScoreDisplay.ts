import { _decorator, Component, Label, Node } from 'cc';
import { EventBus, GameEvent } from '../core/EventBus';

const { ccclass, property } = _decorator;

@ccclass('ScoreDisplay')
export class ScoreDisplay extends Component {
    // ========== 编辑器属性 ==========
    @property(Label)
    currentScoreLabel: Label = null;

    @property(Label)
    highScoreLabel: Label = null;

    @property(Label)
    finalScoreLabel: Label = null;

    @property(Node)
    newRecordNode: Node = null;

    // ========== 生命周期 ==========
    onLoad(): void {
        EventBus.on(GameEvent.SCORE_CHANGE, this._onScoreChange, this);
    }

    onDestroy(): void {
        EventBus.off(GameEvent.SCORE_CHANGE, this._onScoreChange, this);
    }

    // ========== 公有方法 ==========

    /** 更新当前分数显示 */
    updateCurrentScore(score: number): void {
        if (this.currentScoreLabel) {
            this.currentScoreLabel.string = String(score).padStart(5, '0');
        }
    }

    /** 更新最高分显示 */
    updateHighScore(highScore: number): void {
        if (this.highScoreLabel) {
            this.highScoreLabel.string = `HI ${String(highScore).padStart(5, '0')}`;
        }
    }

    /** 更新结算画面最终分数 */
    updateFinalScore(score: number): void {
        if (this.finalScoreLabel) {
            this.finalScoreLabel.string = String(score).padStart(5, '0');
        }
    }

    /** 显示/隐藏新纪录提示 */
    showNewRecord(show: boolean): void {
        if (this.newRecordNode) {
            this.newRecordNode.active = show;
        }
    }

    /** 重置显示（游戏开始时调用） */
    resetDisplay(): void {
        this.updateCurrentScore(0);
        this.showNewRecord(false);
    }

    // ========== 事件回调 ==========
    private _onScoreChange(score: number): void {
        this.updateCurrentScore(score);
    }
}
