import { _decorator, Component, Node, Button } from 'cc';
import { EventBus, GameEvent } from '../core/EventBus';

const { ccclass, property } = _decorator;

/**
 * 游戏介绍界面组件
 * 挂载在 IntroPanel 节点上，处理"开始游戏"按钮点击，
 * 发出 INTRO_COMPLETE 事件通知 UIManager 切换到 StartPanel。
 */
@ccclass('IntroPanel')
export class IntroPanel extends Component {
    // ========== 编辑器属性 ==========
    @property({ type: Node, tooltip: '"开始游戏"按钮节点（需挂 Button 组件）' })
    startButton: Node = null;

    // ========== 生命周期 ==========
    onLoad(): void {
        if (this.startButton) {
            const btn = this.startButton.getComponent(Button);
            if (btn) {
                btn.node.on(Button.EventType.CLICK, this._onStartClick, this);
            }
        }
    }

    onDestroy(): void {
        if (this.startButton) {
            const btn = this.startButton.getComponent(Button);
            if (btn) {
                btn.node.off(Button.EventType.CLICK, this._onStartClick, this);
            }
        }
    }

    // ========== 私有方法 ==========
    private _onStartClick(): void {
        EventBus.emit(GameEvent.INTRO_COMPLETE);
    }
}
