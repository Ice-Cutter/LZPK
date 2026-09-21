import { _decorator, Component, Sprite, SpriteFrame, Color } from 'cc';
import { PlayerController, PlayerState } from './PlayerController';

const { ccclass, property } = _decorator;

/**
 * 玩家动画/外观控制
 * 仅管理视觉表现，修改外观不影响碰撞判定
 *
 * 使用图片：拖入 SpriteFrame 到 customSprite 属性
 * 使用纯色：留空 customSprite，通过下方 color* 属性调色
 */
@ccclass('PlayerAnim')
export class PlayerAnim extends Component {
    // ========== 外观属性（编辑器可调） ==========
    @property({ type: SpriteFrame, tooltip: '玩家自定义贴图（留空则使用纯色）' })
    customSprite: SpriteFrame = null;

    @property({ type: Color, tooltip: '待机/跑步颜色（贴图模式下叠加染色）' })
    colorRun: Color = new Color(76, 175, 80, 255);

    @property({ type: Color, tooltip: '跳跃颜色（贴图模式下叠加染色）' })
    colorJump: Color = new Color(139, 195, 74, 255);

    @property({ type: Color, tooltip: '下蹲颜色（贴图模式下叠加染色）' })
    colorCrouch: Color = new Color(56, 142, 60, 255);

    @property({ type: Color, tooltip: '死亡颜色（贴图模式下叠加染色）' })
    colorDead: Color = new Color(158, 158, 158, 255);

    private _sprite: Sprite = null;

    onLoad(): void {
        this._sprite = this.node.getComponent(Sprite);
        if (this._sprite && this.customSprite) {
            this._sprite.spriteFrame = this.customSprite;
        }
    }

    update(_dt: number): void {
        if (!this._sprite) return;
        const ctrl = this.node.getComponent(PlayerController);
        if (!ctrl) return;

        switch (ctrl.playerState) {
            case PlayerState.IDLE:
            case PlayerState.RUNNING:
                this._sprite.color = this.colorRun;
                break;
            case PlayerState.JUMPING:
                this._sprite.color = this.colorJump;
                break;
            case PlayerState.CROUCHING:
                this._sprite.color = this.colorCrouch;
                break;
            case PlayerState.DEAD:
                this._sprite.color = this.colorDead;
                break;
        }
    }
}
