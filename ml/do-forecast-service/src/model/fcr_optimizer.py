"""
FCR（饲料转化率）优化算法

根据水温、DO、鱼群密度计算代谢强度，推荐最佳投喂窗口
"""

import numpy as np
from datetime import datetime, timedelta


class FCROptimizer:
    """FCR 优化器"""

    def __init__(self):
        print("[FCR] optimizer initialized")

    def metabolic_rate(
        self,
        temperature: float,
        do: float,
        fish_density: float,  # 尾/m³
    ) -> float:
        """
        计算鱼群代谢强度 (0-1)

        代谢强度 = f(水温, DO, 密度)
        - 最适水温 24-28°C
        - DO > 5.0 正常代谢
        """
        # 水温因子 (高斯型，最适 26°C)
        temp_opt = 26.0
        temp_factor = np.exp(-((temperature - temp_opt) ** 2) / 20)

        # DO 因子 (sigmoid)
        do_factor = 1 / (1 + np.exp(-2 * (do - 4.0)))

        # 密度因子
        density_factor = min(1.0, fish_density / 25.0)

        return round(temp_factor * do_factor * density_factor, 3)

    def feeding_window(
        self,
        temperature: float,
        do: float,
        fish_density: float,
        fish_count: int,
    ) -> dict:
        """
        推荐最佳投喂窗口

        条件:
        - 水温 22-28°C
        - DO > 5.0 mg/L
        - 代谢强度 > 0.4
        """

        metab = self.metabolic_rate(temperature, do, fish_density)

        if 22 <= temperature <= 28 and do > 5.0 and metab > 0.4:
            window_start = datetime.now()
            window_end = window_start + timedelta(minutes=45)

            # 推荐投喂量 (体重的 1-3%)
            avg_weight_kg = 0.8  # 假设均重
            total_biomass = fish_count * avg_weight_kg
            feed_rate = 0.015 + metab * 0.015  # 1.5-3%
            feed_amount = round(total_biomass * feed_rate, 1)

            return {
                "recommended": True,
                "window_start": window_start.isoformat(),
                "window_end": window_end.isoformat(),
                "duration_min": 45,
                "metabolic_rate": metab,
                "feed_amount_kg": feed_amount,
                "feed_rate_pct": round(feed_rate * 100, 1),
            }
        else:
            reasons = []
            if not (22 <= temperature <= 28):
                reasons.append(f"水温 {temperature}°C 不在 22-28°C 范围")
            if do <= 5.0:
                reasons.append(f"DO {do}mg/L 低于 5.0mg/L")
            if metab <= 0.4:
                reasons.append(f"代谢强度 {metab} 过低")

            return {
                "recommended": False,
                "metabolic_rate": metab,
                "reasons": reasons,
                "next_check_min": 15,
            }
