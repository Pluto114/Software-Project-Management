"""
DO 预测服务 — FastAPI 推理 API

启动: uvicorn serve:app --host 0.0.0.0 --port 8000
      或在 ml/do-forecast-service 目录: python src/serve.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import time

from model.lstm_model import DOModel
from model.fcr_optimizer import FCROptimizer

app = FastAPI(
    title="AquaIntelligence DO Forecast Service",
    version="1.0.0",
    description="LSTM 溶解氧预测 + FCR 饲料转化率优化",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 启动时加载模型
model = DOModel()
optimizer = FCROptimizer()


class PredictRequest(BaseModel):
    pool_id: str = Field(default="P01", description="养殖池 ID")
    do: float = Field(..., description="当前溶解氧 mg/L")
    temp: float = Field(..., description="当前水温 °C")
    ph: float = Field(..., description="当前 pH")
    pressure: float = Field(default=1013.0, description="气压 hPa")
    light: float = Field(default=500.0, description="光照强度 lux")
    nh3n: float = Field(default=0.15, description="氨氮 mg/L")
    orp: float = Field(default=320.0, description="ORP mV")


class FeedWindowRequest(BaseModel):
    pool_id: str = Field(default="P01")
    temperature: float = Field(..., description="水温 °C")
    do: float = Field(..., description="溶解氧 mg/L")
    fish_density: float = Field(default=20.0, description="鱼群密度 尾/m³")
    fish_count: int = Field(default=10000, description="存池数量")


@app.get("/health")
def health():
    return {
        "service": "do-forecast-service",
        "status": "ok",
        "model_version": model.version,
        "model_ready": model.ready,
    }


@app.get("/api/v1/ai/predictions")
def get_predictions(
    pool_id: str = Query(default="P01", description="养殖池 ID"),
    horizon: int = Query(default=120, description="预测时长 min"),
):
    """
    获取 AI 预测结果

    使用默认参数模拟传感器数据，生产环境需从 InfluxDB 读取最新值
    """
    t0 = time.perf_counter()

    # 模拟从 InfluxDB 读取最新传感器值
    result = model.predict(
        current_do=5.6,
        current_temp=27.2,
        current_ph=7.6,
    )

    inference_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "pool_id": pool_id,
        "horizon_min": horizon,
        "inference_ms": inference_ms,
        "under_70ms": inference_ms < 70,
        **result,
    }


@app.post("/api/v1/ai/predict")
def post_predict(req: PredictRequest):
    """接收实时传感器数据，返回预测结果"""
    t0 = time.perf_counter()

    result = model.predict(
        current_do=req.do,
        current_temp=req.temp,
        current_ph=req.ph,
        pressure=req.pressure,
        light=req.light,
        nh3n=req.nh3n,
        orp=req.orp,
    )

    inference_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "pool_id": req.pool_id,
        "inference_ms": inference_ms,
        "under_70ms": inference_ms < 70,
        **result,
    }


@app.get("/api/v1/ai/feeding-window")
def get_feeding_window(
    pool_id: str = Query(default="P01"),
    temperature: float = Query(default=27.0),
    do: float = Query(default=5.8),
    fish_density: float = Query(default=22.0),
    fish_count: int = Query(default=12000),
):
    """获取最佳投喂窗口建议"""
    result = optimizer.feeding_window(
        temperature=temperature,
        do=do,
        fish_density=fish_density,
        fish_count=fish_count,
    )
    return {
        "pool_id": pool_id,
        **result,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
