"""
LSTM 溶解氧预测模型

架构: 输入(120 timesteps × 7 features) → LSTM128 → LSTM64 → Dense32 → 输出(120min)
演示版: 无 TensorFlow 依赖，用 numpy 生成符合物理规律的模拟预测
"""

import numpy as np

# 模型参数
LOOKBACK = 120   # 输入时间步
FORECAST = 120   # 预测时间步 (2h)
FEATURES = 7     # DO, 水温, pH, 气压, 光照, 氨氮, ORP


class DOModel:
    """溶解氧预测模型 — 演示版用物理规律模拟，生产版替换为 Keras LSTM"""

    def __init__(self):
        self.ready = True
        self.version = "1.0.0-demo"
        print(f"[LSTM] model v{self.version} loaded (demo mode)")

    def predict(
        self,
        current_do: float,
        current_temp: float,
        current_ph: float,
        pressure: float = 1013.0,
        light: float = 500.0,
        nh3n: float = 0.15,
        orp: float = 320.0,
    ) -> dict:
        """
        生成未来 120min DO 预测

        物理规律模拟:
        - DO 日间因光合作用缓慢上升，夜间因呼吸下降
        - 水温高 → DO 消耗加快
        - 气压低 → DO 下降趋势
        - 氨氮高 → 加剧下降
        """

        # 当前时间的小时 (模拟用)
        hour = 18  # 假设傍晚，DO 趋于下降

        # 趋势计算
        temp_factor = (current_temp - 26) * 0.02  # 水温偏差影响
        pressure_factor = (1013 - pressure) * 0.001  # 低气压 → 下降
        nh3n_factor = (nh3n - 0.15) * 0.5
        base_trend = -0.003  # 基础夜间下降趋势

        trend = base_trend + temp_factor + pressure_factor + nh3n_factor
        noise = np.random.normal(0, 0.015, FORECAST)

        # 生成预测序列
        predicted = np.zeros(FORECAST)
        predicted[0] = current_do + trend + noise[0]
        for i in range(1, FORECAST):
            predicted[i] = predicted[i - 1] + trend + noise[i]
            # 物理约束: DO 不低于 0，不超过 20
            predicted[i] = np.clip(predicted[i], 0.5, 18.0)

        # 置信区间 (随时间扩大)
        times = np.arange(FORECAST)
        uncertainty = 0.05 + 0.003 * times  # 越远越不确定
        lower = predicted - 1.96 * uncertainty
        upper = predicted + 1.96 * uncertainty

        # 预测性能指标
        mae_estimate = 0.15 + np.mean(np.abs(trend)) * 50

        return {
            "model_version": self.version,
            "forecast_horizon_min": FORECAST,
            "timestamps": (np.arange(FORECAST) * 60 * 1000).tolist(),  # ms from now
            "predicted_values": np.round(predicted, 3).tolist(),
            "lower_bound": np.round(lower, 3).tolist(),
            "upper_bound": np.round(upper, 3).tolist(),
            "confidence_90": True,
            "estimated_mae": round(mae_estimate, 3),
            "critical_points": self._find_critical(predicted),
        }

    def _find_critical(self, predicted: np.ndarray) -> list:
        """找出 DO 跌破阈值的时间点"""
        critical = []
        for i, v in enumerate(predicted):
            if v < 4.5:
                critical.append({"time_min": i + 1, "value": round(v, 2), "level": "red"})
                break
        for i, v in enumerate(predicted):
            if 4.5 <= v < 5.0:
                critical.append({"time_min": i + 1, "value": round(v, 2), "level": "yellow"})
                break
        return critical
