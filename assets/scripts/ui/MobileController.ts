import { _decorator, Component, Node } from 'cc';
import { EventBus, GameEvent } from '../core/EventBus';

const { ccclass, property } = _decorator;

@ccclass('MobileController')
export class MobileController extends Component {

    @property({ type: Node, tooltip: '跳跃按钮节点' })
    jumpBtnNode: Node = null;

    @property({ type: Node, tooltip: '下蹲按钮节点' })
    crouchBtnNode: Node = null;

    private _crouching: boolean = false;

    onLoad(): void {
        // 下蹲按钮 — 按住蹲、松手站（代码绑定）
        if (this.crouchBtnNode) {
            this.crouchBtnNode.on(Node.EventType.TOUCH_START, this._onCrouchDown, this);
            this.crouchBtnNode.on(Node.EventType.TOUCH_END, this._onCrouchUp, this);
            this.crouchBtnNode.on(Node.EventType.TOUCH_CANCEL, this._onCrouchUp, this);
        }

        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);
    }

    onDestroy(): void {
        if (this.crouchBtnNode) {
            this.crouchBtnNode.off(Node.EventType.TOUCH_START, this._onCrouchDown, this);
            this.crouchBtnNode.off(Node.EventType.TOUCH_END, this._onCrouchUp, this);
            this.crouchBtnNode.off(Node.EventType.TOUCH_CANCEL, this._onCrouchUp, this);
        }
        EventBus.off(GameEvent.GAME_RESTART, this._onGameRestart, this);
    }

    // ========== 跳跃按钮 — 编辑器 Button ClickEvents 调用 ==========

    public onClickJump(): void {
        EventBus.emit(GameEvent.PLAYER_INPUT_JUMP);
    }

    // ========== 下蹲按钮 — 代码绑定 ==========

    private _onCrouchDown(): void {
        if (!this._crouching) {
            this._crouching = true;
            EventBus.emit(GameEvent.PLAYER_INPUT_CROUCH);
        }
    }

    private _onCrouchUp(): void {
        if (this._crouching) {
            this._crouching = false;
            EventBus.emit(GameEvent.PLAYER_INPUT_STAND);
        }
    }

    private _onGameRestart(): void {
        this._crouching = false;
    }
}
