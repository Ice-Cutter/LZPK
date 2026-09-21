import { _decorator, Component, Node, UITransform } from 'cc';
import { EventBus, GameEvent } from '../core/EventBus';
import { GameManager, GameState } from '../core/GameManager';
import { GameConfig } from '../core/GameConfig';

const { ccclass, property } = _decorator;

/**
 * 单个背景层配置
 */
interface BgLayerConfig {
    tile: Node;
    tileWidth: number;
    parallaxRatio: number;
}

@ccclass('BackgroundScroller')
export class BackgroundScroller extends Component {
    // ========== 编辑器属性 ==========
    @property([Node])
    bgLayers: Node[] = [];          // 视差背景层（远→近），每个层至少 2 个 tile

    @property([Node])
    bgLayerClones: Node[] = [];     // 各层的克隆节点（双缓冲）

    // ========== 运行时状态 ==========
    private _speed: number = 0;
    private _layers: BgLayerConfig[] = [];

    // ========== 生命周期 ==========
    onLoad(): void {
        // 初始化各层配置
        for (let i = 0; i < this.bgLayers.length; i++) {
            const mainTile = this.bgLayers[i];
            const cloneTile = this.bgLayerClones[i];
            const uiTransform = mainTile.getComponent(UITransform);
            const tileWidth = uiTransform ? uiTransform.width : 0;
            const ratio = i < GameConfig.PARALLAX_RATIOS.length
                ? GameConfig.PARALLAX_RATIOS[i]
                : 1;

            // 将克隆节点放置在主节点的右侧
            if (cloneTile) {
                cloneTile.setPosition(mainTile.position.x + tileWidth, mainTile.position.y, mainTile.position.z);
            }

            this._layers.push({
                tile: mainTile,
                tileWidth,
                parallaxRatio: ratio,
            });
        }

        EventBus.on(GameEvent.SPEED_CHANGE, this._onSpeedChange, this);
        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);
    }

    update(deltaTime: number): void {
        if (this._speed <= 0) return;
        if (GameManager.instance?.state !== GameState.PLAYING) return;

        for (let i = 0; i < this._layers.length; i++) {
            const layer = this._layers[i];
            const layerSpeed = this._speed * layer.parallaxRatio;
            const cloneTile = this.bgLayerClones[i];

            // 移动主 tile
            const pos = layer.tile.position;
            layer.tile.setPosition(pos.x - layerSpeed * deltaTime, pos.y, pos.z);

            // 移动克隆 tile
            if (cloneTile) {
                const clonePos = cloneTile.position;
                cloneTile.setPosition(clonePos.x - layerSpeed * deltaTime, clonePos.y, clonePos.z);
            }

            // 双缓冲循环
            if (layer.tile.position.x <= -layer.tileWidth) {
                // 找到最右侧的 tile
                let rightmostX = -Infinity;
                if (cloneTile) {
                    rightmostX = Math.max(layer.tile.position.x, cloneTile.position.x);
                }
                layer.tile.setPosition(rightmostX + layer.tileWidth, layer.tile.position.y, layer.tile.position.z);
            }

            if (cloneTile && cloneTile.position.x <= -layer.tileWidth) {
                let rightmostX = Math.max(layer.tile.position.x, cloneTile.position.x);
                cloneTile.setPosition(rightmostX + layer.tileWidth, cloneTile.position.y, cloneTile.position.z);
            }
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

    private _onGameRestart(): void {
        this._speed = 0;
    }
}
