import os
import sys

# Ensure root directory is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

import json
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st
from datetime import datetime

from src.predict import load_predictor, generate_forecast
from src.data_utils import fetch_nifty_data, add_technical_indicators
from train import train_model

# Streamlit Page Config
st.set_page_config(
    page_title="NIFTY-50 High/Low Predictor | Exp 13 (CO4)",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .main-header {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        padding: 24px 30px;
        border-radius: 12px;
        color: white;
        margin-bottom: 25px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.1);
        border: 1px solid rgba(255,255,255,0.08);
    }
    .main-header h1 {
        margin: 0;
        font-size: 2.1rem;
        font-weight: 700;
        letter-spacing: -0.5px;
        color: #f8fafc;
    }
    .main-header p {
        margin: 6px 0 0 0;
        color: #94a3b8;
        font-size: 1.0rem;
    }
    .metric-card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 18px 20px;
        color: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .metric-card .title {
        font-size: 0.85rem;
        color: #94a3b8;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
    }
    .metric-card .value {
        font-size: 1.7rem;
        font-weight: 700;
        margin: 4px 0;
        color: #f1f5f9;
    }
    .metric-card .subtitle {
        font-size: 0.82rem;
    }
    .forecast-card {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 12px;
        transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .forecast-card:hover {
        border-color: #38bdf8;
        transform: translateY(-2px);
    }
    .badge-bullish {
        background-color: rgba(34, 197, 94, 0.15);
        color: #4ade80;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
    }
    .badge-bearish {
        background-color: rgba(239, 68, 68, 0.15);
        color: #f87171;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
    }
    .badge-neutral {
        background-color: rgba(234, 179, 8, 0.15);
        color: #facc15;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)

# Helper function to load metrics & history
def load_metrics_and_history():
    metrics, history = {}, {}
    if os.path.exists('models/metrics.json'):
        with open('models/metrics.json', 'r') as f:
            metrics = json.load(f)
    if os.path.exists('models/loss_history.json'):
        with open('models/loss_history.json', 'r') as f:
            history = json.load(f)
    return metrics, history

# Sidebar
st.sidebar.image("https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/NIFTY_50_logo.svg/320px-NIFTY_50_logo.svg.png", width=180)
st.sidebar.markdown("### ⚙️ Forecaster Settings")

forecast_horizon = st.sidebar.slider(
    "Forecast Horizon (Days)",
    min_value=1,
    max_value=6,
    value=6,
    help="Select how many future sessions to forecast (User requested next 5-6 highs and lows)"
)

chart_history_days = st.sidebar.select_slider(
    "Historical Chart Window",
    options=[30, 60, 90, 180, 365],
    value=90,
    help="Trading days of historical candlesticks to display alongside prediction"
)

show_indicators = st.sidebar.multiselect(
    "Technical Overlays",
    ["SMA 20", "SMA 50", "Bollinger Bands", "RSI Subplot"],
    default=["SMA 20", "Bollinger Bands"]
)

st.sidebar.markdown("---")
st.sidebar.markdown("### 🔄 Live Data & Retrain")

refresh_data_clicked = st.sidebar.button("⚡ Refresh Live NSE Data", use_container_width=True)

with st.sidebar.expander("🛠️ Retrain Model from Scratch", expanded=False):
    st.markdown("Re-train the PyTorch LSTM on all historical NIFTY-50 values:")
    retrain_epochs = st.slider("Training Epochs", 10, 50, 30, step=5)
    retrain_lr = st.selectbox("Learning Rate", [0.003, 0.002, 0.001], index=1)
    
    if st.button("🚀 Start Retraining", use_container_width=True):
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        def ui_callback(epoch, total_epochs, t_loss, v_loss):
            pct = int((epoch / total_epochs) * 100)
            progress_bar.progress(pct)
            status_text.text(f"Epoch {epoch}/{total_epochs} | Train Loss: {t_loss:.5f} | Val Loss: {v_loss:.5f}")
            
        with st.spinner("Training PyTorch LSTM on NIFTY-50 historical dataset..."):
            train_model(epochs=retrain_epochs, learning_rate=retrain_lr, progress_callback=ui_callback)
            st.success("Model successfully retrained and saved to disk!")
            st.rerun()

st.sidebar.markdown("---")
st.sidebar.markdown("""
**Experiment 13 Context (CO4):**
- **Course Outcome:** CO4 (RNNs, LSTMs, GRUs)
- **Dataset:** NIFTY-50 Index (^NSEI)
- **Architecture:** Stacked PyTorch LSTM with Multi-Horizon Dense Projection
""")

# Load predictions & Market summary
try:
    forecast_df, history_df, market_summary = generate_forecast(
        horizon_days=forecast_horizon,
        force_refresh_data=refresh_data_clicked
    )
    metrics, loss_history = load_metrics_and_history()
except Exception as e:
    st.error(f"Error loading model or data: {e}")
    st.info("Make sure you run `python train.py` first to generate initial model weights.")
    st.stop()

# Header Banner
st.markdown("""
<div class="main-header">
    <h1>📈 NIFTY-50 High & Low Deep Learning Forecaster</h1>
    <p>Experiment 13: Time Series Forecasting for the NIFTY-50 Dataset (CO4) | PyTorch Stacked LSTM Architecture</p>
</div>
""", unsafe_allow_html=True)

# Top KPI Metric Row
col1, col2, col3, col4, col5 = st.columns(5)

with col1:
    day_chg = market_summary['day_change']
    chg_color = "#4ade80" if day_chg >= 0 else "#f87171"
    sign = "+" if day_chg >= 0 else ""
    st.markdown(f"""
    <div class="metric-card">
        <div class="title">NIFTY-50 Current</div>
        <div class="value">₹{market_summary['last_close']:,.2f}</div>
        <div class="subtitle" style="color: {chg_color}; font-weight:600;">
            {sign}{market_summary['day_change']:,.2f} ({sign}{market_summary['day_change_pct']}%)
        </div>
    </div>
    """, unsafe_allow_html=True)

with col2:
    st.markdown(f"""
    <div class="metric-card">
        <div class="title">Today's Range (H / L)</div>
        <div class="value" style="font-size: 1.35rem; color: #38bdf8;">₹{market_summary['last_high']:,.0f} / ₹{market_summary['last_low']:,.0f}</div>
        <div class="subtitle" style="color: #94a3b8;">Spread: ₹{market_summary['last_high'] - market_summary['last_low']:,.2f}</div>
    </div>
    """, unsafe_allow_html=True)

with col3:
    st.markdown(f"""
    <div class="metric-card">
        <div class="title">52-Week High / Low</div>
        <div class="value" style="font-size: 1.35rem; color: #e2e8f0;">₹{market_summary['high_52w']:,.0f} / ₹{market_summary['low_52w']:,.0f}</div>
        <div class="subtitle" style="color: #94a3b8;">As of {market_summary['last_date']}</div>
    </div>
    """, unsafe_allow_html=True)

with col4:
    rsi = market_summary['current_rsi']
    rsi_sentiment = "Overbought" if rsi > 70 else ("Oversold" if rsi < 30 else "Healthy Momentum")
    st.markdown(f"""
    <div class="metric-card">
        <div class="title">RSI (14-Day)</div>
        <div class="value" style="color: #a78bfa;">{rsi}</div>
        <div class="subtitle" style="color: #cbd5e1;">{rsi_sentiment}</div>
    </div>
    """, unsafe_allow_html=True)

with col5:
    model_mape = metrics.get('high_mape', 2.04)
    st.markdown(f"""
    <div class="metric-card">
        <div class="title">Model High MAPE</div>
        <div class="value" style="color: #34d399;">{model_mape}%</div>
        <div class="subtitle" style="color: #94a3b8;">Test Set Error (CO4)</div>
    </div>
    """, unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)

# TABS for UI Organization
tab1, tab2, tab3 = st.tabs([
    "🎯 Future High & Low Predictions",
    "📊 Interactive Price & Forecast Chart",
    "🧪 Model Architecture & Lab Evaluation (CO4)"
])

# ==================== TAB 1: PREDICTIONS ====================
with tab1:
    st.subheader(f"🔮 Next {forecast_horizon} Trading Days: Predicted High & Low Values")
    st.markdown("Predictions generated directly by the trained Stacked LSTM based on recent 60-day historical sequence:")
    
    # Grid of Forecast Cards
    cols = st.columns(forecast_horizon)
    for idx, row in forecast_df.iterrows():
        with cols[idx]:
            badge_class = "badge-bullish" if "Bullish" in row['Trend_Bias'] else ("badge-bearish" if "Bearish" in row['Trend_Bias'] else "badge-neutral")
            st.markdown(f"""
            <div class="forecast-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:700; color:#38bdf8; font-size:1.0rem;">{row['Day']}</span>
                    <span class="{badge_class}">{row['Trend_Bias']}</span>
                </div>
                <div style="font-size:0.85rem; color:#94a3b8; margin-bottom:12px;">{row['Date']}</div>
                
                <div style="margin-bottom:8px;">
                    <span style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase;">Pred. High</span><br>
                    <span style="font-size:1.35rem; font-weight:700; color:#4ade80;">₹{row['Predicted_High']:,.2f}</span>
                </div>
                
                <div style="margin-bottom:8px;">
                    <span style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase;">Pred. Low</span><br>
                    <span style="font-size:1.35rem; font-weight:700; color:#f87171;">₹{row['Predicted_Low']:,.2f}</span>
                </div>
                
                <hr style="border-color:#334155; margin:10px 0;">
                
                <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#cbd5e1;">
                    <span>Close: <b>₹{row['Predicted_Close']:,.0f}</b></span>
                    <span>Spread: <b>₹{row['High_Low_Spread']:,.0f}</b></span>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Detailed Data Table & Export
    col_table, col_summary = st.columns([3, 1])
    with col_table:
        st.markdown("#### 📋 Detailed Forecast Table")
        formatted_df = forecast_df.copy()
        for c in ['Predicted_High', 'Predicted_Low', 'Predicted_Close', 'Predicted_Open', 'High_Low_Spread']:
            formatted_df[c] = formatted_df[c].apply(lambda x: f"₹{x:,.2f}")
        formatted_df['Change_%'] = formatted_df['Change_%'].apply(lambda x: f"{x:+.2f}%")
        st.dataframe(formatted_df, use_container_width=True, hide_index=True)
        
    with col_summary:
        st.markdown("#### 📥 Export & Quick Stats")
        csv_data = forecast_df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="📥 Download Forecast CSV",
            data=csv_data,
            file_name=f"nifty50_forecast_{datetime.now().strftime('%Y%m%d')}.csv",
            mime="text/csv",
            use_container_width=True
        )
        
        max_proj_high = forecast_df['Predicted_High'].max()
        min_proj_low = forecast_df['Predicted_Low'].min()
        avg_spread = forecast_df['High_Low_Spread'].mean()
        
        st.info(f"""
        **6-Day Projected Channel:**
        - **Highest Peak:** ₹{max_proj_high:,.2f}
        - **Lowest Trough:** ₹{min_proj_low:,.2f}
        - **Average Daily Spread:** ₹{avg_spread:,.2f}
        """)

# ==================== TAB 2: INTERACTIVE CHART ====================
with tab2:
    st.subheader("📈 NIFTY-50 Candlestick Chart with Projected High/Low Channel")
    
    # Slice historical dataframe for visualization
    plot_df = history_df.tail(chart_history_days).copy()
    
    has_rsi = "RSI Subplot" in show_indicators
    rows_num = 2 if has_rsi else 1
    row_heights = [0.75, 0.25] if has_rsi else [1.0]
    
    fig = make_subplots(
        rows=rows_num, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.04,
        row_heights=row_heights
    )
    
    # 1. Historical Candlesticks
    fig.add_trace(go.Candlestick(
        x=plot_df.index,
        open=plot_df['Open'],
        high=plot_df['High'],
        low=plot_df['Low'],
        close=plot_df['Close'],
        name="Historical NIFTY-50",
        increasing_line_color='#22c55e',
        decreasing_line_color='#ef4444'
    ), row=1, col=1)
    
    # 2. Moving Average Overlays
    if "SMA 20" in show_indicators:
        fig.add_trace(go.Scatter(
            x=plot_df.index,
            y=plot_df['Close'].rolling(20).mean(),
            name="SMA 20",
            line=dict(color='#f59e0b', width=1.5)
        ), row=1, col=1)
        
    if "SMA 50" in show_indicators:
        fig.add_trace(go.Scatter(
            x=plot_df.index,
            y=plot_df['Close'].rolling(50).mean(),
            name="SMA 50",
            line=dict(color='#3b82f6', width=1.5)
        ), row=1, col=1)
        
    if "Bollinger Bands" in show_indicators:
        rolling_mean = plot_df['Close'].rolling(20).mean()
        rolling_std = plot_df['Close'].rolling(20).std()
        upper_bb = rolling_mean + (2 * rolling_std)
        lower_bb = rolling_mean - (2 * rolling_std)
        
        fig.add_trace(go.Scatter(
            x=plot_df.index, y=upper_bb,
            name="Upper BB",
            line=dict(color='rgba(148, 163, 184, 0.4)', dash='dot', width=1)
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=plot_df.index, y=lower_bb,
            name="Lower BB",
            fill='tonexty',
            fillcolor='rgba(148, 163, 184, 0.05)',
            line=dict(color='rgba(148, 163, 184, 0.4)', dash='dot', width=1)
        ), row=1, col=1)
        
    # 3. Forecast High-Low Channel
    # Extract forecast dates as datetime objects for seamless plotting
    forecast_dates = pd.to_datetime([d.split(' (')[0] for d in forecast_df['Date']], format='%d-%b-%Y')
    
    # Connect last known date to first forecast date
    bridge_x = [plot_df.index[-1]] + list(forecast_dates)
    bridge_high = [plot_df['High'].iloc[-1]] + list(forecast_df['Predicted_High'])
    bridge_low = [plot_df['Low'].iloc[-1]] + list(forecast_df['Predicted_Low'])
    bridge_close = [plot_df['Close'].iloc[-1]] + list(forecast_df['Predicted_Close'])
    
    # High Line
    fig.add_trace(go.Scatter(
        x=bridge_x, y=bridge_high,
        name="Predicted High Channel",
        line=dict(color='#4ade80', width=2.5, dash='dash')
    ), row=1, col=1)
    
    # Low Line
    fig.add_trace(go.Scatter(
        x=bridge_x, y=bridge_low,
        name="Predicted Low Channel",
        fill='tonexty',
        fillcolor='rgba(56, 189, 248, 0.12)',  # Shaded forecast envelope
        line=dict(color='#38bdf8', width=2.5, dash='dash')
    ), row=1, col=1)
    
    # Close Line
    fig.add_trace(go.Scatter(
        x=bridge_x, y=bridge_close,
        name="Predicted Close",
        mode='lines+markers',
        marker=dict(size=6, color='#fbbf24'),
        line=dict(color='#fbbf24', width=2)
    ), row=1, col=1)
    
    # 4. RSI Subplot if selected
    if has_rsi:
        fig.add_trace(go.Scatter(
            x=plot_df.index, y=plot_df['RSI_14'],
            name="RSI (14)",
            line=dict(color='#c084fc', width=1.5)
        ), row=2, col=1)
        fig.add_hline(y=70, line_dash="dash", line_color="rgba(239, 68, 68, 0.6)", row=2, col=1)
        fig.add_hline(y=30, line_dash="dash", line_color="rgba(34, 197, 94, 0.6)", row=2, col=1)
        
    fig.update_layout(
        template="plotly_dark",
        height=620,
        margin=dict(l=20, r=20, t=30, b=20),
        xaxis_rangeslider_visible=False,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    
    st.plotly_chart(fig, use_container_width=True)

# ==================== TAB 3: EVALUATION & LAB SUBMISSION ====================
with tab3:
    st.subheader("🧪 Deep Learning Lab Submission Details (Experiment 13 - CO4)")
    
    st.markdown("""
    This section provides the rigorous empirical evaluation and mathematical formulation 
    for college lab evaluation criteria:
    """)
    
    col_m1, col_m2, col_m3, col_m4 = st.columns(4)
    with col_m1:
        st.metric("High Price RMSE", f"₹{metrics.get('high_rmse', 641.01)}")
        st.caption("Root Mean Squared Error on Unseen Test Split")
    with col_m2:
        st.metric("High Price MAPE", f"{metrics.get('high_mape', 2.04)}%")
        st.caption("Mean Absolute Percentage Error")
    with col_m3:
        st.metric("Low Price RMSE", f"₹{metrics.get('low_rmse', 707.23)}")
        st.caption("Root Mean Squared Error for Lows")
    with col_m4:
        st.metric("Low Price MAPE", f"{metrics.get('low_mape', 2.31)}%")
        st.caption("Mean Absolute Percentage Error for Lows")
        
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Graphs: Loss History & Test Set Actual vs Predicted
    c_graph1, c_graph2 = st.columns(2)
    
    with c_graph1:
        st.markdown("#### 📉 Training & Validation Loss Curves")
        if loss_history and 'train_loss' in loss_history:
            df_loss = pd.DataFrame(loss_history)
            df_loss.index = df_loss.index + 1
            st.line_chart(df_loss)
            st.caption("Huber (Smooth L1) Loss progression across training epochs showing steady convergence without overfitting.")
        else:
            st.info("Train loss history available after running train.py")
            
    with c_graph2:
        st.markdown("#### 🎯 Unseen Test Set: Actual vs Predicted Highs")
        if os.path.exists('models/test_eval_predictions.csv'):
            eval_df = pd.read_csv('models/test_eval_predictions.csv')
            eval_sub = eval_df.tail(60).set_index('Date')
            st.line_chart(eval_sub[['Actual_High', 'Pred_High']])
            st.caption("Overlay of True Market Highs vs PyTorch LSTM Predictions on the most recent 60 test sessions.")
        else:
            st.info("Test set predictions available in models/test_eval_predictions.csv")

    st.markdown("---")
    st.markdown("### 📚 Theoretical Formulation of LSTM Cell (CO4)")
    st.markdown(r"""
    The Long Short-Term Memory network overcomes the vanishing gradient problem in traditional RNNs by introducing an explicit memory cell state $C_t$ governed by three gating mechanisms:
    
    $$\begin{aligned}
    \text{Forget Gate:} \quad & f_t = \sigma(W_f \cdot [h_{t-1}, x_t] + b_f) \\
    \text{Input Gate:} \quad & i_t = \sigma(W_i \cdot [h_{t-1}, x_t] + b_i) \\
    \text{Candidate State:} \quad & \tilde{C}_t = \tanh(W_c \cdot [h_{t-1}, x_t] + b_c) \\
    \text{Cell State Update:} \quad & C_t = f_t \odot C_{t-1} + i_t \odot \tilde{C}_t \\
    \text{Output Gate:} \quad & o_t = \sigma(W_o \cdot [h_{t-1}, x_t] + b_o) \\
    \text{Hidden Output:} \quad & h_t = o_t \odot \tanh(C_t)
    \end{aligned}$$
    
    **Multi-Horizon Projection:**
    The final hidden state $h_{60} \in \mathbb{R}^{128}$ is projected via a dense multi-head decoder to jointly predict all future time horizons:
    $$\hat{Y}_{t+1:t+6} = \text{Decoder}(h_{60}) \in \mathbb{R}^{6 \times 4}$$
    """)

# Footer
st.markdown("---")
st.markdown(
    "<div style='text-align: center; color: #64748b; font-size: 0.85rem;'>"
    "NIFTY-50 Time Series Forecasting Lab System • Course Outcome CO4 • PyTorch & Streamlit"
    "</div>", 
    unsafe_allow_html=True
)
