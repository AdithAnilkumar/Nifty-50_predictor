import os
import sys
import json
import numpy as np
import pandas as pd
from typing import Optional, Dict, Any
from datetime import datetime

# Add project root to sys.path
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
    title="NIFTY-50 Time Series Forecasting API",
    description="Backend API serving real-time NIFTY-50 market data, PyTorch LSTM predictions for next 5-6 days High and Low values, and charting data.",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory cache to make frontend requests ultra-fast
_cached_data = {
    "last_fetched": None,
    "forecast_df": None,
    "history_df": None,
    "market_summary": None,
    "is_training": False
}

def get_or_update_forecast(horizon: int = 6, force_refresh: bool = False):
    """
    Returns cached forecast and data or computes new forecast.
    """
    now = datetime.now()
    cache_valid = (
        not force_refresh 
        and _cached_data["forecast_df"] is not None 
        and _cached_data["last_fetched"] is not None
        and (now - _cached_data["last_fetched"]).total_seconds() < 300  # 5 min cache
    )
    
    if cache_valid and len(_cached_data["forecast_df"]) == horizon:
        return _cached_data["forecast_df"], _cached_data["history_df"], _cached_data["market_summary"]
        
    fdf, hdf, summary = generate_forecast(horizon_days=horizon, force_refresh_data=force_refresh)
    _cached_data["last_fetched"] = now
    _cached_data["forecast_df"] = fdf
    _cached_data["history_df"] = hdf
    _cached_data["market_summary"] = summary
    return fdf, hdf, summary

@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "service": "NIFTY-50 Deep Learning Forecaster",
        "experiment": "Experiment 13 - Time Series Forecasting for the NIFTY-50 Dataset (CO4)",
        "model": "Stacked PyTorch LSTM (2 Layers, 128 Hidden Dim, Multi-Horizon Projection)",
        "server_time": datetime.now().isoformat()
    }

@app.get("/api/market")
def get_market_summary(force_refresh: bool = Query(False)):
    try:
        _, _, summary = get_or_update_forecast(force_refresh=force_refresh)
        return {"status": "success", "data": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/predict")
def get_predictions(
    horizon: int = Query(6, ge=1, le=10, description="Forecast horizon in trading days"),
    force_refresh: bool = Query(False)
):
    """
    Returns the predicted High, Low, Close, Open, Spread, and Trend Bias for the next 5-6 trading days.
    """
    try:
        fdf, _, summary = get_or_update_forecast(horizon=horizon, force_refresh=force_refresh)
        records = fdf.to_dict(orient="records")
        return {
            "status": "success",
            "horizon": horizon,
            "market_summary": summary,
            "forecast": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chart-data")
def get_chart_data(
    history_days: int = Query(90, ge=15, le=365, description="Days of historical candlesticks to return"),
    horizon: int = Query(6, ge=1, le=10),
    force_refresh: bool = Query(False)
):
    """
    Returns combined data for rendering the current NIFTY-50 chart and the predicted one in the exact same graph.
    """
    try:
        fdf, hdf, summary = get_or_update_forecast(horizon=horizon, force_refresh=force_refresh)
        
        # Slice historical data
        hist_slice = hdf.tail(history_days).copy()
        
        # Calculate moving averages & Bollinger Bands
        sma20 = hist_slice['Close'].rolling(20).mean()
        sma50 = hist_slice['Close'].rolling(50).mean()
        rolling_std = hist_slice['Close'].rolling(20).std()
        upper_bb = sma20 + (2 * rolling_std)
        lower_bb = sma20 - (2 * rolling_std)
        
        historical_points = []
        for idx, row in hist_slice.iterrows():
            d_str = idx.strftime('%Y-%m-%d')
            historical_points.append({
                "date": d_str,
                "open": round(float(row['Open']), 2),
                "high": round(float(row['High']), 2),
                "low": round(float(row['Low']), 2),
                "close": round(float(row['Close']), 2),
                "volume": int(row['Volume']) if not np.isnan(row['Volume']) else 0,
                "sma20": round(float(sma20.loc[idx]), 2) if not np.isnan(sma20.loc[idx]) else None,
                "sma50": round(float(sma50.loc[idx]), 2) if not np.isnan(sma50.loc[idx]) else None,
                "upper_bb": round(float(upper_bb.loc[idx]), 2) if not np.isnan(upper_bb.loc[idx]) else None,
                "lower_bb": round(float(lower_bb.loc[idx]), 2) if not np.isnan(lower_bb.loc[idx]) else None,
                "rsi": round(float(row['RSI_14']), 2) if 'RSI_14' in row and not np.isnan(row['RSI_14']) else None,
                "is_forecast": False
            })
            
        # Parse forecast items
        forecast_points = []
        for _, row in fdf.iterrows():
            # Date format in fdf is like '30-Oct-2026 (Fri)'
            date_clean = row['Date'].split(' (')[0]
            dt_obj = datetime.strptime(date_clean, '%d-%b-%Y')
            d_str = dt_obj.strftime('%Y-%m-%d')
            
            forecast_points.append({
                "date": d_str,
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
            
        # Load metrics
        metrics = {}
        if os.path.exists("models/metrics.json"):
            with open("models/metrics.json", "r") as f:
                metrics = json.load(f)
                
        return {
            "status": "success",
            "market_summary": summary,
            "transition_date": hist_slice.index[-1].strftime('%Y-%m-%d'),
            "transition_price": round(float(hist_slice['Close'].iloc[-1]), 2),
            "historical": historical_points,
            "forecast": forecast_points,
            "metrics": metrics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RetrainRequest(BaseModel):
    epochs: int = 30
    learning_rate: float = 0.002

@app.post("/api/retrain")
def retrain_model_endpoint(req: RetrainRequest, background_tasks: BackgroundTasks):
    if _cached_data["is_training"]:
        return {"status": "busy", "message": "A training session is already in progress."}
        
    def run_training_task(ep: int, lr: float):
        _cached_data["is_training"] = True
        try:
            train_model(epochs=ep, learning_rate=lr)
            # Invalidate cache
            _cached_data["forecast_df"] = None
        finally:
            _cached_data["is_training"] = False
            
    background_tasks.add_task(run_training_task, req.epochs, req.learning_rate)
    return {
        "status": "started",
        "message": f"Training initiated in background for {req.epochs} epochs with learning rate {req.learning_rate}."
    }

# Mount static frontend
frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)

