# NIFTY-50 AI Time Series Forecaster (Unified Chart Web App)

**Lab Experiment 13:** *Time Series Forecasting for the NIFTY-50 Dataset*  
**Course Outcome:** **CO4** — *Apply recurrent neural networks (RNNs, LSTMs, GRUs) and sequential architectures to time-series datasets.*

---

## 📌 Project Overview
This project provides a full-stack financial time-series forecasting platform that renders the **current NIFTY-50 index chart and the AI-predicted 5–6 days ahead in the EXACT SAME GRAPH**.

The system is powered by a **Stacked PyTorch LSTM (Long Short-Term Memory)** neural network, exposed via a high-performance **FastAPI REST API**, and rendered through a modern **HTML5/Tailwind/Plotly.js dark-mode trading interface**.

---

## 🌟 Key Architecture & Features

### 1. Unified Charting Engine (Current & Predicted on Same Axis)
* **Historical Portion (Current Actuals):** Candlesticks representing real trading sessions up to today (`Open`, `High`, `Low`, `Close`, `Volume`).
* **Demarcation Line:** Vertical boundary line marking `⚡ TODAY (Actual) | FORECAST ➔`.
* **Future Forecast Portion (Next 5–6 Days):**
  * **Forecast Candlesticks:** Continuous predicted candles on future calendar dates (skipping weekends).
  * **Upper High Channel:** Dashed green line (`#4ade80`) tracing the projected daily Highs.
  * **Lower Low Channel:** Dashed cyan line (`#38bdf8`) tracing the projected daily Lows.
  * **Shaded Prediction Envelope:** Soft translucent channel (`rgba(56, 189, 248, 0.15)`) visualizing expected market volatility.
  * **Predicted Close Path:** Amber trajectory line connecting forecasted close levels.
* **Interactive Overlays:** 20-Day Simple Moving Average (SMA), 50-Day SMA, and Bollinger Bands.

---

### 2. Backend REST API (`FastAPI`)
| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `GET /api/chart-data` | `GET` | Returns historical candles + future forecast points + transition date in a single payload. |
| `GET /api/predict` | `GET` | Returns the next 5–6 trading days' High, Low, Close, Open, Spread, and Trend Bias. |
| `GET /api/market` | `GET` | Real-time market metrics (NIFTY Index, Day H/L, 52W H/L, 14-Day RSI). |
| `POST /api/retrain` | `POST` | Asynchronously retrains the PyTorch LSTM on historical data. |
| `GET /api/status` | `GET` | Health check & model metadata. |

---

### 3. Deep Learning Model (CO4)
* **Model:** Stacked 2-Layer PyTorch LSTM with Layer Normalization and Multi-Horizon Dense Decoder.
* **Lookback Memory:** 60 past trading days.
* **Forecast Horizon:** Next 5–6 business days (direct multi-step projection).
* **Test Performance (Unseen Test Set):**
  * **High Price MAPE:** **2.04%**
  * **Low Price MAPE:** **2.31%**
  * **Validation Loss:** `0.000461` (Huber Loss)

---

## 📁 Repository Structure
```
Nifty-50_predictor/
│
├── server.py                                # FastAPI backend server
├── train.py                                 # PyTorch model training & evaluation pipeline
├── run_web_app.bat                          # One-click Windows runner (opens browser at :8000)
├── run_app.bat                              # Streamlit runner (alternative UI at :8501)
├── app.py                                   # Streamlit dashboard
├── Experiment_13_NIFTY50_Forecasting.ipynb  # Academic Jupyter Notebook for Exp 13 submission
├── README.md                                # Full documentation
│
├── frontend/                                # Unified Web UI
│   ├── index.html                           # Modern dark-mode trading interface
│   ├── app.js                               # Frontend API client & Plotly.js chart engine
│   └── style.css                            # Glassmorphism & custom styling
│
├── src/
│   ├── model.py                             # PyTorch LSTM architecture
│   ├── data_utils.py                        # Technical indicators, windowing, business days
│   └── predict.py                           # Inference & multi-step forecast generation
│
└── models/
    ├── nifty50_lstm.pth                     # Trained PyTorch weights
    ├── scalers.pkl                          # Fitted MinMaxScalers
    ├── metrics.json                         # Test set accuracy metrics (RMSE, MAPE, R²)
    └── latest_forecast.csv                  # Latest 6-day prediction export
```

---

## 🚀 How to Run

### **Option 1: Unified Web App (Recommended)**
Double-click `run_web_app.bat` or run:
```bash
python server.py
```
Then open your browser at:
👉 **`http://localhost:8000/`**

---

### **Option 2: Streamlit Dashboard**
```bash
streamlit run app.py
```
Available at: `http://localhost:8501/`
