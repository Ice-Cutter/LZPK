import { _decorator, Component, BoxCollider2D } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { EventBus, GameEvent } from '../core/EventBus';
import { PlayerController } from '../player/PlayerController';

const { ccclass } = _decorator;

export enum PickupType {
    COIN = 'coin',
    SHIELD = 'shield',
    MAGNET = 'magnet',
    SPEED_BOOST = 'speed_boost',
}

/** 拾取物分值映射 */
export const PICKUP_SCORES: Record<string, number> = {
    [PickupType.COIN]: GameConfig.COIN_SCORE,
    [PickupType.SHIELD]: GameConfig.SHIELD_SCORE,
    [PickupType.MAGNET]: GameConfig.MAGNET_SCORE,
    [PickupType.SPEED_BOOST]: GameConfig.SPEED_BOOST_SCORE,
};

@ccclass('PickupItem')
export class PickupItem extends Component {
    pickupType: PickupType = PickupType.COIN;

    private _speed: number = 0;
    private _collider: BoxCollider2D = null;

    onLoad(): void {
        this._collider = this.getComponent(BoxCollider2D);
    }

    init(type: PickupType, speed: number, x: number, y: number): void {
        this.pickupType = type;
        this._speed = speed;
        this.node.setPosition(x, y, 0);
        if (this._collider) {
            this._collider.enabled = true;
        }
    }

    setSpeed(speed: number): void {
        this._speed = speed;
    }

    update(deltaTime: number): void {
        if (this._speed <= 0) return;

        const pos = this.node.position;
        const newX = pos.x - this._speed * deltaTime;
        this.node.setPosition(newX, pos.y, pos.z);

        // AABB 碰撞检测
        const player = PlayerController.instance;
        if (player && this._collider && this._collider.enabled) {
            if (this._checkCollision(player)) {
                this._onCollected();
                return;
            }
        }

        // 超出左边界
        if (newX < GameConfig.PICKUP_DESPAWN_X) {
            this.node.emit('pickup_off_screen', this);
        }
    }

    private _onCollected(): void {
        // 关闭碰撞体防止重复拾取，立即回收
        if (this._collider) {
            this._collider.enabled = false;
        }

        const points = PICKUP_SCORES[this.pickupType] || 0;
        EventBus.emit(GameEvent.PICKUP_COLLECTED, this.pickupType, points);
        this.node.emit('pickup_off_screen', this);
    }

    private _checkCollision(player: PlayerController): boolean {
        const pCollider = player.getComponent(BoxCollider2D);
        if (!pCollider || !pCollider.enabled) return false;

        // 拾取物 AABB
        const oSize = this._collider.size;
        const oOff = this._collider.offset;
        const ox = this.node.position.x + oOff.x;
        const oy = this.node.position.y + oOff.y;
        const oL = ox - oSize.width / 2;
        const oR = ox + oSize.width / 2;
        const oB = oy - oSize.height / 2;
        const oT = oy + oSize.height / 2;

        // 玩家 AABB
        const pSize = pCollider.size;
        const pOff = pCollider.offset;
        const px = player.node.position.x + pOff.x;
        const py = player.node.position.y + pOff.y;
        const pL = px - pSize.width / 2;
        const pR = px + pSize.width / 2;
        const pB = py - pSize.height / 2;
        const pT = py + pSize.height / 2;

        return oL < pR && oR > pL && oB < pT && oT > pB;
    }
}
