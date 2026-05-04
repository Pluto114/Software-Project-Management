"""
模型训练脚本 (生产环境)

训练流程:
1. 从 InfluxDB 拉取历史数据
2. 数据清洗 + 特征工程
3. 滑动窗口切分
4. LSTM 训练 (早停 + 学习率衰减)
5. 模型保存 + 版本管理

演示模式: 跳过训练，使用 DOModel (mock) 直接推理

使用:
  # 训练
  python src/train.py --epochs 100 --batch-size 32

  # 仅验证
  python src/train.py --validate-only
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))


def parse_args():
    p = argparse.ArgumentParser(description="DO LSTM 模型训练")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--learning-rate", type=float, default=0.001)
    p.add_argument("--validate-only", action="store_true")
    p.add_argument("--data-start", default="-30d", help="训练数据起始时间")
    return p.parse_args()


def main():
    args = parse_args()

    print("=" * 50)
    print("AquaIntelligence DO LSTM 训练")
    print("=" * 50)
    print(f"epochs: {args.epochs}")
    print(f"batch_size: {args.batch_size}")
    print(f"learning_rate: {args.learning_rate}")

    # 演示模式 — 无实际训练
    print("\n[INFO] 演示模式 — 跳过实际训练")
    print("[INFO] 生产环境需:")
    print("  1. 安装 tensorflow>=2.12.0")
    print("  2. 配置 InfluxDB 连接 (INFLUX_URL, INFLUX_TOKEN)")
    print("  3. 运行: python src/train.py --epochs 100")
    print("\n[INFO] 当前使用 DOModel (mock) 进行推理，无需训练")
    print("[INFO] 启动推理服务: python src/serve.py")


if __name__ == "__main__":
    main()
