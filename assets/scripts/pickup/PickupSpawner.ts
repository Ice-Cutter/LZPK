import { _decorator, Component, Node, Graphics, UITransform, Color, BoxCollider2D, RigidBody2D, ERigidBody2DType, Size, Sprite, SpriteFrame } from 'cc';
import { PickupItem, PickupType } from './PickupItem';
import { ObjectPool } from '../core/ObjectPool';
import { GameConfig } from '../core/GameConfig';
import { EventBus, GameEvent } from '../core/EventBus';
import { Obstacle } from '../obstacle/Obstacle';
import { PlayerController } from '../player/PlayerController';

const { ccclass, property } = _decorator;

/** 碰撞体相对于视觉尺寸的比例（>1.0 放大拾取判定范围，手感更宽松） */
const COLLIDER_W_RATIO = 1.5;
const COLLIDER_H_RATIO = 1.5;

/**
 * 拾取物基础预设
 * [类型, 视觉宽, 视觉高, R, G, B]
 */
const PRESETS: [PickupType, number, number, number, number, number][] = [
    [PickupType.COIN,        30, 30, 255, 215,   0],   // 金币
    [PickupType.SHIELD,      34, 34,   0, 170, 255],   // 护盾（蓝）
    [PickupType.MAGNET,      34, 34, 255,  80,  80],   // 磁铁（红）
    [PickupType.SPEED_BOOST, 34, 34,   0, 230, 100],   // 加速鞋（绿）
];

function createPickupNode(
    type: PickupType, w: number, h: number,
    r: number, g: number, b: number,
    spriteFrame: SpriteFrame | null,
): Node {
    const node = new Node('Pickup_' + type);
    const ui = node.addComponent(UITransform);
    ui.setContentSize(w, h);

    if (spriteFrame) {
        const sp = node.addComponent(Sprite);
        sp.spriteFrame = spriteFrame;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        (node as any)._hasSprite = true;
    } else {
        const gr = node.addComponent(Graphics);
        gr.fillColor = new Color(r, g, b, 255);
        gr.rect(-w / 2, -h / 2, w, h);
        gr.fill();
        (node as any)._hasSprite = false;
    }

    const bc = node.addComponent(BoxCollider2D);
    bc.size = new Size(w * COLLIDER_W_RATIO, h * COLLIDER_H_RATIO);
    bc.group = 8; // 拾取物使用独立 group
    bc.enabled = true;

    const rb = node.addComponent(RigidBody2D);
    rb.type = ERigidBody2DType.Kinematic;

    node.addComponent(PickupItem);

    (node as any)._baseW = w;
    (node as any)._baseH = h;
    (node as any)._baseR = r;
    (node as any)._baseG = g;
    (node as any)._baseB = b;

    return node;
}

@ccclass('PickupSpawner')
export class PickupSpawner extends Component {
    // ========== 编辑器属性 ==========
    @property({ type: SpriteFrame, tooltip: '金币贴图（留空=纯色金色）' })
    spriteCoin: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: '护盾贴图（留空=纯色蓝色）' })
    spriteShield: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: '磁铁贴图（留空=纯色红色）' })
    spriteMagnet: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: '加速鞋贴图（留空=纯色绿色）' })
    spriteSpeedBoost: SpriteFrame = null;

    // ========== 运行时状态 ==========
    private _pools: Map<PickupType, ObjectPool> = new Map();
    private _activeItems: PickupItem[] = [];
    private _spawnTimer: number = 0;
    private _nextSpawnTime: number = 0;
    private _speed: number = 0;
    private _running: boolean = false;
    private _spawnMinInterval: number = 3.0;
    private _spawnMaxInterval: number = 6.0;

    // ========== 生命周期 ==========
    onLoad(): void {
        const spriteMap: Record<string, SpriteFrame | null> = {
            [PickupType.COIN]: this.spriteCoin,
            [PickupType.SHIELD]: this.spriteShield,
            [PickupType.MAGNET]: this.spriteMagnet,
            [PickupType.SPEED_BOOST]: this.spriteSpeedBoost,
        };

        for (const [type, w, h, r, g, b] of PRESETS) {
            const sf = spriteMap[type] || null;
            this._pools.set(type, new ObjectPool(
                () => createPickupNode(type, w, h, r, g, b, sf),
                GameConfig.PICKUP_POOL_SIZE,
            ));
        }

        EventBus.on(GameEvent.GAME_START, this._onGameStart, this);
        EventBus.on(GameEvent.GAME_OVER, this._onGameOver, this);
        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);
        EventBus.on(GameEvent.SPEED_CHANGE, this._onSpeedChange, this);
        EventBus.on(GameEvent.SCORE_CHANGE, this._onScoreChange, this);
    }

    // 重叠检测计时器（每 0.15 秒检查一次，避免每帧扫描）
    private _overlapCheckTimer: number = 0;
    private static readonly OVERLAP_CHECK_INTERVAL: number = 0.15;

    update(deltaTime: number): void {
        if (!this._running) return;

        this._spawnTimer += deltaTime;
        if (this._spawnTimer >= this._nextSpawnTime) {
            this._spawnTimer = 0;
            this._nextSpawnTime = this._randomRange(this._spawnMinInterval, this._spawnMaxInterval);
            this._spawnPickup();
        }

        // 同步速度
        for (const item of this._activeItems) {
            item.setSpeed(this._speed);
        }

        // 持续检测：拾取物是否与后来生成的障碍物重叠
        this._overlapCheckTimer += deltaTime;
        if (this._overlapCheckTimer >= PickupSpawner.OVERLAP_CHECK_INTERVAL) {
            this._overlapCheckTimer = 0;
            this._cullOverlappingPickups();
        }
    }

    /** 检测并移除所有与障碍物视觉重叠的拾取物 */
    private _cullOverlappingPickups(): void {
        const obstacles = this._getAllActiveObstacles();
        if (obstacles.length === 0) return;

        const toRemove: PickupItem[] = [];
        for (const item of this._activeItems) {
            if (!item || !item.node || !item.node.active) continue;
            const ui = item.node.getComponent(UITransform);
            const pw = ui ? ui.width : 30;
            const ph = ui ? ui.height : 30;
            const px = item.node.position.x;
            const py = item.node.position.y;

            if (this._visualOverlapsAny(px, py, pw, ph, obstacles)) {
                toRemove.push(item);
            }
        }

        for (const item of toRemove) {
            this.recycleItem(item);
        }
    }

    onDestroy(): void {
        EventBus.off(GameEvent.GAME_START, this._onGameStart, this);
        EventBus.off(GameEvent.GAME_OVER, this._onGameOver, this);
        EventBus.off(GameEvent.GAME_RESTART, this._onGameRestart, this);
        EventBus.off(GameEvent.SPEED_CHANGE, this._onSpeedChange, this);
        EventBus.off(GameEvent.SCORE_CHANGE, this._onScoreChange, this);
        for (const pool of this._pools.values()) pool.clear();
    }

    // ========== 公有 ==========
    recycleItem(item: PickupItem): void {
        const idx = this._activeItems.indexOf(item);
        if (idx !== -1) this._activeItems.splice(idx, 1);
        item.node.off('pickup_off_screen', this._onItemOffScreen, this);
        const pool = this._pools.get(item.pickupType);
        if (pool) pool.recycle(item.node);
    }

    // 候选 Y 高度列表（拾取物的可能放置位置，按优先级排列）
    private _buildCandidateYs(): number[] {
        const player = PlayerController.instance;
        const playerH = player ? (player.node.getComponent(UITransform)?.height || 90) : 90;
        const playerRunY = GameConfig.GROUND_Y + playerH / 2;
        const maxJumpY = GameConfig.PLAYER_JUMP_FORCE * GameConfig.PLAYER_JUMP_FORCE / (2 * Math.abs(GameConfig.PLAYER_GRAVITY));

        return [
            playerRunY,              // 地面（正常跑/下蹲都能捡）
            playerRunY + 30,         // 略高（正常跑就能捡）
            playerRunY - 25,         // 略低（下蹲能捡到）
            GameConfig.GROUND_Y + maxJumpY * 0.65,  // 跳跃高度
            GameConfig.GROUND_Y + maxJumpY * 0.4,   // 中跳跃高度
        ];
    }

    // ========== 私有：生成 ==========
    private _spawnPickup(): void {
        const type = this._pickType();
        const pool = this._pools.get(type);
        if (!pool) return;

        const node = pool.get(this.node);
        const item = node.getComponent(PickupItem);
        if (!item) {
            pool.recycle(node);
            return;
        }

        this._applyScaleToNode(node);

        const ui = node.getComponent(UITransform);
        const baseW = ui ? ui.width : 30;
        const baseH = ui ? ui.height : 30;

        const x = GameConfig.PICKUP_SPAWN_X + this._randomRange(-50, 200);

        // 从候选高度中选一个不与障碍物视觉重叠的
        const candidates = this._buildCandidateYs();
        const y = this._pickNonOverlappingY(x, baseW, baseH, candidates);

        if (y === null) {
            // 所有候选位置都与障碍物重叠，本轮不生成
            pool.recycle(node);
            return;
        }

        item.init(type, this._speed, x, y);
        this._activeItems.push(item);

        node.on('pickup_off_screen', this._onItemOffScreen, this);
    }

    /**
     * 从候选高度中选一个不与障碍物视觉重叠的 Y
     * 返回 null 表示所有位置都被占用
     */
    private _pickNonOverlappingY(
        px: number, pickW: number, pickH: number,
        candidates: number[],
    ): number | null {
        const obstacles = this._getActiveObstaclesNear(px);

        // 无障碍物 → 随机选一个候选高度
        if (obstacles.length === 0) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }

        // 有障碍物 → 逐个检查每个候选高度是否与障碍物重叠
        const safeCandidates = candidates.filter(y => {
            return !this._visualOverlapsAny(px, y, pickW, pickH, obstacles);
        });

        if (safeCandidates.length > 0) {
            return safeCandidates[Math.floor(Math.random() * safeCandidates.length)];
        }

        // 所有候选都重叠 → 尝试放在最近障碍物的上方
        const nearest = obstacles[0];
        const obsUITransform = nearest.node.getComponent(UITransform);
        const obsH = obsUITransform ? obsUITransform.height : 80;
        const obsY = nearest.node.position.y;
        const obsTop = obsY + obsH / 2;
        const aboveObs = obsTop + 20 + pickH / 2;

        // 再次检查这个"上方"位置是否与其他障碍物重叠
        if (!this._visualOverlapsAny(px, aboveObs, pickW, pickH, obstacles)) {
            return Math.min(aboveObs, GameConfig.GROUND_Y + 180);
        }

        return null;
    }

    /**
     * 检查拾取物（视觉范围）是否与列表中任一障碍物（视觉范围）重叠
     */
    private _visualOverlapsAny(
        px: number, py: number, pickW: number, pickH: number,
        obstacles: Obstacle[],
    ): boolean {
        const pLeft = px - pickW / 2;
        const pRight = px + pickW / 2;
        const pBottom = py - pickH / 2;
        const pTop = py + pickH / 2;

        for (const obs of obstacles) {
            if (!obs.node.active) continue;

            const obsTransform = obs.node.getComponent(UITransform);
            const obsW = obsTransform ? obsTransform.width : 40;
            const obsH = obsTransform ? obsTransform.height : 80;
            const ox = obs.node.position.x;
            const oy = obs.node.position.y;
            const oLeft = ox - obsW / 2;
            const oRight = ox + obsW / 2;
            const oBottom = oy - obsH / 2;
            const oTop = oy + obsH / 2;

            // AABB 重叠判断
            if (pLeft < oRight && pRight > oLeft && pBottom < oTop && pTop > oBottom) {
                return true;
            }
        }
        return false;
    }

    /** 获取所有活跃障碍物 */
    private _getAllActiveObstacles(): Obstacle[] {
        const container = this.node.parent?.getChildByName('ObstacleContainer');
        if (!container) return [];

        const result: Obstacle[] = [];
        const obstacles = container.getComponentsInChildren(Obstacle);
        for (const obs of obstacles) {
            if (obs.node.active) result.push(obs);
        }
        return result;
    }

    /** 获取 px 附近 400px 范围内的活跃障碍物，按距离排序 */
    private _getActiveObstaclesNear(px: number): Obstacle[] {
        const container = this.node.parent?.getChildByName('ObstacleContainer');
        if (!container) return [];

        const result: Obstacle[] = [];
        const obstacles = container.getComponentsInChildren(Obstacle);
        for (const obs of obstacles) {
            if (!obs.node.active) continue;
            if (Math.abs(obs.node.position.x - px) < 400) {
                result.push(obs);
            }
        }
        result.sort((a, b) =>
            Math.abs(a.node.position.x - px) - Math.abs(b.node.position.x - px)
        );
        return result;
    }

    private _pickType(): PickupType {
        const roll = Math.random();
        if (roll < 0.70) return PickupType.COIN;
        if (roll < 0.85) return PickupType.SHIELD;
        if (roll < 0.95) return PickupType.MAGNET;
        return PickupType.SPEED_BOOST;
    }

    private _applyScaleToNode(node: Node): void {
        const baseW: number = (node as any)._baseW || 30;
        const baseH: number = (node as any)._baseH || 30;
        const baseR: number = (node as any)._baseR || 255;
        const baseG: number = (node as any)._baseG || 215;
        const baseB: number = (node as any)._baseB || 0;
        const hasSprite: boolean = (node as any)._hasSprite === true;

        const ui = node.getComponent(UITransform);
        ui.setContentSize(baseW, baseH);

        if (!hasSprite) {
            const gr = node.getComponent(Graphics);
            if (gr) {
                gr.clear();
                gr.fillColor = new Color(baseR, baseG, baseB, 255);
                gr.rect(-baseW / 2, -baseH / 2, baseW, baseH);
                gr.fill();
            }
        }

        const bc = node.getComponent(BoxCollider2D);
        bc.size = new Size(baseW * COLLIDER_W_RATIO, baseH * COLLIDER_H_RATIO);
    }

    private _onItemOffScreen(item: PickupItem): void {
        this.recycleItem(item);
    }

    private _updateSpawnInterval(score: number): void {
        for (let i = GameConfig.PICKUP_SPAWN_INTERVALS.length - 1; i >= 0; i--) {
            if (score >= GameConfig.PICKUP_SPAWN_INTERVALS[i][0]) {
                this._spawnMinInterval = GameConfig.PICKUP_SPAWN_INTERVALS[i][1];
                this._spawnMaxInterval = GameConfig.PICKUP_SPAWN_INTERVALS[i][2];
                return;
            }
        }
    }

    private _randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    // ========== 事件回调 ==========
    private _onGameStart(): void {
        this._running = true;
        this._spawnTimer = 0;
        this._nextSpawnTime = this._randomRange(1.5, this._spawnMaxInterval);
    }
    private _onGameOver(): void {
        this._running = false;
        this._speed = 0;
        for (const item of [...this._activeItems]) this.recycleItem(item);
        this._activeItems = [];
    }
    private _onGameRestart(): void {
        this._running = false;
        this._speed = 0;
        for (const item of [...this._activeItems]) this.recycleItem(item);
        this._activeItems = [];
        this._spawnTimer = 0;
        this._overlapCheckTimer = 0;
    }
    private _onSpeedChange(speed: number): void { this._speed = speed; }
    private _onScoreChange(score: number): void { this._updateSpawnInterval(score); }
}
