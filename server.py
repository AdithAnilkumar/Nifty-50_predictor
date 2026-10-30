import os
import sys
import json
import numpy as np
import pandas as pd
import yfinance as yf
from typing import Optional, Dict, Any, List
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
    title="NIFTY-50 TradingView AI Forecaster API",
    description="Backend API serving real-time TradingView-compatible 5-minute and daily NIFTY-50 data, watchlist, and PyTorch LSTM predictions.",
    version="2.0.0"
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
    "watchlist": {"last_fetched": None, "data": []},
    "is_training": False
}

def fetch_major_indices_watchlist() -> List[Dict[str, Any]]:
    now = datetime.now()
    if _cached_data["watchlist"]["last_fetched"] is not None and (now - _cached_data["watchlist"]["last_fetched"]).total_seconds() < 60:
        return _cached_data["watchlist"]["data"]
        
    symbols = {
        'NIFTY': '^NSEI',
        'BANKNIFTY': '^NSEBANK',
        'SENSEX': '^BSESN',
        'CNXIT': '^CNXIT',
        'SPX': '^GSPC'
    }
    try:
        data = yf.download(list(symbols.values()), period='2d', progress=False)
        watchlist = []
        if hasattr(data.columns, 'levels') and 'Close' in data:
            close = data['Close']
            for name, sym in symbols.items():
                if sym in close.columns:
                    series = close[sym].dropna()
                    if len(series) >= 2:
                        last = float(series.iloc[-1])
                        prev = float(series.iloc[-2])
                        chg = last - prev
                        pct = (chg / prev) * 100.0
                        watchlist.append({
                            'symbol': name,
                            'last': round(last, 2),
                            'chg': round(chg, 2),
                            'pct': round(pct, 2)
                        })
        if watchlist:
            _cached_data["watchlist"]["data"] = watchlist
            _cached_data["watchlist"]["last_fetched"] = now
            return watchlist
    except Exception as e:
        print("Watchlist fetch error:", e)
        
    return _cached_data["watchlist"]["data"] or [
        {'symbol': 'NIFTY', 'last': 22966.25, 'chg': 29.50, 'pct': 0.13},
        {'symbol': 'BANKNIFTY', 'last': 54770.25, 'chg': -139.40, 'pct': -0.25},
        {'symbol': 'SENSEX', 'last': 74119.53, 'chg': -31.51, 'pct': -0.04},
        {'symbol': 'CNXIT', 'last': 32391.60, 'chg': 525.20, 'pct': 1.65},
        {'symbol': 'SPX', 'last': 5720.39, 'chg': -23.59, 'pct': -0.30}
    ]

def get_or_update_forecast(interval: str = '5m', horizon: int = 6, force_refresh: bool = False):
    now = datetime.now()
    c = _cached_data[interval]
    cache_valid = (
        not force_refresh 
        and c["forecast_df"] is not None 
        and c["last_fetched"] is not None
        and (now - c["last_fetched"]).total_seconds() < 90
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
        "service": "NIFTY-50 TradingView AI Forecaster",
        "supported_intervals": ["5m", "1d"],
        "default_interval": "5m",
        "model": "Stacked PyTorch LSTM (Relative-Offset Representation)",
        "server_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S IST')
    }

@app.get("/api/market")
def get_market_summary(interval: str = Query('5m'), force_refresh: bool = Query(False)):
    try:
        _, _, summary = get_or_update_forecast(interval=interval, force_refresh=force_refresh)
        watchlist = fetch_major_indices_watchlist()
        return {"status": "success", "data": summary, "watchlist": watchlist}
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
        watchlist = fetch_major_indices_watchlist()
        return {
            "status": "success",
            "interval": interval,
            "horizon": horizon,
            "market_summary": summary,
            "watchlist": watchlist,
            "forecast": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chart-data")
def get_chart_data(
    interval: str = Query('5m'),
    bars: int = Query(120, ge=20, le=500),
    horizon: int = Query(6, ge=1, le=10),
    force_refresh: bool = Query(False)
):
    """
    Returns data formatted for TradingView Lightweight Charts (with unix timestamps in seconds).
    """
    try:
        fdf, hdf, summary = get_or_update_forecast(interval=interval, horizon=horizon, force_refresh=force_refresh)
        watchlist = fetch_major_indices_watchlist()
        
        hist_slice = hdf.tail(bars).copy()
        
        sma20 = hist_slice['Close'].rolling(20).mean()
        
        candles = []
        volume_bars = []
        sma_points = []
        
        for idx, row in hist_slice.iterrows():
            # Unix timestamp in seconds
            unix_t = int(idx.timestamp())
            
            c_open = round(float(row['Open']), 2)
            c_high = round(float(row['High']), 2)
            c_low = round(float(row['Low']), 2)
            c_close = round(float(row['Close']), 2)
            vol = int(row['Volume']) if not np.isnan(row['Volume']) else 0
            
            candles.append({
                "time": unix_t,
                "open": c_open,
                "high": c_high,
                "low": c_low,
                "close": c_close
            })
            
            vol_color = "#08998180" if c_close >= c_open else "#f2364580"
            volume_bars.append({
                "time": unix_t,
                "value": vol,
                "color": vol_color
            })
            
            if not np.isnan(sma20.loc[idx]):
                sma_points.append({
                    "time": unix_t,
                    "value": round(float(sma20.loc[idx]), 2)
                })

        # Forecast items with unix timestamps
        forecast_candles = []
        forecast_high_line = []
        forecast_low_line = []
        forecast_close_line = []
        
        # Bridge from last historical candle
        last_candle = candles[-1]
        forecast_high_line.append({"time": last_candle["time"], "value": last_candle["high"]})
        forecast_low_line.append({"time": last_candle["time"], "value": last_candle["low"]})
        forecast_close_line.append({"time": last_candle["time"], "value": last_candle["close"]})
        
        for _, row in fdf.iterrows():
            dt_obj = pd.to_datetime(row['IsoDate'])
            u_t = int(dt_obj.timestamp())
            
            f_open = float(row['Predicted_Open'])
            f_high = float(row['Predicted_High'])
            f_low = float(row['Predicted_Low'])
            f_close = float(row['Predicted_Close'])
            
            forecast_candles.append({
                "time": u_t,
                "open": f_open,
                "high": f_high,
                "low": f_low,
                "close": f_close,
                "day": row['Day'],
                "display_date": row['Date'],
                "spread": float(row['High_Low_Spread']),
                "change_pct": float(row['Change_%']),
                "trend_bias": row['Trend_Bias']
            })
            
            forecast_high_line.append({"time": u_t, "value": f_high})
            forecast_low_line.append({"time": u_t, "value": f_low})
            forecast_close_line.append({"time": u_t, "value": f_close})
            
        last_idx = hist_slice.index[-1]
        transition_str = last_idx.strftime('%d-%b-%Y %H:%M') if interval == '5m' else last_idx.strftime('%d-%b-%Y')
        
        # Metrics
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
            "watchlist": watchlist,
            "transition_time": int(last_idx.timestamp()),
            "transition_display": transition_str,
            "candles": candles,
            "volume_bars": volume_bars,
            "sma_points": sma_points,
            "forecast_candles": forecast_candles,
            "forecast_high_line": forecast_high_line,
            "forecast_low_line": forecast_low_line,
            "forecast_close_line": forecast_close_line,
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
