import { _decorator, Component, Node, UITransform, instantiate } from 'cc';
import { EventBus, GameEvent } from '../core/EventBus';
import { GameManager, GameState } from '../core/GameManager';

const { ccclass, property } = _decorator;

@ccclass('GroundScroller')
export class GroundScroller extends Component {
    // ========== 编辑器属性 ==========
    @property([Node])
    groundTiles: Node[] = [];

    // ========== 运行时状态 ==========
    private _speed: number = 0;
    private _tileWidth: number = 0;
    private _recycleThreshold: number = 0;  // 回收阈值：右边缘完全离开摄像机后才回收

    // ========== 生命周期 ==========
    onLoad(): void {
        if (this.groundTiles.length > 0) {
            const uiTransform = this.groundTiles[0].getComponent(UITransform);
            this._tileWidth = uiTransform ? uiTransform.width : 0;
            // 回收阈值（3 瓦片系统）：
            // 瓦片右边缘 = pos.x + _tileWidth/2，摄像机左边缘 = -_tileWidth/2
            // 安全缓冲 = _tileWidth/2（瓦片右边缘超过摄像机左边缘后半瓦片宽才回收）
            // → pos.x + _tileWidth/2 <= -_tileWidth/2 - _tileWidth/2
            // → pos.x <= -_tileWidth * 1.5
            this._recycleThreshold = -this._tileWidth * 1.5;
        }

        EventBus.on(GameEvent.SPEED_CHANGE, this._onSpeedChange, this);
        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);
    }

    start(): void {
        // 首次启动时，将地面瓦片放置到正确的位置（并排排列）
        this._ensureTileCount(3);  // 至少 3 块瓦片，留出回收缓冲
        this._resetTilePositions();
    }

    update(deltaTime: number): void {
        if (this._speed <= 0) return;
        if (GameManager.instance?.state !== GameState.PLAYING) return;
        if (this.groundTiles.length < 3) return;

        // 所有地面块向左移动
        for (const tile of this.groundTiles) {
            const pos = tile.position;
            tile.setPosition(pos.x - this._speed * deltaTime, pos.y, pos.z);
        }

        // 双缓冲循环：移出屏幕左侧的 tile 放到最右侧
        const firstTile = this.groundTiles[0];
        if (firstTile.position.x <= this._recycleThreshold) {
            // 找到最右侧的 tile
            let rightmostX = -Infinity;
            for (const tile of this.groundTiles) {
                if (tile.position.x > rightmostX) {
                    rightmostX = tile.position.x;
                }
            }
            firstTile.setPosition(rightmostX + this._tileWidth, firstTile.position.y, firstTile.position.z);

            // 将移出的 tile 移到数组末尾，保持顺序
            this.groundTiles.push(this.groundTiles.shift()!);
        }
    }

    onDestroy(): void {
        EventBus.off(GameEvent.SPEED_CHANGE, this._onSpeedChange, this);
        EventBus.off(GameEvent.GAME_RESTART, this._onGameRestart, this);
    }

    // ========== 私有方法 ==========

    private _onSpeedChange(speed: number): void {
        this._speed = speed;
    }

    private _resetTilePositions(): void {
        if (this.groundTiles.length > 0) {
            const startX = -this._tileWidth / 2;
            for (let i = 0; i < this.groundTiles.length; i++) {
                this.groundTiles[i].setPosition(startX + i * this._tileWidth, this.groundTiles[i].position.y, 0);
            }
        }
    }

    /**
     * 确保有足够数量的瓦片。不足时克隆第一块瓦片补齐。
     * 至少需要 3 块才能安全地延后回收（2块系统无法在回收前留缓冲）。
     */
    private _ensureTileCount(minCount: number): void {
        while (this.groundTiles.length < minCount) {
            const original = this.groundTiles[0];
            const clone = instantiate(original);
            clone.parent = original.parent;
            this.groundTiles.push(clone);
        }
    }

    private _onGameRestart(): void {
        this._resetTilePositions();
        this._speed = 0;
    }
}
