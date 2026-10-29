import os
import sys
import json
import numpy as np
import pandas as pd
import torch
from datetime import datetime
from typing import Dict, Any, Tuple

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.model import NiftyLSTMForecaster
from src.data_utils import (
    fetch_nifty_data,
    add_technical_indicators,
    extract_latest_relative_window,
    get_next_5m_intervals,
    get_next_trading_days,
    FEATURE_COLS
)

def load_predictor(
    interval: str = '5m'
) -> Tuple[NiftyLSTMForecaster, Dict[str, Any]]:
    suffix = f"_{interval}" if interval != '1d' else ""
    model_dir = os.path.abspath(os.path.join(PROJECT_ROOT, 'models'))
    model_path = os.path.join(model_dir, f'nifty50_lstm{suffix}.pth')
    config_path = os.path.join(model_dir, f'config{suffix}.json')
    
    if not os.path.exists(model_path):
        model_path = os.path.join(model_dir, 'nifty50_lstm.pth')
        config_path = os.path.join(model_dir, 'config.json')
        
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Trained model not found at: {model_path}. Run train.py first.")
        
    config = {}
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = json.load(f)
            
    seq_len = config.get('seq_len', 30 if interval == '5m' else 60)
    horizon = config.get('horizon', 6)
    hidden_dim = config.get('hidden_dim', 64 if interval == '5m' else 128)
    num_layers = config.get('num_layers', 2)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = NiftyLSTMForecaster(
        in_features=len(FEATURE_COLS),
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        horizon=horizon,
        num_targets=4,
        dropout=0.2
    ).to(device)
    
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()
    
    config['model_path'] = model_path
    return model, config

def generate_forecast(
    interval: str = '5m',
    model: NiftyLSTMForecaster = None,
    config: Dict[str, Any] = None,
    horizon_days: int = 6,
    force_refresh_data: bool = False
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Generates multi-step predictions for upcoming intervals (5m candles or 1d days).
    """
    if model is None or config is None:
        model, config = load_predictor(interval=interval)
        
    device = next(model.parameters()).device
    seq_len = config.get('seq_len', 30 if interval == '5m' else 60)
    
    period_str = '60d' if interval == '5m' else None
    start_str = '2005-01-01' if interval != '5m' else None
    df_raw = fetch_nifty_data(interval=interval, period=period_str, start_date=start_str, force_refresh=force_refresh_data)
    df = add_technical_indicators(df_raw)
    
    latest_window, latest_p0 = extract_latest_relative_window(df, seq_len=seq_len)
    latest_tensor = torch.from_numpy(latest_window).to(device)
    
    with torch.no_grad():
        preds_rel = model(latest_tensor).cpu().squeeze(0).numpy()
        
    horizon_days = min(max(1, horizon_days), len(preds_rel))
    preds_rel = preds_rel[:horizon_days]
    
    last_dt = df.index[-1]
    last_close = float(df['Close'].iloc[-1])
    last_high = float(df['High'].iloc[-1])
    last_low = float(df['Low'].iloc[-1])
    
    if interval == '5m':
        future_dts = get_next_5m_intervals(last_dt, num_intervals=horizon_days)
    else:
        future_dts = get_next_trading_days(last_dt, num_days=horizon_days)
        
    rows = []
    prev_close = last_close
    for i in range(horizon_days):
        rel_h, rel_l, rel_c, rel_o = preds_rel[i]
        
        # Convert relative offset to exact rupee price
        abs_h = latest_p0 * (1.0 + rel_h)
        abs_l = latest_p0 * (1.0 + rel_l)
        abs_c = latest_p0 * (1.0 + rel_c)
        abs_o = latest_p0 * (1.0 + rel_o)
        
        # Consistency guarantee: High >= max(Open, Close) and Low <= min(Open, Close)
        abs_h = max(abs_h, abs_o, abs_c)
        abs_l = min(abs_l, abs_o, abs_c)
        
        change_pct = ((abs_c - prev_close) / prev_close) * 100.0
        if change_pct > 0.03:
            bias = "Bullish (+)"
        elif change_pct < -0.03:
            bias = "Bearish (-)"
        else:
            bias = "Neutral (~)"
            
        dt_obj = future_dts[i]
        if interval == '5m':
            display_date = dt_obj.strftime('%d-%b %H:%M')
            iso_date = dt_obj.strftime('%Y-%m-%d %H:%M:%S')
            day_label = f"Candle +{i+1}"
        else:
            display_date = dt_obj.strftime('%d-%b-%Y (%a)')
            iso_date = dt_obj.strftime('%Y-%m-%d')
            day_label = f"Day +{i+1}"
            
        rows.append({
            'Day': day_label,
            'Date': display_date,
            'IsoDate': iso_date,
            'Predicted_High': round(float(abs_h), 2),
            'Predicted_Low': round(float(abs_l), 2),
            'Predicted_Close': round(float(abs_c), 2),
            'Predicted_Open': round(float(abs_o), 2),
            'High_Low_Spread': round(float(abs_h - abs_l), 2),
            'Change_%': round(float(change_pct), 2),
            'Trend_Bias': bias
        })
        prev_close = abs_c
        
    forecast_df = pd.DataFrame(rows)
    
    # 52-week & day stats
    one_year_ago = df.index[-1] - pd.DateOffset(days=365)
    past_year_df = df[df.index >= one_year_ago]
    high_52w = float(past_year_df['High'].max()) if len(past_year_df) > 0 else float(df['High'].max())
    low_52w = float(past_year_df['Low'].min()) if len(past_year_df) > 0 else float(df['Low'].min())
    prev_close_val = float(df['Close'].iloc[-2]) if len(df) > 1 else last_close
    day_change = last_close - prev_close_val
    day_change_pct = (day_change / prev_close_val) * 100.0
    
    last_dt_formatted = last_dt.strftime('%d-%b-%Y %H:%M:%S IST') if hasattr(last_dt, 'strftime') else str(last_dt)
    
    market_summary = {
        'interval': interval,
        'last_date_time': last_dt_formatted,
        'last_close': round(last_close, 2),
        'last_high': round(last_high, 2),
        'last_low': round(last_low, 2),
        'day_change': round(day_change, 2),
        'day_change_pct': round(day_change_pct, 2),
        'high_52w': round(high_52w, 2),
        'low_52w': round(low_52w, 2),
        'current_rsi': round(float(df['RSI_14'].iloc[-1]), 2),
        'sma_20': round(float(df['EMA_20'].iloc[-1]), 2),
        'model_path': config.get('model_path', '')
    }
    
    return forecast_df, df, market_summary

if __name__ == '__main__':
    fdf, _, summary = generate_forecast(interval='5m')
    print("Market Summary:", summary)
    print("\nForecast:\n", fdf)
