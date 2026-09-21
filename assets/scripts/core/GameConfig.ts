/**
 * 游戏配置常量
 * 所有可调参数集中管理，方便调试和平衡性调整
 */
export class GameConfig {
    // ========== 画布 & 物理 ==========
    static readonly DESIGN_WIDTH: number = 1920;
    static readonly DESIGN_HEIGHT: number = 1080;
    static readonly GROUND_Y: number = 0;               // 地面 Y 坐标（视角中央）
    static readonly PLAYER_X: number = -600;            // 玩家 X 坐标（固定）

    // ========== 玩家 ==========
    static readonly PLAYER_JUMP_FORCE: number = 900;  // 跳跃初速度
    static readonly PLAYER_GRAVITY: number = -2800;   // 重力加速度
    static readonly PLAYER_HIGH_JUMP_FORCE: number = 1100; // 高跳（长按）
    static readonly PLAYER_CROUCH_DURATION: number = 0.3;  // 下蹲过渡时间

    // ========== 速度 & 难度 ==========
    static readonly INITIAL_SPEED: number = 400;      // 初始速度 px/s

    /** 速度等级配置 [分数阈值, 速度] */
    static readonly SPEED_LEVELS: [number, number][] = [
        [0,    400],
        [200,  500],
        [500,  600],
        [1000, 750],
        [2000, 900],
    ];

    /** 每超过 2000 分，每 500 分增加的速度 */
    static readonly SPEED_BEYOND_2000_PER_500: number = 50;
    static readonly MAX_SPEED: number = 1200;

    /** 障碍物生成间隔 [minSeconds, maxSeconds] */
    static readonly SPAWN_INTERVAL_LEVELS: [number, number, number][] = [
        // [分数阈值, minInterval, maxInterval]
        [0,    1.8, 2.8],
        [200,  1.3, 2.2],
        [500,  0.9, 1.8],
        [1000, 0.7, 1.4],
        [2000, 0.5, 1.1],
    ];

    static readonly MIN_SPAWN_GAP: number = 350;       // 障碍物最小间距 px

    // ========== 障碍物 ==========
    static readonly OBSTACLE_SPAWN_X: number = 1200;    // 生成位置 X
    static readonly OBSTACLE_DESPAWN_X: number = -1200;  // 回收位置 X
    static readonly OBSTACLE_POOL_SIZE: number = 8;    // 每种类型的池大小

    // ========== 分数 ==========
    static readonly SCORE_PER_SECOND: number = 10;     // 基础每秒分数
    static readonly MILESTONE_INTERVAL: number = 100;  // 里程碑间隔

    // ========== 背景视差 ==========
    static readonly PARALLAX_RATIOS: number[] = [0.1, 0.3, 0.6]; // 远→近

    // ========== 拾取物 ==========
    static readonly PICKUP_SPAWN_X: number = 1300;
    static readonly PICKUP_DESPAWN_X: number = -1300;
    static readonly PICKUP_POOL_SIZE: number = 10;

    // 拾取物分数
    static readonly COIN_SCORE: number = 10;
    static readonly SHIELD_SCORE: number = 30;
    static readonly MAGNET_SCORE: number = 20;
    static readonly SPEED_BOOST_SCORE: number = 15;

    // 道具持续时间（秒）
    static readonly MAGNET_DURATION: number = 5.0;
    static readonly SPEED_BOOST_DURATION: number = 2.0;
    static readonly SPEED_BOOST_MULTIPLIER: number = 1.5;

    // 生成间隔 [分数阈值, minInterval, maxInterval]（秒）
    static readonly PICKUP_SPAWN_INTERVALS: [number, number, number][] = [
        [0,    3.0, 6.0],
        [200,  3.0, 6.0],
        [500,  2.5, 5.0],
        [1000, 2.0, 4.5],
        [2000, 1.5, 4.0],
    ];

    // ========== 本地存储键 ==========
    static readonly STORAGE_HIGH_SCORE = 'pk_runner_high_score';
    static readonly STORAGE_TOTAL_GAMES = 'pk_runner_total_games';
    static readonly STORAGE_TOTAL_COINS = 'pk_runner_total_coins';
}
