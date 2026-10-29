import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from typing import Tuple, List, Optional
import os

FEATURE_COLS = [
    'Close_rel', 'High_rel', 'Low_rel', 'Open_rel',
    'SMA_10_rel', 'SMA_30_rel', 'EMA_20_rel',
    'RSI_norm', 'Return', 'Range', 'Vol_norm'
]

TARGET_COLS = ['High_rel', 'Low_rel', 'Close_rel', 'Open_rel']

def fetch_nifty_data(
    interval: str = '5m',
    start_date: str = '2005-01-01',
    period: str = '60d',
    cache_path: Optional[str] = None,
    force_refresh: bool = False
) -> pd.DataFrame:
    """
    Fetches historical NIFTY-50 data from Yahoo Finance (^NSEI).
    - For '5m': Fetches the maximum available 60-day intraday dataset (~4,500 candles).
    - For '1d': Fetches over 20 years of historical daily records (from 2005 to 2026, ~5,000+ days).
    """
    if cache_path is None:
        cache_path = f'data/nifty50_{interval}_large.csv'

    if not force_refresh and os.path.exists(cache_path):
        try:
            df = pd.read_csv(cache_path, index_col=0, parse_dates=True)
            if len(df) > 1000:
                return df
        except Exception:
            pass

    print(f"Downloading NIFTY-50 (^NSEI) large dataset (interval='{interval}', period='{period}')...")
    if interval == '5m':
        df = yf.download('^NSEI', interval='5m', period='60d', progress=False)
    else:
        df = yf.download('^NSEI', start=start_date, progress=False)

    if hasattr(df.columns, 'levels'):
        df.columns = df.columns.get_level_values(0)

    df = df.dropna()
    df.index.name = 'Datetime' if interval == '5m' else 'Date'

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    df.to_csv(cache_path)
    return df

def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes key financial and technical indicators for sequential pattern learning.
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
    data['Return'] = data['Close'].pct_change()
    data['Range'] = (data['High'] - data['Low']) / (data['Close'] + 1e-9)
    
    # Volume relative to 20-period moving average
    vol_ma = data['Volume'].rolling(20).mean() + 1.0
    data['Vol_norm'] = (data['Volume'] - vol_ma) / vol_ma

    data = data.dropna()
    return data

def build_relative_sequences(df: pd.DataFrame, seq_len: int = 30, horizon: int = 6) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Builds stationary, base-price-relative sequences.
    For each window, all prices are normalized relative to the sequence's last Close (P0):
    P_rel = P / P0 - 1.0.
    
    This solves the flatline prediction problem and allows the model to predict realistic
    High-Low volatility channels and true momentum without non-stationary distortion.
    
    Returns:
        X: (N_samples, seq_len, 11)
        y: (N_samples, horizon, 4) -> [High_rel, Low_rel, Close_rel, Open_rel]
        base_prices: (N_samples,)
    """
    closes = df['Close'].values
    highs = df['High'].values
    lows = df['Low'].values
    opens = df['Open'].values
    sma10s = df['SMA_10'].values
    sma30s = df['SMA_30'].values
    ema20s = df['EMA_20'].values
    rsis = df['RSI_14'].values
    returns = df['Return'].values
    ranges = df['Range'].values
    vols = df['Vol_norm'].values

    X, y, bases = [], [], []
    total_len = len(df)

    for i in range(seq_len, total_len - horizon + 1):
        p0 = closes[i - 1]
        
        # Relative features in window
        w_close = closes[i - seq_len : i] / p0 - 1.0
        w_high = highs[i - seq_len : i] / p0 - 1.0
        w_low = lows[i - seq_len : i] / p0 - 1.0
        w_open = opens[i - seq_len : i] / p0 - 1.0
        w_sma10 = sma10s[i - seq_len : i] / p0 - 1.0
        w_sma30 = sma30s[i - seq_len : i] / p0 - 1.0
        w_ema20 = ema20s[i - seq_len : i] / p0 - 1.0
        w_rsi = (rsis[i - seq_len : i] - 50.0) / 50.0
        w_ret = returns[i - seq_len : i]
        w_rng = ranges[i - seq_len : i]
        w_vol = np.clip(vols[i - seq_len : i], -2.0, 5.0)

        feats = np.column_stack([
            w_close, w_high, w_low, w_open,
            w_sma10, w_sma30, w_ema20,
            w_rsi, w_ret, w_rng, w_vol
        ])

        # Target relative future horizon
        t_high = highs[i : i + horizon] / p0 - 1.0
        t_low = lows[i : i + horizon] / p0 - 1.0
        t_close = closes[i : i + horizon] / p0 - 1.0
        t_open = opens[i : i + horizon] / p0 - 1.0

        targs = np.column_stack([t_high, t_low, t_close, t_open])

        X.append(feats)
        y.append(targs)
        bases.append(p0)

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32), np.array(bases, dtype=np.float32)

def extract_latest_relative_window(df: pd.DataFrame, seq_len: int = 30) -> Tuple[np.ndarray, float]:
    """
    Extracts the latest lookback window normalized relative to the current Close.
    """
    closes = df['Close'].values
    highs = df['High'].values
    lows = df['Low'].values
    opens = df['Open'].values
    sma10s = df['SMA_10'].values
    sma30s = df['SMA_30'].values
    ema20s = df['EMA_20'].values
    rsis = df['RSI_14'].values
    returns = df['Return'].values
    ranges = df['Range'].values
    vols = df['Vol_norm'].values

    p0 = closes[-1]

    w_close = closes[-seq_len:] / p0 - 1.0
    w_high = highs[-seq_len:] / p0 - 1.0
    w_low = lows[-seq_len:] / p0 - 1.0
    w_open = opens[-seq_len:] / p0 - 1.0
    w_sma10 = sma10s[-seq_len:] / p0 - 1.0
    w_sma30 = sma30s[-seq_len:] / p0 - 1.0
    w_ema20 = ema20s[-seq_len:] / p0 - 1.0
    w_rsi = (rsis[-seq_len:] - 50.0) / 50.0
    w_ret = returns[-seq_len:]
    w_rng = ranges[-seq_len:]
    w_vol = np.clip(vols[-seq_len:], -2.0, 5.0)

    feats = np.column_stack([
        w_close, w_high, w_low, w_open,
        w_sma10, w_sma30, w_ema20,
        w_rsi, w_ret, w_rng, w_vol
    ])

    return feats[np.newaxis, ...].astype(np.float32), float(p0)

def get_next_5m_intervals(last_timestamp: pd.Timestamp, num_intervals: int = 6) -> List[pd.Timestamp]:
    """
    Computes upcoming 5-minute candle timestamps for NSE:
    - Trading hours: 09:15 AM to 03:30 PM IST (Mon-Fri)
    - If past 15:30, rolls over to next trading day 09:15 AM (skipping Sat & Sun)
    """
    intervals = []
    curr = pd.to_datetime(last_timestamp)
    
    while len(intervals) < num_intervals:
        curr = curr + timedelta(minutes=5)
        if curr.hour > 15 or (curr.hour == 15 and curr.minute > 30):
            curr = curr + timedelta(days=1)
            while curr.weekday() >= 5:
                curr = curr + timedelta(days=1)
            curr = curr.replace(hour=9, minute=15, second=0, microsecond=0)
        elif curr.hour < 9 or (curr.hour == 9 and curr.minute < 15):
            curr = curr.replace(hour=9, minute=15, second=0, microsecond=0)
            
        intervals.append(curr)
    return intervals

def get_next_trading_days(last_date: pd.Timestamp, num_days: int = 6) -> List[datetime]:
    future_dates = []
    current = last_date.to_pydatetime() if isinstance(last_date, pd.Timestamp) else last_date
    while len(future_dates) < num_days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            future_dates.append(current)
    return future_dates
