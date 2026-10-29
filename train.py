import os
import sys
import json
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.data_utils import (
    fetch_nifty_data,
    add_technical_indicators,
    build_relative_sequences,
    extract_latest_relative_window,
    get_next_5m_intervals,
    get_next_trading_days,
    FEATURE_COLS
)
from src.model import NiftyLSTMForecaster

def train_model(
    interval: str = '5m',
    seq_len: int = 30,
    horizon: int = 6,
    hidden_dim: int = 64,
    num_layers: int = 2,
    epochs: int = 25,
    batch_size: int = 64,
    learning_rate: float = 0.003,
    force_download: bool = False,
    progress_callback = None
):
    print("=" * 70)
    print(f">>> TRAINING NIFTY-50 HIGH/LOW FORECASTER ON EXPANDED DATASET")
    print(f"    Interval: {interval} | Architecture: Relative-Offset PyTorch LSTM")
    print("=" * 70)
    
    # 1. Fetch Larger Data
    period_str = '60d' if interval == '5m' else None
    start_str = '2005-01-01' if interval != '5m' else None
    df_raw = fetch_nifty_data(interval=interval, period=period_str, start_date=start_str, force_refresh=force_download)
    print(f"[DATA] Loaded {len(df_raw)} candles ({df_raw.index[0]} to {df_raw.index[-1]})")
    
    # 2. Features
    df = add_technical_indicators(df_raw)
    print(f"[FEATURES] Calculated {len(FEATURE_COLS)} technical & momentum indicators")
    
    # 3. Build Stationary Relative Sequences
    X, y, bases = build_relative_sequences(df, seq_len=seq_len, horizon=horizon)
    print(f"[SEQUENCES] Generated {len(X)} sequence samples: X={X.shape}, y={y.shape}")
    
    # Chronological Split
    n = len(X)
    train_size = int(n * 0.85)
    val_size = int(n * 0.075)
    test_size = n - train_size - val_size
    
    X_train, y_train, b_train = X[:train_size], y[:train_size], bases[:train_size]
    X_val, y_val, b_val = X[train_size:train_size+val_size], y[train_size:train_size+val_size], bases[train_size:train_size+val_size]
    X_test, y_test, b_test = X[train_size+val_size:], y[train_size+val_size:], bases[train_size+val_size:]
    
    print(f"[SPLIT] Train={len(X_train)}, Validation={len(X_val)}, Test={len(X_test)}")
    
    train_loader = DataLoader(TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train)), batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(TensorDataset(torch.from_numpy(X_val), torch.from_numpy(y_val)), batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(TensorDataset(torch.from_numpy(X_test), torch.from_numpy(y_test)), batch_size=batch_size, shuffle=False)
    
    # 4. Model
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = NiftyLSTMForecaster(
        in_features=len(FEATURE_COLS),
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        horizon=horizon,
        num_targets=4,
        dropout=0.2
    ).to(device)
    
    criterion = nn.HuberLoss(delta=0.001)  # Robust Huber loss for relative movements
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=4)
    
    # Target file paths
    suffix = f"_{interval}" if interval != '1d' else ""
    model_dir = os.path.abspath(os.path.join(PROJECT_ROOT, 'models'))
    os.makedirs(model_dir, exist_ok=True)
    
    model_path = os.path.join(model_dir, f'nifty50_lstm{suffix}.pth')
    config_path = os.path.join(model_dir, f'config{suffix}.json')
    metrics_path = os.path.join(model_dir, f'metrics{suffix}.json')
    history_path = os.path.join(model_dir, f'loss_history{suffix}.json')
    forecast_path = os.path.join(model_dir, f'latest_forecast{suffix}.csv')
    
    # 5. Training Loop
    history = {'train_loss': [], 'val_loss': []}
    best_val_loss = float('inf')
    
    print("\n[TRAIN] Training Neural Network across epochs...")
    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for bx, by in train_loader:
            bx, by = bx.to(device), by.to(device)
            optimizer.zero_grad()
            out = model(bx)
            loss = criterion(out, by)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item() * len(bx)
        train_loss /= len(X_train)
        
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for bx, by in val_loader:
                bx, by = bx.to(device), by.to(device)
                out = model(bx)
                val_loss += criterion(out, by).item() * len(bx)
        val_loss /= len(X_val)
        
        scheduler.step(val_loss)
        history['train_loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), model_path)
            saved_indicator = " * [Saved Checkpoint]"
        else:
            saved_indicator = ""
            
        if epoch % 5 == 0 or epoch == 1 or epoch == epochs:
            print(f"Epoch [{epoch:2d}/{epochs:2d}] | Train Loss: {train_loss:.7f} | Val Loss: {val_loss:.7f}{saved_indicator}")
            
        if progress_callback:
            progress_callback(epoch, epochs, train_loss, val_loss)
            
    # Load best checkpoint
    model.load_state_dict(torch.load(model_path))
    model.eval()
    
    # 6. Evaluation on Unseen Test Split
    print("\n[EVAL] Evaluating on Unseen Test Split...")
    with torch.no_grad():
        test_preds = []
        for bx, _ in test_loader:
            bx = bx.to(device)
            test_preds.append(model(bx).cpu().numpy())
        test_preds = np.concatenate(test_preds, axis=0)
        
    # Invert relative predictions back to absolute rupees: Price = P0 * (1 + rel)
    # y_test shape: (N_test, horizon, 4) where col 0: High, 1: Low, 2: Close, 3: Open
    y_test_abs = np.zeros_like(y_test)
    preds_abs = np.zeros_like(test_preds)
    for i in range(len(b_test)):
        p0 = b_test[i]
        y_test_abs[i] = p0 * (1.0 + y_test[i])
        preds_abs[i] = p0 * (1.0 + test_preds[i])
        
    # Metrics for step +1
    high_rmse = np.sqrt(mean_squared_error(y_test_abs[:, 0, 0], preds_abs[:, 0, 0]))
    high_mae = mean_absolute_error(y_test_abs[:, 0, 0], preds_abs[:, 0, 0])
    high_mape = np.mean(np.abs((y_test_abs[:, 0, 0] - preds_abs[:, 0, 0]) / y_test_abs[:, 0, 0])) * 100.0
    
    low_rmse = np.sqrt(mean_squared_error(y_test_abs[:, 0, 1], preds_abs[:, 0, 1]))
    low_mae = mean_absolute_error(y_test_abs[:, 0, 1], preds_abs[:, 0, 1])
    low_mape = np.mean(np.abs((y_test_abs[:, 0, 1] - preds_abs[:, 0, 1]) / y_test_abs[:, 0, 1])) * 100.0
    
    close_rmse = np.sqrt(mean_squared_error(y_test_abs[:, 0, 2], preds_abs[:, 0, 2]))
    close_r2 = r2_score(y_test_abs[:, 0, 2], preds_abs[:, 0, 2])
    
    metrics = {
        'interval': interval,
        'high_rmse': round(float(high_rmse), 2),
        'high_mae': round(float(high_mae), 2),
        'high_mape': round(float(high_mape), 2),
        'low_rmse': round(float(low_rmse), 2),
        'low_mae': round(float(low_mae), 2),
        'low_mape': round(float(low_mape), 2),
        'close_rmse': round(float(close_rmse), 2),
        'close_r2': round(float(close_r2), 4),
        'best_val_loss': round(float(best_val_loss), 8),
        'last_trained_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_training_samples': int(len(X_train)),
        'total_test_samples': int(len(X_test)),
        'lookback_window': seq_len,
        'forecast_horizon': horizon,
        'model_save_path': model_path
    }
    
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=4)
    with open(history_path, 'w') as f:
        json.dump(history, f, indent=4)
        
    config = {
        'interval': interval,
        'seq_len': seq_len,
        'horizon': horizon,
        'hidden_dim': hidden_dim,
        'num_layers': num_layers,
        'in_features': len(FEATURE_COLS),
        'feature_cols': FEATURE_COLS
    }
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=4)
        
    print("\n" + "=" * 70)
    print(f"FINAL TEST EVALUATION METRICS ({interval} Step +1 Horizon)")
    print("=" * 70)
    print(f" * High Price RMSE : Rs. {high_rmse:.2f} | MAE: Rs. {high_mae:.2f} | MAPE: {high_mape:.2f}%")
    print(f" * Low Price RMSE  : Rs. {low_rmse:.2f} | MAE: Rs. {low_mae:.2f} | MAPE: {low_mape:.2f}%")
    print(f" * Close Price R2  : {close_r2:.4f}")
    print("=" * 70)
    print(f"[SAVE LOCATION] Model saved to: {model_path}")
    print(f"[SAVE LOCATION] Config saved to: {config_path}")
    print(f"[SAVE LOCATION] Metrics saved to: {metrics_path}")
    print("=" * 70)
    
    # 7. Generate Prediction for Upcoming Intervals
    latest_window, latest_p0 = extract_latest_relative_window(df, seq_len=seq_len)
    with torch.no_grad():
        latest_tensor = torch.from_numpy(latest_window).to(device)
        next_pred_rel = model(latest_tensor).cpu().squeeze(0).numpy()
        
    next_highs = latest_p0 * (1.0 + next_pred_rel[:, 0])
    next_lows = latest_p0 * (1.0 + next_pred_rel[:, 1])
    next_closes = latest_p0 * (1.0 + next_pred_rel[:, 2])
    next_opens = latest_p0 * (1.0 + next_pred_rel[:, 3])
    
    # Physical consistency constraint
    next_highs = np.maximum(next_highs, np.maximum(next_opens, next_closes))
    next_lows = np.minimum(next_lows, np.minimum(next_opens, next_closes))
    
    last_dt = df.index[-1]
    if interval == '5m':
        future_dts = get_next_5m_intervals(last_dt, num_intervals=horizon)
        date_strs = [d.strftime('%Y-%m-%d %H:%M') for d in future_dts]
    else:
        future_dts = get_next_trading_days(last_dt, num_days=horizon)
        date_strs = [d.strftime('%Y-%m-%d (%a)') for d in future_dts]
        
    forecast_df = pd.DataFrame({
        'Date': date_strs,
        'Predicted_High': np.round(next_highs, 2),
        'Predicted_Low': np.round(next_lows, 2),
        'Predicted_Close': np.round(next_closes, 2),
        'Predicted_Open': np.round(next_opens, 2),
        'Expected_Range': np.round(next_highs - next_lows, 2)
    })
    forecast_df.to_csv(forecast_path, index=False)
    
    print(f"\n>>> PREDICTED NEXT {horizon} CANDLES ({interval}):")
    print(forecast_df.to_string(index=False))
    print("=" * 70)
    
    return model, metrics, forecast_df

if __name__ == '__main__':
    train_model(interval='5m', epochs=25)
