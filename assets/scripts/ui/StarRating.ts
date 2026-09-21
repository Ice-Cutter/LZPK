import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 星级评定组件
 * 游戏结束后根据最终分数评定 1-3 星，逐颗弹出展示
 * 挂载：GameOverPanel/StarContainer 节点
 */
@ccclass('StarRating')
export class StarRating extends Component {
    // ========== 编辑器属性 ==========
    @property({ type: [Node], tooltip: '星星节点，从左到右依次拖入（共 3 个）' })
    starNodes: Node[] = [];

    @property({ tooltip: '达到 2 星的最低分数' })
    threshold2Stars: number = 1000;

    @property({ tooltip: '达到 3 星的最低分数' })
    threshold3Stars: number = 2500;

    @property({ tooltip: '每颗星弹出间隔（秒）' })
    animateInterval: number = 0.4;

    // ========== 公有方法 ==========

    /** 根据分数评定并逐颗展示星级，全部弹出后调用 onComplete */
    public evaluate(score: number, onComplete?: () => void): void {
        this.reset();
        const count = Math.min(this.getStarCount(score), this.starNodes.length);
        for (let i = 0; i < count; i++) {
            this.scheduleOnce(() => {
                const star = this.starNodes[i];
                if (star) star.active = true;
                if (i === count - 1 && onComplete) onComplete();
            }, i * this.animateInterval);
        }
    }

    /** 纯计算：返回应得星数（1-3） */
    public getStarCount(score: number): number {
        if (score >= this.threshold3Stars) return 3;
        if (score >= this.threshold2Stars) return 2;
        return 1;
    }

    /** 重置：取消未完成的弹出动画并隐藏全部星星 */
    public reset(): void {
        this.unscheduleAllCallbacks();
        for (const star of this.starNodes) {
            if (star) star.active = false;
        }
    }
}
