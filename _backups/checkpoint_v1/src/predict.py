import os
import sys

# Ensure workspace root is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import joblib
import numpy as np
import pandas as pd
import torch
from datetime import datetime
from typing import Dict, Any, Tuple

from src.model import NiftyLSTMForecaster
from src.data_utils import (
    fetch_nifty_data,
    add_technical_indicators,
    get_next_trading_days,
    FEATURE_COLS,
    TARGET_COLS
)

def load_predictor(
    model_path: str = 'models/nifty50_lstm.pth',
    scalers_path: str = 'models/scalers.pkl'
) -> Tuple[NiftyLSTMForecaster, Dict[str, Any]]:
    """
    Loads the trained PyTorch LSTM weights and scalers dictionary.
    """
    if not os.path.exists(model_path) or not os.path.exists(scalers_path):
        raise FileNotFoundError("Trained model or scalers file not found. Run train.py first.")
        
    scalers_dict = joblib.load(scalers_path)
    seq_len = scalers_dict.get('seq_len', 60)
    horizon = scalers_dict.get('horizon', 6)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = NiftyLSTMForecaster(
        in_features=len(FEATURE_COLS),
        hidden_dim=128,
        num_layers=2,
        horizon=horizon,
        num_targets=len(TARGET_COLS),
        dropout=0.2
    ).to(device)
    
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()
    
    return model, scalers_dict

def generate_forecast(
    model: NiftyLSTMForecaster = None,
    scalers_dict: Dict[str, Any] = None,
    horizon_days: int = 6,
    force_refresh_data: bool = False
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Generates multi-step predictions for the upcoming trading sessions.
    Returns:
        - forecast_df: DataFrame of next 5-6 trading days with High, Low, Close, Open, Spread, Direction
        - history_df: Historical data with technical indicators
        - market_summary: Summary of current market stats (Last Close, 52-wk high/low, etc.)
    """
    if model is None or scalers_dict is None:
        model, scalers_dict = load_predictor()
        
    device = next(model.parameters()).device
    feature_scaler = scalers_dict['feature_scaler']
    target_scaler = scalers_dict['target_scaler']
    seq_len = scalers_dict['seq_len']
    
    # Fetch data up to today
    df_raw = fetch_nifty_data(force_refresh=force_refresh_data)
    df = add_technical_indicators(df_raw)
    
    # Extract latest lookback window
    scaled_features = feature_scaler.transform(df[FEATURE_COLS])
    input_window = scaled_features[-seq_len:][np.newaxis, ...]
    input_tensor = torch.from_numpy(input_window.astype(np.float32)).to(device)
    
    with torch.no_grad():
        preds_scaled = model(input_tensor).cpu().squeeze(0).numpy()
        preds = target_scaler.inverse_transform(preds_scaled)
        
    # Slice to desired horizon (e.g. 5 or 6 days)
    horizon_days = min(max(1, horizon_days), len(preds))
    preds = preds[:horizon_days]
    
    last_date = df.index[-1]
    last_close = float(df['Close'].iloc[-1])
    last_high = float(df['High'].iloc[-1])
    last_low = float(df['Low'].iloc[-1])
    
    future_dates = get_next_trading_days(last_date, num_days=horizon_days)
    
    rows = []
    prev_close = last_close
    for i in range(horizon_days):
        h, l, c, o = preds[i]
        
        # Enforce physical reality constraint: High >= max(Open, Close) and Low <= min(Open, Close)
        h_adjusted = max(h, o, c)
        l_adjusted = min(l, o, c)
        
        change_pct = ((c - prev_close) / prev_close) * 100.0
        if change_pct > 0.25:
            bias = "Bullish (+)"
        elif change_pct < -0.25:
            bias = "Bearish (-)"
        else:
            bias = "Neutral (~)"
            
        rows.append({
            'Day': f"Day +{i+1}",
            'Date': future_dates[i].strftime('%d-%b-%Y (%a)'),
            'Predicted_High': round(float(h_adjusted), 2),
            'Predicted_Low': round(float(l_adjusted), 2),
            'Predicted_Close': round(float(c), 2),
            'Predicted_Open': round(float(o), 2),
            'High_Low_Spread': round(float(h_adjusted - l_adjusted), 2),
            'Change_%': round(float(change_pct), 2),
            'Trend_Bias': bias
        })
        prev_close = c
        
    forecast_df = pd.DataFrame(rows)
    
    # 52-week statistics
    one_year_ago = df.index[-1] - pd.DateOffset(days=365)
    past_year_df = df[df.index >= one_year_ago]
    high_52w = float(past_year_df['High'].max())
    low_52w = float(past_year_df['Low'].min())
    prev_day_close = float(df['Close'].iloc[-2]) if len(df) > 1 else last_close
    day_change = last_close - prev_day_close
    day_change_pct = (day_change / prev_day_close) * 100.0
    
    market_summary = {
        'last_date': last_date.strftime('%d %B %Y'),
        'last_close': round(last_close, 2),
        'last_high': round(last_high, 2),
        'last_low': round(last_low, 2),
        'day_change': round(day_change, 2),
        'day_change_pct': round(day_change_pct, 2),
        'high_52w': round(high_52w, 2),
        'low_52w': round(low_52w, 2),
        'current_rsi': round(float(df['RSI_14'].iloc[-1]), 2),
        'sma_20': round(float(df['EMA_20'].iloc[-1]), 2)
    }
    
    return forecast_df, df, market_summary

if __name__ == '__main__':
    fdf, _, summary = generate_forecast()
    print("Market Summary:", summary)
    print("\nForecast:\n", fdf)
