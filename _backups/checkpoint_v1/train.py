import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from datetime import datetime

# Reconfigure stdout for utf-8 if supported
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from src.data_utils import (
    fetch_nifty_data,
    add_technical_indicators,
    build_sequences,
    get_next_trading_days,
    FEATURE_COLS,
    TARGET_COLS
)
from src.model import NiftyLSTMForecaster

def train_model(
    start_date: str = '2015-01-01',
    seq_len: int = 60,
    horizon: int = 6,
    hidden_dim: int = 128,
    num_layers: int = 2,
    epochs: int = 35,
    batch_size: int = 64,
    learning_rate: float = 0.002,
    force_download: bool = False,
    progress_callback = None
):
    print("=" * 65)
    print(">>> NIFTY-50 DEEP LEARNING TIME SERIES FORECASTING PIPELINE")
    print("    Course Outcome: CO4 (Recurrent Neural Networks & LSTMs)")
    print("=" * 65)
    
    # 1. Fetch Data
    df_raw = fetch_nifty_data(start_date=start_date, force_refresh=force_download)
    print(f"[DATA] Downloaded {len(df_raw)} trading sessions ({df_raw.index[0].strftime('%Y-%m-%d')} to {df_raw.index[-1].strftime('%Y-%m-%d')})")
    
    # 2. Feature Engineering
    df = add_technical_indicators(df_raw)
    print(f"[FEATURES] Extracted {len(FEATURE_COLS)} features: {', '.join(FEATURE_COLS)}")
    
    # 3. Chronological Train / Val / Test Split
    n = len(df)
    train_size = int(n * 0.80)
    val_size = int(n * 0.10)
    test_size = n - train_size - val_size
    
    train_df = df.iloc[:train_size]
    val_df = df.iloc[train_size:train_size + val_size]
    test_df = df.iloc[train_size + val_size:]
    
    print(f"[SPLIT] Dataset Split: Train={len(train_df)}, Validation={len(val_df)}, Test={len(test_df)}")
    
    # 4. Normalization (Fit ONLY on training set to prevent leakage)
    feature_scaler = MinMaxScaler(feature_range=(0, 1))
    target_scaler = MinMaxScaler(feature_range=(0, 1))
    
    feature_scaler.fit(train_df[FEATURE_COLS])
    target_scaler.fit(train_df[TARGET_COLS])
    
    # Save scalers
    os.makedirs('models', exist_ok=True)
    joblib.dump({
        'feature_scaler': feature_scaler,
        'target_scaler': target_scaler,
        'feature_cols': FEATURE_COLS,
        'target_cols': TARGET_COLS,
        'seq_len': seq_len,
        'horizon': horizon
    }, 'models/scalers.pkl')
    
    # Transform full dataset
    scaled_features = feature_scaler.transform(df[FEATURE_COLS])
    scaled_targets = target_scaler.transform(df[TARGET_COLS])
    
    # 5. Build Sequences
    # Sliced to match train, val, test boundaries cleanly
    X_all, y_all = build_sequences(scaled_features, scaled_targets, seq_len=seq_len, horizon=horizon)
    all_dates = df.index[seq_len : seq_len + len(X_all)]
    
    train_end_idx = train_size - seq_len
    val_end_idx = train_size + val_size - seq_len
    
    X_train, y_train = X_all[:train_end_idx], y_all[:train_end_idx]
    X_val, y_val = X_all[train_end_idx:val_end_idx], y_all[train_end_idx:val_end_idx]
    X_test, y_test = X_all[val_end_idx:], y_all[val_end_idx:]
    test_dates = all_dates[val_end_idx:]
    
    print(f"[SEQUENCES] X_train shape={X_train.shape}, y_train shape={y_train.shape}")
    print(f"            Lookback Window: {seq_len} days, Forecast Horizon: {horizon} days ahead")
    
    train_dataset = TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train))
    val_dataset = TensorDataset(torch.from_numpy(X_val), torch.from_numpy(y_val))
    test_dataset = TensorDataset(torch.from_numpy(X_test), torch.from_numpy(y_test))
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False)
    
    # 6. Model Initialization
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = NiftyLSTMForecaster(
        in_features=len(FEATURE_COLS),
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        horizon=horizon,
        num_targets=len(TARGET_COLS),
        dropout=0.2
    ).to(device)
    
    criterion = nn.SmoothL1Loss()  # Huber loss: robust against market spikes
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=4)
    
    # 7. Training Loop
    history = {'train_loss': [], 'val_loss': []}
    best_val_loss = float('inf')
    best_model_path = 'models/nifty50_lstm.pth'
    
    print("\n[TRAIN] Training LSTM Model across epochs...")
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
                loss = criterion(out, by)
                val_loss += loss.item() * len(bx)
        val_loss /= len(X_val)
        
        scheduler.step(val_loss)
        history['train_loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), best_model_path)
            saved_indicator = " * [Checkpoint Saved]"
        else:
            saved_indicator = ""
            
        if epoch % 5 == 0 or epoch == 1 or epoch == epochs:
            print(f"Epoch [{epoch:2d}/{epochs:2d}] | Train Loss: {train_loss:.6f} | Val Loss: {val_loss:.6f}{saved_indicator}")
            
        if progress_callback:
            progress_callback(epoch, epochs, train_loss, val_loss)
            
    # Load best checkpoint
    model.load_state_dict(torch.load(best_model_path))
    model.eval()
    
    # 8. Evaluation on Unseen Test Split
    print("\n[EVAL] Evaluating on Unseen Test Set...")
    with torch.no_grad():
        test_preds = []
        for bx, _ in test_loader:
            bx = bx.to(device)
            out = model(bx)
            test_preds.append(out.cpu().numpy())
        test_preds = np.concatenate(test_preds, axis=0)  # (N_test, horizon, 4)
        
    # Invert scaling
    N_test = len(y_test)
    y_test_reshaped = y_test.reshape(-1, len(TARGET_COLS))
    test_preds_reshaped = test_preds.reshape(-1, len(TARGET_COLS))
    
    y_test_inv = target_scaler.inverse_transform(y_test_reshaped).reshape(N_test, horizon, len(TARGET_COLS))
    preds_inv = target_scaler.inverse_transform(test_preds_reshaped).reshape(N_test, horizon, len(TARGET_COLS))
    
    # Target column indices: 0: High, 1: Low, 2: Close, 3: Open
    high_rmse = np.sqrt(mean_squared_error(y_test_inv[:, 0, 0], preds_inv[:, 0, 0]))
    high_mae = mean_absolute_error(y_test_inv[:, 0, 0], preds_inv[:, 0, 0])
    high_mape = np.mean(np.abs((y_test_inv[:, 0, 0] - preds_inv[:, 0, 0]) / y_test_inv[:, 0, 0])) * 100.0
    
    low_rmse = np.sqrt(mean_squared_error(y_test_inv[:, 0, 1], preds_inv[:, 0, 1]))
    low_mae = mean_absolute_error(y_test_inv[:, 0, 1], preds_inv[:, 0, 1])
    low_mape = np.mean(np.abs((y_test_inv[:, 0, 1] - preds_inv[:, 0, 1]) / y_test_inv[:, 0, 1])) * 100.0
    
    close_rmse = np.sqrt(mean_squared_error(y_test_inv[:, 0, 2], preds_inv[:, 0, 2]))
    close_r2 = r2_score(y_test_inv[:, 0, 2], preds_inv[:, 0, 2])
    
    metrics = {
        'high_rmse': round(float(high_rmse), 2),
        'high_mae': round(float(high_mae), 2),
        'high_mape': round(float(high_mape), 2),
        'low_rmse': round(float(low_rmse), 2),
        'low_mae': round(float(low_mae), 2),
        'low_mape': round(float(low_mape), 2),
        'close_rmse': round(float(close_rmse), 2),
        'close_r2': round(float(close_r2), 4),
        'best_val_loss': round(float(best_val_loss), 6),
        'last_trained_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_training_samples': int(len(X_train)),
        'total_test_samples': int(len(X_test)),
        'lookback_window': seq_len,
        'forecast_horizon': horizon
    }
    
    with open('models/metrics.json', 'w') as f:
        json.dump(metrics, f, indent=4)
        
    with open('models/loss_history.json', 'w') as f:
        json.dump(history, f, indent=4)
        
    # Save test set actual vs predicted for horizon step 1 (Next Day)
    df_eval = pd.DataFrame({
        'Date': test_dates,
        'Actual_High': y_test_inv[:, 0, 0],
        'Pred_High': preds_inv[:, 0, 0],
        'Actual_Low': y_test_inv[:, 0, 1],
        'Pred_Low': preds_inv[:, 0, 1],
        'Actual_Close': y_test_inv[:, 0, 2],
        'Pred_Close': preds_inv[:, 0, 2]
    })
    df_eval.to_csv('models/test_eval_predictions.csv', index=False)
    
    print("\n" + "=" * 65)
    print("FINAL TEST EVALUATION METRICS (Day +1 Horizon)")
    print("=" * 65)
    print(f" * High Price RMSE : Rs. {high_rmse:.2f} | MAE: Rs. {high_mae:.2f} | MAPE: {high_mape:.2f}%")
    print(f" * Low Price RMSE  : Rs. {low_rmse:.2f} | MAE: Rs. {low_mae:.2f} | MAPE: {low_mape:.2f}%")
    print(f" * Close Price R2  : {close_r2:.4f} (Accuracy fit)")
    print("=" * 65)
    
    # 9. Next 6 Trading Days Forecast
    with torch.no_grad():
        latest_window = scaled_features[-seq_len:][np.newaxis, ...]
        latest_tensor = torch.from_numpy(latest_window.astype(np.float32)).to(device)
        next_pred_norm = model(latest_tensor).cpu().squeeze(0).numpy()
        next_pred = target_scaler.inverse_transform(next_pred_norm)
        
    last_date = df.index[-1]
    future_dates = get_next_trading_days(last_date, num_days=horizon)
    
    forecast_df = pd.DataFrame({
        'Date': [d.strftime('%Y-%m-%d (%a)') for d in future_dates],
        'Predicted_High': np.round(next_pred[:, 0], 2),
        'Predicted_Low': np.round(next_pred[:, 1], 2),
        'Predicted_Close': np.round(next_pred[:, 2], 2),
        'Predicted_Open': np.round(next_pred[:, 3], 2),
        'Expected_Range': np.round(next_pred[:, 0] - next_pred[:, 1], 2)
    })
    forecast_df.to_csv('models/latest_forecast.csv', index=False)
    
    print("\n>>> FORECAST: NEXT 6 TRADING SESSIONS FOR NIFTY-50:")
    print(forecast_df.to_string(index=False))
    print("=" * 65)
    
    return model, metrics, forecast_df

if __name__ == '__main__':
    train_model(epochs=35)
