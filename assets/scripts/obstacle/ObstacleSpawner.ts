import { _decorator, Component, Node, Graphics, UITransform, Color, BoxCollider2D, RigidBody2D, ERigidBody2DType, Size, Sprite, SpriteFrame } from 'cc';
import { Obstacle, ObstacleType } from './Obstacle';
import { PickupItem } from '../pickup/PickupItem';
import { ObjectPool } from '../core/ObjectPool';
import { GameConfig } from '../core/GameConfig';
import { EventBus, GameEvent } from '../core/EventBus';
import { GameManager } from '../core/GameManager';

const { ccclass, property } = _decorator;

/** 障碍物碰撞体相对于视觉尺寸的比例（保持手感一致性） */
const COLLIDER_W_RATIO = 0.8;
const COLLIDER_H_RATIO = 0.9;

/**
 * 障碍物基础预设（scale=1.0 时的值）
 * [类型, 视觉宽, 视觉高, R, G, B, Y偏移]
 *
 * 修改外观方式：
 *   改视觉宽/高     → 视觉+碰撞等比变化
 *   改 R/G/B       → 仅改纯色后备颜色（有贴图时忽略）
 *   改 Y偏移       → 飞行高度（仅飞鸟有效）
 *   拖入 SpriteFrame → 用图片替换纯色（见编辑器属性）
 *   改 obstacleScale → 全局缩放所有障碍物
 */
const PRESETS: [string, number, number, number, number, number, number][] = [
    //                              视觉宽  视觉高    R    G    B  Y偏移
    [ObstacleType.CACTUS_SMALL,       40,    80,  121,  85,  72,    0],
    [ObstacleType.CACTUS_LARGE,       60,   120,  109,  76,  65,    0],
    [ObstacleType.CACTUS_GROUP,      120,    80,  139,  90,  43,    0],
    // 低飞鸟 60×30, center=-320, collider底=-333→碰站立, 下蹲(-355)安全, 跳跃(-255)越过
    [ObstacleType.BIRD_LOW,           60,    30,  244,  67,  54,   65],
    // 高飞鸟 60×70, center=-260, collider底=-292→飞过站立头顶, collider顶=-229→封跳跃, 下蹲安全
    [ObstacleType.BIRD_HIGH,          60,    70,  233,  30,  99,  105],
];

function createObstacleNode(
    type: string, w: number, h: number,
    r: number, g: number, b: number, yOff: number,
    spriteFrame: SpriteFrame | null,
): Node {
    const node = new Node('Obs_' + type);
    const ui = node.addComponent(UITransform);
    ui.setContentSize(w, h);

    if (spriteFrame) {
        // 图片模式：使用导入的 SpriteFrame
        const sp = node.addComponent(Sprite);
        sp.spriteFrame = spriteFrame;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        (node as any)._hasSprite = true;
    } else {
        // 纯色模式：使用 Graphics 绘制矩形
        const gr = node.addComponent(Graphics);
        gr.fillColor = new Color(r, g, b, 255);
        gr.rect(-w / 2, -h / 2, w, h);
        gr.fill();
        (node as any)._hasSprite = false;
    }

    // BoxCollider2D（碰撞 = 视觉 × 比例）
    const bc = node.addComponent(BoxCollider2D);
    bc.size = new Size(w * COLLIDER_W_RATIO, h * COLLIDER_H_RATIO);
    bc.group = 4;

    // RigidBody2D
    const rb = node.addComponent(RigidBody2D);
    rb.type = ERigidBody2DType.Kinematic;
    rb.enabledContactListener = true;

    // Obstacle
    node.addComponent(Obstacle);

    // 存储基础参数，供 spawn 时应用缩放和计算 Y 坐标
    (node as any)._baseW = w;
    (node as any)._baseH = h;
    (node as any)._baseR = r;
    (node as any)._baseG = g;
    (node as any)._baseB = b;
    (node as any)._yOffset = yOff;
    (node as any)._obstacleType = type;

    // 对象池工厂函数创建时打印一次，确认参数正确
    console.log(`[ObstacleSpawner] 对象池创建节点: type=${type}, w=${w}, h=${h}, yOff=${yOff}, color=(${r},${g},${b})`);

    return node;
}

@ccclass('ObstacleSpawner')
export class ObstacleSpawner extends Component {
    // ========== 编辑器属性 ==========
    @property({ tooltip: '障碍物整体缩放倍率（视觉+碰撞同步放大/缩小，1.0=默认）' })
    obstacleScale: number = 1.0;

    @property({ type: SpriteFrame, tooltip: '小仙人掌贴图（留空=纯色）' })
    spriteCactusSmall: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: '大仙人掌贴图（留空=纯色）' })
    spriteCactusLarge: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: '仙人掌群贴图（留空=纯色）' })
    spriteCactusGroup: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: '低飞鸟贴图（留空=纯色）' })
    spriteBirdLow: SpriteFrame = null;

    @property({ type: SpriteFrame, tooltip: '高飞鸟贴图（留空=纯色）' })
    spriteBirdHigh: SpriteFrame = null;

    // ========== 运行时状态 ==========
    private _pools: Map<string, ObjectPool> = new Map();
    private _activeObstacles: Obstacle[] = [];
    private _spawnTimer: number = 0;
    private _nextSpawnTime: number = 0;
    private _speed: number = 0;
    private _lastObstacleType: string = '';
    private _spawnMinInterval: number = 2.0;
    private _spawnMaxInterval: number = 3.0;
    private _availableTypes: string[] = [];
    private _running: boolean = false;

    // ========== 生命周期 ==========
    onLoad(): void {
        const spriteMap: Record<string, SpriteFrame | null> = {
            [ObstacleType.CACTUS_SMALL]: this.spriteCactusSmall,
            [ObstacleType.CACTUS_LARGE]: this.spriteCactusLarge,
            [ObstacleType.CACTUS_GROUP]: this.spriteCactusGroup,
            [ObstacleType.BIRD_LOW]: this.spriteBirdLow,
            [ObstacleType.BIRD_HIGH]: this.spriteBirdHigh,
        };

        for (const [type, w, h, r, g, b, yOff] of PRESETS) {
            const sf = spriteMap[type] || null;
            this._pools.set(type, new ObjectPool(
                () => createObstacleNode(type, w, h, r, g, b, yOff, sf),
                GameConfig.OBSTACLE_POOL_SIZE,
            ));
        }
        this._availableTypes = [ObstacleType.CACTUS_SMALL];

        EventBus.on(GameEvent.GAME_START, this._onGameStart, this);
        EventBus.on(GameEvent.GAME_OVER, this._onGameOver, this);
        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);
        EventBus.on(GameEvent.SPEED_CHANGE, this._onSpeedChange, this);
        EventBus.on(GameEvent.SCORE_CHANGE, this._onScoreChange, this);
    }

    update(deltaTime: number): void {
        if (!this._running) return;
        this._spawnTimer += deltaTime;
        if (this._spawnTimer >= this._nextSpawnTime) {
            this._spawnTimer = 0;
            this._nextSpawnTime = this._randomRange(this._spawnMinInterval, this._spawnMaxInterval);
            this._spawnObstacle();
        }
        for (const obs of this._activeObstacles) obs.setSpeed(this._speed);
        const px = GameConfig.PLAYER_X;
        for (const obs of this._activeObstacles) {
            if (!obs.passed && obs.node.position.x < px) {
                obs.passed = true;
                EventBus.emit(GameEvent.OBSTACLE_PASSED);
                GameManager.instance?.addScore(5);
            }
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
    recycleObstacle(obstacle: Obstacle): void {
        const idx = this._activeObstacles.indexOf(obstacle);
        if (idx !== -1) this._activeObstacles.splice(idx, 1);
        obstacle.node.off('obstacle_off_screen', this._onObstacleOffScreen, this);
        const pool = this._pools.get(obstacle.obstacleType);
        if (pool) pool.recycle(obstacle.node);
    }

    // ========== 私有：生成 ==========
    private _spawnObstacle(): void {
        if (this._availableTypes.length === 0) return;
        const type = this._pickType();
        const pool = this._pools.get(type);
        if (!pool) return;

        const node = pool.get(this.node);
        const obstacle = node.getComponent(Obstacle);
        if (!obstacle) return;

        // 从对象池取出后，按当前 scale 重新设置尺寸
        this._applyScaleToNode(node);

        const yOff: number = (node as any)._yOffset ?? 0;
        const ui = node.getComponent(UITransform);
        const actualH = ui ? ui.height : 80;
        const y = yOff > 0
            ? GameConfig.GROUND_Y + yOff * this.obstacleScale + actualH / 2
            : GameConfig.GROUND_Y + actualH / 2;

        // 调试日志：验证每种类型的坐标是否正确
        console.log(`[ObstacleSpawner] 生成 ${type}: baseH=${(node as any)._baseH}, yOff=${yOff}, actualH=${actualH}, centerY=${y}, bottom=${y - actualH / 2}`);

        obstacle.init(type, this._speed, y);

        // 检查是否与拾取物视觉重叠（拾取物先到的位置，障碍物不能抢）
        if (this._overlapsAnyPickup(node)) {
            pool.recycle(node);
            return;
        }

        this._activeObstacles.push(obstacle);

        node.on('obstacle_off_screen', this._onObstacleOffScreen, this);
        EventBus.emit(GameEvent.OBSTACLE_SPAWNED, type);
    }

    /** 按当前 obstacleScale 等比缩放视觉 + 碰撞体 */
    private _applyScaleToNode(node: Node): void {
        // 显式从节点存储读取基准参数（用 ?? 代替 || 确保 0 不被 fallback 吞掉）
        const baseW: number = (node as any)._baseW;
        const baseH: number = (node as any)._baseH;
        const baseR: number = (node as any)._baseR;
        const baseG: number = (node as any)._baseG;
        const baseB: number = (node as any)._baseB;
        const hasSprite: boolean = (node as any)._hasSprite === true;

        // 运行时断言：如果基准参数缺失，打印错误并使用安全 fallback
        if (baseW == null || baseH == null) {
            console.error(`[ObstacleSpawner] _applyScaleToNode: node "${node.name}" 缺少 _baseW/_baseH，使用默认 fallback`);
        }
        const vw = (baseW ?? 40) * this.obstacleScale;
        const vh = (baseH ?? 80) * this.obstacleScale;

        // 视觉大小
        const ui = node.getComponent(UITransform);
        ui.setContentSize(vw, vh);

        if (!hasSprite) {
            // 纯色模式：重绘 Graphics 矩形
            const gr = node.getComponent(Graphics);
            if (gr) {
                gr.clear();
                gr.fillColor = new Color(baseR ?? 121, baseG ?? 85, baseB ?? 72, 255);
                gr.rect(-vw / 2, -vh / 2, vw, vh);
                gr.fill();
            }
        }
        // 图片模式：Sprite(CUSTOM) 自动填充 UITransform，无需额外处理

        // 碰撞体等比缩放
        const bc = node.getComponent(BoxCollider2D);
        bc.size = new Size(vw * COLLIDER_W_RATIO, vh * COLLIDER_H_RATIO);
    }

    // ========== 私有：辅助 ==========

    /** 检查障碍物节点是否与任何活跃拾取物视觉重叠 */
    private _overlapsAnyPickup(obsNode: Node): boolean {
        const container = this.node.parent?.getChildByName('PickupContainer');
        if (!container) return false;

        const obsTransform = obsNode.getComponent(UITransform);
        const oW = obsTransform ? obsTransform.width : 40;
        const oH = obsTransform ? obsTransform.height : 80;
        const ox = obsNode.position.x;
        const oy = obsNode.position.y;
        const oLeft = ox - oW / 2;
        const oRight = ox + oW / 2;
        const oBottom = oy - oH / 2;
        const oTop = oy + oH / 2;

        const pickups = container.getComponentsInChildren(PickupItem);
        for (const pickup of pickups) {
            if (!pickup.node.active) continue;
            const pTransform = pickup.node.getComponent(UITransform);
            const pW = pTransform ? pTransform.width : 30;
            const pH = pTransform ? pTransform.height : 30;
            const px = pickup.node.position.x;
            const py = pickup.node.position.y;
            const pLeft = px - pW / 2;
            const pRight = px + pW / 2;
            const pBottom = py - pH / 2;
            const pTop = py + pH / 2;

            if (oLeft < pRight && oRight > pLeft && oBottom < pTop && oTop > pBottom) {
                return true;
            }
        }
        return false;
    }

    private _pickType(): string {
        const available = this._availableTypes.filter(t => this._pools.has(t));
        if (available.length === 0) return this._availableTypes[0];
        const candidates = available.filter(t => t !== this._lastObstacleType);
        const picked = candidates.length > 0 ? candidates : available;
        this._lastObstacleType = picked[Math.floor(Math.random() * picked.length)];
        return this._lastObstacleType;
    }

    private _onObstacleOffScreen(obstacle: Obstacle): void {
        this.recycleObstacle(obstacle);
    }

    private _updateAvailableTypes(score: number): void {
        this._availableTypes = [ObstacleType.CACTUS_SMALL];
        if (score >= 100 && this._pools.has(ObstacleType.CACTUS_LARGE)) this._availableTypes.push(ObstacleType.CACTUS_LARGE);
        if (score >= 200 && this._pools.has(ObstacleType.BIRD_LOW))     this._availableTypes.push(ObstacleType.BIRD_LOW);
        if (score >= 300 && this._pools.has(ObstacleType.CACTUS_GROUP)) this._availableTypes.push(ObstacleType.CACTUS_GROUP);
        if (score >= 450 && this._pools.has(ObstacleType.BIRD_HIGH))    this._availableTypes.push(ObstacleType.BIRD_HIGH);
    }

    private _updateSpawnInterval(score: number): void {
        for (let i = GameConfig.SPAWN_INTERVAL_LEVELS.length - 1; i >= 0; i--) {
            if (score >= GameConfig.SPAWN_INTERVAL_LEVELS[i][0]) {
                this._spawnMinInterval = GameConfig.SPAWN_INTERVAL_LEVELS[i][1];
                this._spawnMaxInterval = GameConfig.SPAWN_INTERVAL_LEVELS[i][2];
                return;
            }
        }
    }

    private _randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    // ========== 事件回调 ==========
    private _onGameStart(): void { this._running = true; this._spawnTimer = 0; this._nextSpawnTime = this._randomRange(1.0, this._spawnMaxInterval); }
    private _onGameOver(): void {
        this._running = false;
        this._speed = 0;
        for (const obs of [...this._activeObstacles]) this.recycleObstacle(obs);
        this._activeObstacles = [];
    }
    private _onGameRestart(): void {
        this._running = false; this._speed = 0;
        for (const obs of [...this._activeObstacles]) this.recycleObstacle(obs);
        this._activeObstacles = []; this._spawnTimer = 0;
        this._availableTypes = [ObstacleType.CACTUS_SMALL]; this._lastObstacleType = '';
    }
    private _onSpeedChange(speed: number): void { this._speed = speed; }
    private _onScoreChange(score: number): void { this._updateAvailableTypes(score); this._updateSpawnInterval(score); }
}
