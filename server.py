import os
import sys
import json
import numpy as np
import pandas as pd
from typing import Optional, Dict, Any
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from src.predict import load_predictor, generate_forecast
from src.data_utils import fetch_nifty_data, add_technical_indicators
from train import train_model

app = FastAPI(
    title="NIFTY-50 Time Series Forecasting API (5-Min & Daily)",
    description="Backend API serving real-time 5-minute and daily NIFTY-50 market data and PyTorch LSTM predictions.",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cached_data = {
    "5m": {"last_fetched": None, "forecast_df": None, "history_df": None, "market_summary": None},
    "1d": {"last_fetched": None, "forecast_df": None, "history_df": None, "market_summary": None},
    "is_training": False
}

def get_or_update_forecast(interval: str = '5m', horizon: int = 6, force_refresh: bool = False):
    now = datetime.now()
    c = _cached_data[interval]
    cache_valid = (
        not force_refresh 
        and c["forecast_df"] is not None 
        and c["last_fetched"] is not None
        and (now - c["last_fetched"]).total_seconds() < 120  # 2 min cache
    )
    
    if cache_valid and len(c["forecast_df"]) == horizon:
        return c["forecast_df"], c["history_df"], c["market_summary"]
        
    fdf, hdf, summary = generate_forecast(interval=interval, horizon_days=horizon, force_refresh_data=force_refresh)
    c["last_fetched"] = now
    c["forecast_df"] = fdf
    c["history_df"] = hdf
    c["market_summary"] = summary
    return fdf, hdf, summary

@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "service": "NIFTY-50 Deep Learning Forecaster",
        "supported_intervals": ["5m", "1d"],
        "default_interval": "5m",
        "model": "Stacked PyTorch LSTM (60/30-step memory, Multi-Horizon Projection)",
        "server_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S IST')
    }

@app.get("/api/market")
def get_market_summary(interval: str = Query('5m'), force_refresh: bool = Query(False)):
    try:
        _, _, summary = get_or_update_forecast(interval=interval, force_refresh=force_refresh)
        return {"status": "success", "data": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/predict")
def get_predictions(
    interval: str = Query('5m'),
    horizon: int = Query(6, ge=1, le=10),
    force_refresh: bool = Query(False)
):
    try:
        fdf, _, summary = get_or_update_forecast(interval=interval, horizon=horizon, force_refresh=force_refresh)
        records = fdf.to_dict(orient="records")
        return {
            "status": "success",
            "interval": interval,
            "horizon": horizon,
            "market_summary": summary,
            "forecast": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chart-data")
def get_chart_data(
    interval: str = Query('5m'),
    bars: int = Query(75, ge=20, le=400, description="Candles of historical data (75 = 1 full trading day of 5m)"),
    horizon: int = Query(6, ge=1, le=10),
    force_refresh: bool = Query(False)
):
    try:
        fdf, hdf, summary = get_or_update_forecast(interval=interval, horizon=horizon, force_refresh=force_refresh)
        
        hist_slice = hdf.tail(bars).copy()
        
        sma20 = hist_slice['Close'].rolling(20).mean()
        rolling_std = hist_slice['Close'].rolling(20).std()
        upper_bb = sma20 + (2 * rolling_std)
        lower_bb = sma20 - (2 * rolling_std)
        
        historical_points = []
        for idx, row in hist_slice.iterrows():
            if interval == '5m':
                # Exact ISO datetime format
                d_str = idx.strftime('%Y-%m-%d %H:%M:%S')
                display_str = idx.strftime('%d-%b %H:%M')
            else:
                d_str = idx.strftime('%Y-%m-%d')
                display_str = idx.strftime('%d-%b-%Y')
                
            historical_points.append({
                "date": d_str,
                "display_date": display_str,
                "open": round(float(row['Open']), 2),
                "high": round(float(row['High']), 2),
                "low": round(float(row['Low']), 2),
                "close": round(float(row['Close']), 2),
                "volume": int(row['Volume']) if not np.isnan(row['Volume']) else 0,
                "sma20": round(float(sma20.loc[idx]), 2) if not np.isnan(sma20.loc[idx]) else None,
                "upper_bb": round(float(upper_bb.loc[idx]), 2) if not np.isnan(upper_bb.loc[idx]) else None,
                "lower_bb": round(float(lower_bb.loc[idx]), 2) if not np.isnan(lower_bb.loc[idx]) else None,
                "rsi": round(float(row['RSI_14']), 2) if 'RSI_14' in row and not np.isnan(row['RSI_14']) else None,
                "is_forecast": False
            })
            
        forecast_points = []
        for _, row in fdf.iterrows():
            forecast_points.append({
                "date": row['IsoDate'],
                "display_date": row['Date'],
                "day": row['Day'],
                "open": float(row['Predicted_Open']),
                "high": float(row['Predicted_High']),
                "low": float(row['Predicted_Low']),
                "close": float(row['Predicted_Close']),
                "spread": float(row['High_Low_Spread']),
                "change_pct": float(row['Change_%']),
                "trend_bias": row['Trend_Bias'],
                "is_forecast": True
            })
            
        last_idx = hist_slice.index[-1]
        transition_str = last_idx.strftime('%Y-%m-%d %H:%M:%S') if interval == '5m' else last_idx.strftime('%Y-%m-%d')
        
        # Load metrics
        suffix = f"_{interval}" if interval != '1d' else ""
        metrics_file = f"models/metrics{suffix}.json"
        metrics = {}
        if os.path.exists(metrics_file):
            with open(metrics_file, "r") as f:
                metrics = json.load(f)
                
        return {
            "status": "success",
            "interval": interval,
            "market_summary": summary,
            "transition_date": transition_str,
            "transition_price": round(float(hist_slice['Close'].iloc[-1]), 2),
            "historical": historical_points,
            "forecast": forecast_points,
            "metrics": metrics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RetrainRequest(BaseModel):
    interval: str = '5m'
    epochs: int = 25
    learning_rate: float = 0.003

@app.post("/api/retrain")
def retrain_model_endpoint(req: RetrainRequest, background_tasks: BackgroundTasks):
    if _cached_data["is_training"]:
        return {"status": "busy", "message": "A training session is already in progress."}
        
    def run_training_task(inv: str, ep: int, lr: float):
        _cached_data["is_training"] = True
        try:
            train_model(interval=inv, epochs=ep, learning_rate=lr)
            _cached_data[inv]["forecast_df"] = None
        finally:
            _cached_data["is_training"] = False
            
    background_tasks.add_task(run_training_task, req.interval, req.epochs, req.learning_rate)
    return {
        "status": "started",
        "message": f"Training initiated in background for {req.interval} model ({req.epochs} epochs)."
    }

frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
