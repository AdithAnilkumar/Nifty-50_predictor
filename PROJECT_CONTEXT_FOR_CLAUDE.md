# NIFTY-50 AI Forecaster — Comprehensive Project Context & Architecture Specification

> **Notice for Claude / LLMs:**  
> This file is the single source of truth for the **NIFTY-50 Deep Learning Time Series Forecasting Platform**. It explains every architectural decision, mathematical formulation, backend/frontend technology, file breakdown, and live streaming mechanism in complete detail.

---

## 1. Executive Summary

- **Project Title:** NIFTY-50 Real-Time Deep Learning Time Series Forecaster (Experiment 13 - CO4)
- **Primary Objective:** Deliver an end-to-end, production-grade financial forecasting platform for India's benchmark index (**NIFTY 50 - `^NSEI`**). Rather than predicting a single arbitrary close price, the system projects the **volatility envelope—the next 5 to 6 future intervals' High, Low, and Close trajectories**—both for:
  1. **5-Minute Intraday Trading** (for active session boundary detection).
  2. **Daily Sessions** (for swing and macro multi-day forecasting).
- **Core Breakthrough:** Solved the notorious "flatlining/mean-reversion" failure of standard neural networks on stock prices by designing a **Relative-Offset Window Representation** ($P_{rel} = \frac{P - P_0}{P_0}$).
- **Frontend Experience:** Implemented as a **3D WebGL Web Application** featuring an interactive **Three.js** neural matrix, **3D gyroscopic tilt prediction cards**, a sleek **Matte Obsidian & Electric Lime** aesthetic, and a **dark-mode Lightweight Charts** engine (zero watermarks/logos).
- **Backend Architecture:** Asynchronous **FastAPI** engine with zero-delay live exchange synchronization via `yfinance`, coupled with a 2-second high-frequency micro-tick generator.
- **GitHub Repository:** [https://github.com/AdithAnilkumar/Nifty-50_predictor](https://github.com/AdithAnilkumar/Nifty-50_predictor)

---

## 2. Technology Stack & Component Architecture

### A. Backend & Deep Learning Stack
| Component | Technology | Role & Justification |
| :--- | :--- | :--- |
| **REST API Server** | **FastAPI (Python 3.10)** | Ultra-low latency asynchronous web framework for serving REST endpoints, streaming micro-ticks, and managing model inferences. |
| **ASGI Server** | **Uvicorn** | Production-grade ASGI server running the asynchronous event loop on `http://localhost:8000/`. |
| **Deep Learning** | **PyTorch (`torch.nn`)** | Deep sequence modeling using a 2-layer Stacked LSTM with Layer Normalization and multi-horizon projection linear heads. |
| **Exchange Ingestion**| **Yahoo Finance (`yfinance`)**| Pulls live and historical data directly from the National Stock Exchange of India using ticker `^NSEI`. |
| **Data Engineering** | **NumPy & Pandas** | Computes indicators (RSI-14, SMA-10, SMA-30, EMA-20, relative spread, and volume normalization). |
| **Evaluation Dashboard**| **Streamlit (`app.py`)** | Dedicated secondary interface on `http://localhost:8501/` for reviewing training loss history, RMSE/MAPE metrics, and academic viva reports. |

### B. Frontend & Visual Stack
| Component | Technology | Role & Justification |
| :--- | :--- | :--- |
| **Markup & Layout** | **HTML5 (Semantic)** | Modular structure containing header controls, hero section, living horizon card grid, chart viewport, and technical diagnostics. |
| **Styling & Colors** | **Tailwind CSS + Custom CSS**| **Matte Obsidian (`#0A0A0A`)** background paired with high-contrast **Electric Lime (`#CCFF00`)** accents and Coral Red (`#FF3366`). |
| **3D WebGL Graphics**| **Three.js (r128)** | Renders a live 3D undulating neural terrain and a floating 650-particle constellation that reacts to user mouse movement via damped camera parallax. |
| **Financial Charting**| **TradingView Lightweight Charts (v4.2.0)** | High-performance HTML5 Canvas rendering candlesticks, volume bars, SMA 20, and dynamic AI forecast boundary lines in dark mode (`#131722`) with zero logos. |
| **Client Application**| **Vanilla JavaScript (ES6+)**| Drives the 2-second real-time streaming polling, in-flight candle patching (`candleSeries.update()`), 3D card tilt physics, and CSV exporting. |

---

## 3. Directory & File Structure

```
Nifty-50_predictor/
│
├── server.py                                    # FastAPI asynchronous backend server & live streaming engine
├── train.py                                     # PyTorch training script with Huber loss & evaluation metrics
├── app.py                                       # Streamlit dashboard for academic & lab evaluation (:8501)
├── run_web_app.bat                              # One-click Windows batch script to launch the 3D web app (:8000)
├── run_app.bat                                  # Batch script to launch Streamlit dashboard
├── Experiment_13_NIFTY50_Forecasting.ipynb      # Academic Jupyter Notebook for college lab submission
├── README.md                                    # Repository README
├── PROJECT_CONTEXT_FOR_CLAUDE.md                # This complete documentation file
├── .gitignore                                   # Git ignore rules (pycache, venv, checkpoints)
│
├── data/                                        # Datasets & local caches
│   ├── nifty50_5m_large.csv                     # 60-day 5-minute intraday dataset (~4,496 candles)
│   ├── nifty50_1d_large.csv                     # 20-year daily historical dataset (2005–2026, ~4,690 rows)
│   └── nifty50_historical.csv                   # Baseline historical reference
│
├── frontend/                                    # Interactive 3D Web Application
│   ├── index.html                               # HTML5 semantic structure & 3D WebGL canvas mount
│   ├── app.js                                   # Three.js 3D matrix, Lightweight Charts engine, live stream client
│   └── style.css                                # Matte Obsidian & Electric Lime styling, 3D card tilt effects
│
├── models/                                      # Trained model weights & artifacts
│   ├── nifty50_lstm_5m.pth                      # Trained weights for 5-minute intraday LSTM model
│   ├── nifty50_lstm.pth                         # Trained weights for daily macro LSTM model
│   ├── config_5m.json                           # Hyperparameters for 5-minute model (seq_len=30, hidden=64)
│   ├── config.json                              # Hyperparameters for daily model (seq_len=60, hidden=128)
│   ├── metrics_5m.json                          # Test evaluation metrics for 5m model (MAPE: 0.05%, R²: 0.9588)
│   ├── metrics.json                             # Test evaluation metrics for daily model (MAPE: 0.45%, R²: 0.9625)
│   └── latest_forecast.csv                      # Exported predictions
│
└── src/                                         # Core Python modules
    ├── model.py                                 # PyTorch Stacked LSTM (NiftyLSTMForecaster)
    ├── data_utils.py                            # Technical indicators, relative-offset scaling, cache invalidation
    └── predict.py                               # Inference sliding window & multi-step tensor reconstruction
```

---

## 4. The Core Mathematical Breakthrough: "Relative-Offset Window Normalization"

### The Failure of Traditional MinMax Normalization:
In classic machine learning tutorials, stock prices are normalized globally across the entire dataset:
$$x_{\text{norm}} = \frac{x - x_{\min}}{x_{\max} - x_{\min}}$$
When trained on historical NIFTY-50 data where prices range from ₹2,000 (in 2005) to ₹26,000 (in 2026), the global denominator is ₹24,000. An intraday price swing of ₹20 represents:
$$\Delta x_{\text{norm}} = \frac{20}{24,000} \approx 0.000833$$
Because this value is practically indistinguishable from zero, gradient descent treats intraday fluctuations as noise and rapidly collapses all predictions to a **flat horizontal line (mean-reversion)**.

### The Solution Developed in This Project:
Instead of global scaling, every sequence window $[t - L, t]$ is normalized **relative to its own initial baseline price ($P_0$)**:
$$P_{\text{rel}}(t) = \frac{P(t) - P_0}{P_0}$$
Where:
- $P_0$ is the opening/closing price at the first step of the lookback sequence.
- $P_{\text{rel}}(t)$ represents the exact percentage drift of the asset over the sequence.

```
Lookback Window: [P_0, P_1, P_2, ..., P_L]
                   │
                   ▼
  Scale by: P_rel = (P - P_0) / P_0
                   │
                   ▼
  LSTM Learns Normalized Expansion & Contraction Patterns
                   │
                   ▼
  Output: Predicted Relative Horizons [Pred_High_rel, Pred_Low_rel, Pred_Close_rel]
                   │
                   ▼
  Reconstruct Real Rupee Values:
  Predicted_High = P_0 * (1 + Pred_High_rel)
  Predicted_Low  = P_0 * (1 + Pred_Low_rel)
```

**Benefits:**
1. **Scale-Invariant:** The model behaves identically whether NIFTY is at ₹10,000 or ₹25,000.
2. **Realistic Spreads:** Preserves authentic intraday High-Low spread boundaries without flatlining.
3. **Generalization:** Unseen future market highs do not cause out-of-bounds scaling errors.

---

## 5. Machine Learning Model Architecture (`src/model.py`)

### Architecture Specification:
The model is implemented in PyTorch as `NiftyLSTMForecaster`:
- **Input Dimensions:** `[batch_size, seq_len, in_features=11]`
  - Features: `Close_rel`, `High_rel`, `Low_rel`, `Open_rel`, `SMA_10_rel`, `SMA_30_rel`, `EMA_20_rel`, `RSI_norm`, `Return`, `Range`, `Vol_norm`.
- **Lookback Window (`seq_len`):** 30 steps for 5-minute candles; 60 steps for daily candles.
- **Recurrent Core:** 2-Layer Stacked LSTM with hidden dimension `hidden_dim = 64` (5m) or `128` (daily) and `dropout = 0.2`.
- **LSTM Cell Equations:**
  $$\begin{aligned}
  f_t &= \sigma(W_f x_t + U_f h_{t-1} + b_f) & \text{(Forget Gate)} \\
  i_t &= \sigma(W_i x_t + U_i h_{t-1} + b_i) & \text{(Input Gate)} \\
  \tilde{C}_t &= \tanh(W_c x_t + U_c h_{t-1} + b_c) & \text{(Candidate Cell State)} \\
  C_t &= f_t \odot C_{t-1} + i_t \odot \tilde{C}_t & \text{(Cell State Update)} \\
  o_t &= \sigma(W_o x_t + U_o h_{t-1} + b_o) & \text{(Output Gate)} \\
  h_t &= o_t \odot \tanh(C_t) & \text{(Hidden State)}
  \end{aligned}$$
- **Dense Projection Decoder:**
  $$h_{\text{last}} \longrightarrow \text{Linear}(H \times 4) \longrightarrow \text{Reshape}[B, \text{Horizon}=6, \text{Targets}=4]$$
  Where targets represent: `[Predicted_High, Predicted_Low, Predicted_Close, Predicted_Open]`.

### Loss Function: Huber Loss (Smooth L1)
Financial markets frequently experience flash crashes, unexpected rate hikes, or gap openings. Standard Mean Squared Error (MSE) squares large errors, causing extreme gradient swings that destabilize model weights. This project uses **Huber Loss ($\delta = 1.0$)**:
$$L_\delta(y, \hat{y}) = \begin{cases} 
\frac{1}{2}(y - \hat{y})^2 & \text{for } |y - \hat{y}| \le \delta \\
\delta |y - \hat{y}| - \frac{1}{2}\delta^2 & \text{otherwise}
\end{cases}$$
Huber loss behaves quadratically for small errors (fine precision) and linearly for large outliers (robustness).

### Model Performance Metrics:
- **5-Minute Intraday Model:**
  - High Prediction MAPE: **0.05%**
  - Close Price $R^2$: **0.9588**
  - Dataset: 4,496 continuous 5-minute candles (60 trading days)
- **Daily Macro Model:**
  - High Prediction MAPE: **0.45%**
  - Close Price $R^2$: **0.9625**
  - Dataset: 4,690 daily trading sessions (2005–2026)

---

## 6. Real-Time Streaming & Live Cache Engine (`server.py` & `src/data_utils.py`)

### The Live Market Challenge:
Public financial data providers (Yahoo Finance) impose rate limits if queried every 2 seconds, and free endpoints update at 1 to 5-minute intervals. Furthermore, local static caching previously caused intraday delays.

### The Two-Tier Solution Implemented:
1. **Dynamic Cache Invalidation (`src/data_utils.py`):**
   ```python
   age_minutes = (now - last_dt).total_seconds() / 60.0
   if interval == '5m' and age_minutes > 5.0:
       # Automatically invalidates cache and pulls new market candle from NSE
       df = yf.download('^NSEI', interval='5m', period='60d')
   ```
2. **High-Frequency 2-Second Micro-Tick Generator (`server.py`):**
   - The server maintains an in-flight live state `_live_state`.
   - Every 2 seconds, it introduces sub-minute Gaussian volatility:
     $$\Delta P = \mathcal{N}(\mu = 0.05, \sigma = 1.4)$$
   - It updates the in-flight candle's High, Low, Close, and Volume:
     $$\text{High} = \max(\text{High}, P_{\text{new}}), \quad \text{Low} = \min(\text{Low}, P_{\text{new}}), \quad \text{Close} = P_{\text{new}}$$
   - The price delta is fed into the PyTorch LSTM to dynamically re-adjust the next 6 predicted future boundary targets in real time.

---

## 7. Interactive 3D WebGL Frontend Architecture (`frontend/`)

### A. Three.js 3D Neural Matrix (`frontend/app.js`):
- **Terrain Wireframe:** Renders an undulating 3D plane mesh (`PlaneGeometry(2400, 1600, 48, 36)`) rotated at $-78^\circ$, animated using dual sine/cosine waves:
  $$Z(u, v, t) = \sin(0.005 u + 1.5 t) \cdot \cos(0.005 v + 1.5 t) \cdot 35$$
- **Particle Constellation:** 650 floating particles with additive blending and custom circular canvas textures glowing with Electric Lime (`#CCFF00`).
- **Interactive Mouse Parallax:** Damped camera tracking rotates the 3D scene smoothly based on mouse coordinates:
  $$\text{targetX} = (X_{\text{mouse}} - W/2) \cdot 0.4, \quad \text{Camera}_X \mathrel{+}= (\text{targetX} - \text{Camera}_X) \cdot 0.04$$

### B. 3D Gyroscopic Tilt Cards:
- Built with CSS 3D Transforms (`perspective: 800px; transform-style: preserve-3d;`).
- On `mousemove`, calculates the angle of deflection from the center of the card:
  $$\text{rotateX} = \frac{Y - Y_{\text{center}}}{Y_{\text{center}}} \cdot -12^\circ, \quad \text{rotateY} = \frac{X - X_{\text{center}}}{X_{\text{center}}} \cdot 12^\circ$$
- Internal elements project forward with `translateZ(20px)` to create physical depth.

### C. Dark Mode Charting Canvas:
- Rendered using **TradingView Lightweight Charts v4.2.0** on an isolated dark canvas (`#131722`).
- **Zero Watermarks/Logos:** Completely uncluttered.
- **Colors:** Emerald Green (`#089981`) for bullish candles & upper high forecast lines; Crimson Red (`#F23645`) for bearish candles & lower low forecast lines; Electric Blue (`#2962FF`) for expected close trajectory.
- **Incremental Updates:** Uses `candleSeries.update()` so the canvas updates without full-page re-renders.

---

## 8. REST API Reference

The FastAPI backend exposes the following endpoints:

| Endpoint | Method | Parameters | Response Payload |
| :--- | :---: | :--- | :--- |
| `/api/chart-data` | `GET` | `interval` ('5m' or '1d'), `bars` (20-500), `horizon` (1-10) | Historical candles array, volume bars array, SMA 20 points, transition timestamp, and predicted 6 future candle objects. |
| `/api/live-tick` | `GET` | `interval` ('5m' or '1d') | High-frequency streaming payload: `tick_price`, `is_uptick`, `change_pts`, in-flight `candle`, dynamic `forecast_candles`, and timestamp. |
| `/api/market` | `GET` | `interval` ('5m' or '1d') | Current market summary: last close, day high/low, total volume, and major indices watchlist (NIFTY, BANKNIFTY, SENSEX, CNXIT, SPX). |
| `/api/predict` | `GET` | `interval`, `horizon` | Raw prediction table records (High, Low, Close, Open, Spread, Change %, Trend Bias). |
| `/api/retrain` | `POST` | `interval`, `epochs`, `learning_rate` | Triggers background PyTorch training worker and returns status acknowledgment. |
| `/api/status` | `GET` | *None* | Health check, server time, active PyTorch architecture, and model status. |

---

## 9. How to Run & Verify the Project

### Running the FastAPI 3D Web Application:
```bash
python server.py
# Server starts at: http://localhost:8000/
```
Or simply double-click `run_web_app.bat`.

### Running the Streamlit Academic Dashboard:
```bash
streamlit run app.py --server.port 8501 --server.headless true
# Accessible at: http://localhost:8501/
```

---

## 10. Suggested Prompt Template for Claude

When sharing this project with Claude in a new conversation, paste this file along with the following prompt:

> *"Hi Claude! I have uploaded the complete architecture and code context for my NIFTY-50 Deep Learning Time Series Forecasting project in `PROJECT_CONTEXT_FOR_CLAUDE.md`. Please review this file to understand the Stacked LSTM network, the Relative-Offset normalization, the FastAPI backend, and the 3D WebGL Three.js frontend. I would like your assistance in [insert your task: e.g., code review / adding a new indicator / explaining a concept / preparing for an interview]."*
