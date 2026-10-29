import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from typing import Tuple, List, Optional
import os

FEATURE_COLS = [
    'Close', 'High', 'Low', 'Open', 'Volume',
    'SMA_10', 'SMA_30', 'EMA_20', 'RSI_14',
    'Daily_Return', 'Daily_Range'
]

TARGET_COLS = ['High', 'Low', 'Close', 'Open']

def fetch_nifty_data(start_date: str = '2015-01-01', end_date: Optional[str] = None, 
                     cache_path: str = 'data/nifty50_historical.csv', 
                     force_refresh: bool = False) -> pd.DataFrame:
    """
    Fetches historical NIFTY-50 data from Yahoo Finance (^NSEI).
    Caches locally so training and UI can run quickly and offline.
    """
    if not force_refresh and os.path.exists(cache_path):
        try:
            df = pd.read_csv(cache_path, index_col=0, parse_dates=True)
            # Check if cache is relatively fresh (has data up to recent dates)
            if len(df) > 1000:
                return df
        except Exception:
            pass

    print(f"Downloading NIFTY-50 (^NSEI) data from {start_date}...")
    df = yf.download('^NSEI', start=start_date, end=end_date, progress=False)
    
    # Handle multi-level columns from yfinance
    if hasattr(df.columns, 'levels'):
        df.columns = df.columns.get_level_values(0)
        
    df = df.dropna()
    df.index.name = 'Date'
    
    # Ensure cache folder exists and save
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    df.to_csv(cache_path)
    return df

def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes key financial and technical indicators for sequential pattern learning:
    - Moving Averages (SMA 10, SMA 30, EMA 20)
    - Momentum (RSI 14)
    - Volatility & Range (Daily Return, Daily Range)
    """
    data = df.copy()
    
    # Moving averages
    data['SMA_10'] = data['Close'].rolling(window=10).mean()
    data['SMA_30'] = data['Close'].rolling(window=30).mean()
    data['EMA_20'] = data['Close'].ewm(span=20, adjust=False).mean()
    
    # Relative Strength Index (RSI 14)
    delta = data['Close'].diff()
    gain = (delta.where(delta > 0, 0.0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-9)
    data['RSI_14'] = 100.0 - (100.0 / (1.0 + rs))
    
    # Return and Intraday Range
    data['Daily_Return'] = data['Close'].pct_change()
    data['Daily_Range'] = (data['High'] - data['Low']) / (data['Close'] + 1e-9)
    
    # Drop rows created with NaN due to rolling windows
    data = data.dropna()
    return data

def build_sequences(features: np.ndarray, targets: np.ndarray, 
                    seq_len: int = 60, horizon: int = 6) -> Tuple[np.ndarray, np.ndarray]:
    """
    Sliding window generation for multi-step sequence-to-multi-horizon learning.
    For each index i, takes window [i-seq_len : i] as input X,
    and [i : i+horizon] as future target y.
    """
    X, y = [], []
    total_len = len(features)
    for i in range(seq_len, total_len - horizon + 1):
        X.append(features[i - seq_len : i])
        y.append(targets[i : i + horizon])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)

def get_next_trading_days(last_date: pd.Timestamp, num_days: int = 6) -> List[datetime]:
    """
    Generates the upcoming trading dates, skipping Saturdays and Sundays.
    """
    future_dates = []
    current = last_date.to_pydatetime() if isinstance(last_date, pd.Timestamp) else last_date
    while len(future_dates) < num_days:
        current += timedelta(days=1)
        # Skip Saturday (5) and Sunday (6)
        if current.weekday() < 5:
            future_dates.append(current)
    return future_dates
