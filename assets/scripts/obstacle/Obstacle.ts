import { _decorator, Component, BoxCollider2D } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { PlayerController } from '../player/PlayerController';

const { ccclass } = _decorator;

export enum ObstacleType {
    CACTUS_SMALL = 'cactus_small',
    CACTUS_LARGE = 'cactus_large',
    CACTUS_GROUP = 'cactus_group',
    BIRD_LOW = 'bird_low',
    BIRD_HIGH = 'bird_high',
}

@ccclass('Obstacle')
export class Obstacle extends Component {
    obstacleType: string = '';

    private _speed: number = 0;
    private _passed: boolean = false;
    private _collider: BoxCollider2D = null;

    get passed(): boolean { return this._passed; }
    set passed(v: boolean) { this._passed = v; }

    onLoad(): void {
        this._collider = this.getComponent(BoxCollider2D);
    }

    init(type: string, speed: number, y: number): void {
        this.obstacleType = type;
        this._speed = speed;
        this._passed = false;
        this.node.setPosition(GameConfig.OBSTACLE_SPAWN_X, y, 0);
    }

    setSpeed(speed: number): void {
        this._speed = speed;
    }

    update(deltaTime: number): void {
        if (this._speed <= 0) return;

        const pos = this.node.position;
        this.node.setPosition(pos.x - this._speed * deltaTime, pos.y, pos.z);

        // 手动 AABB 碰撞检测
        const player = PlayerController.instance;
        if (player && this._collider) {
            if (this._checkCollision(player)) {
                player.die();
                return;
            }
        }

        if (pos.x < GameConfig.OBSTACLE_DESPAWN_X) {
            this.node.emit('obstacle_off_screen', this);
        }
    }

    private _checkCollision(player: PlayerController): boolean {
        const pCollider = player.getComponent(BoxCollider2D);
        if (!pCollider) return false;

        // 障碍物 AABB
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
