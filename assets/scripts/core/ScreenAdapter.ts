import { _decorator, Component, Camera, view, screen, ResolutionPolicy, Widget, UITransform, director } from 'cc';
import { GameConfig } from './GameConfig';

const { ccclass, property } = _decorator;

/**
 * 屏幕适配模式
 */
export enum AdaptMode {
    /** 显示全部内容，非 16:9 屏幕自动留黑边 */
    SHOW_ALL,
    /** 固定高度，宽度随屏幕变化 */
    FIXED_HEIGHT,
    /** 固定宽度，高度随屏幕变化 */
    FIXED_WIDTH,
}

/**
 * 屏幕适配组件
 * 挂载到 Camera 节点上，自动处理不同屏幕尺寸的画面适配
 */
@ccclass('ScreenAdapter')
export class ScreenAdapter extends Component {
    @property({ tooltip: '设计宽度（与 GameConfig 保持一致）' })
    designWidth: number = GameConfig.DESIGN_WIDTH;

    @property({ tooltip: '设计高度（与 GameConfig 保持一致）' })
    designHeight: number = GameConfig.DESIGN_HEIGHT;

    @property({ type: AdaptMode, tooltip: '适配模式。SHOW_ALL 最安全，适合大多数跑酷游戏' })
    adaptMode: AdaptMode = AdaptMode.SHOW_ALL;

    onLoad(): void {
        // 1. 禁用 Canvas 上的 Widget，防止它把 Canvas 拉伸为屏幕尺寸
        //    从而覆盖我们设置的设计分辨率
        this._disableCanvasWidget();

        // 2. 设置分辨率策略（必须在 onLoad 中尽早设置）
        this._setViewPolicy();

        // 监听窗口大小变化（PC 调试 / 折叠屏等场景）
        screen.on('window-resize', this._onWindowResize, this);
    }

    start(): void {
        // 3. 修正 Canvas UITransform 和 Camera（start 保证在所有 onLoad 之后执行，
        //    此时 Widget 已被禁用，设置不会被覆盖）
        this._fixCanvasTransform();
        this._adjustCamera();
    }

    onDestroy(): void {
        screen.off('window-resize', this._onWindowResize, this);
    }

    // ========== 私有方法 ==========

    /**
     * 禁用 Canvas 上的 Widget 组件
     *
     * 场景中 Canvas 节点挂了一个 LEFT+RIGHT+TOP+BOTTOM 的 Widget（alignFlags=45），
     * 它会在 lateUpdate 中把 Canvas UITransform 拉伸为屏幕的实际像素尺寸。
     * 如果不禁用，我们设置的 1920x1080 设计分辨率会被覆盖。
     */
    private _disableCanvasWidget(): void {
        const canvas = this._getCanvas();
        if (!canvas) return;

        const widget = canvas.getComponent(Widget);
        if (widget) {
            widget.enabled = false;
        }
    }

    private _onWindowResize(): void {
        this._setViewPolicy();
        this._fixCanvasTransform();
        this._adjustCamera();
    }

    /**
     * 设置视图分辨率策略
     */
    private _setViewPolicy(): void {
        let policy: ResolutionPolicy;

        switch (this.adaptMode) {
            case AdaptMode.FIXED_HEIGHT:
                policy = ResolutionPolicy.FIXED_HEIGHT;
                break;
            case AdaptMode.FIXED_WIDTH:
                policy = ResolutionPolicy.FIXED_WIDTH;
                break;
            default:
                policy = ResolutionPolicy.SHOW_ALL;
                break;
        }

        view.setDesignResolutionSize(this.designWidth, this.designHeight, policy);
    }

    /**
     * 调整摄像机 orthoHeight，确保设计分辨率内容完整可见
     */
    private _adjustCamera(): void {
        const camera = this.node.getComponent(Camera);
        if (!camera) return;

        const designW = this.designWidth;
        const designH = this.designHeight;

        switch (this.adaptMode) {
            case AdaptMode.SHOW_ALL:
            case AdaptMode.FIXED_HEIGHT:
                // 高度固定模式：orthoHeight = 设计高度 / 2
                camera.orthoHeight = designH / 2;
                break;

            case AdaptMode.FIXED_WIDTH:
                // 宽度固定模式：根据屏幕宽高比反向计算 orthoHeight
                // 确保设计宽度的所有内容可见
                const frameSize = screen.windowSize;
                if (frameSize.height > 0) {
                    const screenRatio = frameSize.width / frameSize.height;
                    camera.orthoHeight = (designW / 2) / screenRatio;
                }
                break;
        }
    }

    /**
     * 修正 Canvas 节点的 UITransform 为设计分辨率
     * 当前场景 Canvas 是 1280x720，但游戏内容按 1920x1080 设计
     */
    private _fixCanvasTransform(): void {
        const canvas = this._getCanvas();
        if (!canvas) return;

        const uiTransform = canvas.getComponent(UITransform);
        if (!uiTransform) return;

        const designW = this.designWidth;
        const designH = this.designHeight;

        if (uiTransform.width !== designW || uiTransform.height !== designH) {
            uiTransform.setContentSize(designW, designH);
        }
    }

    private _getCanvas(): import('cc').Node | null {
        const scene = director.getScene();
        if (!scene) return null;
        return scene.getChildByName('Canvas');
    }
}
