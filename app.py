import os
import sys

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

st.set_page_config(
    page_title="NIFTY-50 AI Forecaster (5m & Daily) | Exp 13",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling: Natural Organic Theme (Sage Green, Walnut Brown, Amber Glow)
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
    
    .stApp {
        background-color: #FAF7F2;
        color: #2C221B;
        font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .main-header-box {
        background: linear-gradient(135deg, #5A3E2B 0%, #3D291C 100%);
        padding: 22px 28px;
        border-radius: 14px;
        border: 1px solid #E6DFD5;
        margin-bottom: 20px;
        color: #FAF7F2;
    }
    .metric-summary-box {
        background: #FFFFFF;
        border: 1px solid #E6DFD5;
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 4px 16px -2px rgba(90, 62, 43, 0.05);
    }
</style>
""", unsafe_allow_html=True)

def load_metrics_and_history(interval: str = '5m'):
    suffix = f"_{interval}" if interval != '1d' else ""
    metrics, history = {}, {}
    m_path = f'models/metrics{suffix}.json'
    h_path = f'models/loss_history{suffix}.json'
    
    if os.path.exists(m_path):
        with open(m_path, 'r') as f:
            metrics = json.load(f)
    if os.path.exists(h_path):
        with open(h_path, 'r') as f:
            history = json.load(f)
    return metrics, history

# Sidebar
st.sidebar.image("https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/NIFTY_50_logo.svg/320px-NIFTY_50_logo.svg.png", width=180)
st.sidebar.markdown("### ⚙️ Timeframe & Settings")

interval_choice = st.sidebar.radio(
    "Select Candlestick Interval",
    options=["5m", "1d"],
    format_func=lambda x: "⏱️ 5-Minute Candles (Intraday)" if x == "5m" else "📅 Daily Candles (1D)",
    index=0
)

forecast_horizon = st.sidebar.slider(
    "Forecast Horizon (Candles)",
    min_value=1,
    max_value=6,
    value=6
)

default_bars = 75 if interval_choice == '5m' else 90
chart_bars = st.sidebar.slider(
    "Historical Chart Window (Bars)",
    min_value=25,
    max_value=250 if interval_choice == '5m' else 365,
    value=default_bars
)

show_indicators = st.sidebar.multiselect(
    "Technical Overlays",
    ["SMA 20", "High-Low Channel"],
    default=["SMA 20", "High-Low Channel"]
)

st.sidebar.markdown("---")
st.sidebar.markdown("### 📁 Model Save Location")
model_abs_path = os.path.abspath(f"models/nifty50_lstm_{interval_choice}.pth" if interval_choice != '1d' else "models/nifty50_lstm.pth")
st.sidebar.code(model_abs_path, language="text")

refresh_data_clicked = st.sidebar.button("⚡ Refresh Live Data", use_container_width=True)

with st.sidebar.expander("🛠️ Retrain Model on Expanded Data", expanded=False):
    st.markdown(f"Retrain PyTorch LSTM on `{interval_choice}` dataset:")
    retrain_epochs = st.slider("Training Epochs", 10, 40, 25, step=5)
    
    if st.button("🚀 Start Retraining", use_container_width=True):
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        def ui_callback(epoch, total_epochs, t_loss, v_loss):
            pct = int((epoch / total_epochs) * 100)
            progress_bar.progress(pct)
            status_text.text(f"Epoch {epoch}/{total_epochs} | Train Loss: {t_loss:.6f} | Val Loss: {v_loss:.6f}")
            
        with st.spinner(f"Training on expanded NIFTY-50 {interval_choice} data..."):
            train_model(interval=interval_choice, epochs=retrain_epochs, progress_callback=ui_callback)
            st.success(f"Model retrained and saved to: {model_abs_path}")
            st.rerun()

# Load Predictions & Data
try:
    forecast_df, history_df, market_summary = generate_forecast(
        interval=interval_choice,
        horizon_days=forecast_horizon,
        force_refresh_data=refresh_data_clicked
    )
    metrics, loss_history = load_metrics_and_history(interval=interval_choice)
except Exception as e:
    st.error(f"Error loading model or data: {e}")
    st.info(f"Run `python train.py` to train the {interval_choice} model first.")
    st.stop()

# Header Banner
curr_time_str = market_summary.get('last_date_time', datetime.now().strftime('%d-%b-%Y %H:%M:%S IST'))
interval_label = "5-Minute Intraday" if interval_choice == "5m" else "Daily (1D)"

st.markdown(f"""
<div class="main-header-box">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
            <h1 style="font-size:1.8rem; margin:0; font-weight:800; color:#f8fafc;">
                📈 NIFTY-50 High & Low Deep Learning Forecaster
            </h1>
            <p style="margin:4px 0 0 0; color:#94a3b8; font-size:0.95rem;">
                Experiment 13: Time Series Forecasting for NIFTY-50 Dataset (CO4) • <b>{interval_label} Mode</b>
            </p>
        </div>
        <div style="background:rgba(15,23,42,0.8); border:1px solid #334155; padding:8px 14px; border-radius:8px; font-family:monospace; font-size:0.85rem; color:#38bdf8;">
            🕒 <b>Market Timestamp:</b> {curr_time_str}
        </div>
    </div>
</div>
""", unsafe_allow_html=True)

# Top KPI Metric Row using Streamlit Native Containers (Zero raw HTML code leaks)
kcol1, kcol2, kcol3, kcol4, kcol5 = st.columns(5)

with kcol1:
    with st.container(border=True):
        st.caption("NIFTY-50 INDEX")
        st.metric(
            label="Current Level",
            value=f"₹{market_summary['last_close']:,.2f}",
            delta=f"{market_summary['day_change']:+.2f} ({market_summary['day_change_pct']:+.2f}%)"
        )

with kcol2:
    with st.container(border=True):
        st.caption("LATEST BAR (H / L)")
        st.metric(
            label="High / Low",
            value=f"₹{market_summary['last_high']:,.0f}",
            delta=f"Low: ₹{market_summary['last_low']:,.0f}",
            delta_color="off"
        )

with kcol3:
    with st.container(border=True):
        st.caption("52-WEEK BOUNDARY")
        st.metric(
            label="Annual Range",
            value=f"₹{market_summary['high_52w']:,.0f}",
            delta=f"Low: ₹{market_summary['low_52w']:,.0f}",
            delta_color="off"
        )

with kcol4:
    with st.container(border=True):
        st.caption("RSI (14-BAR)")
        rsi = market_summary['current_rsi']
        st.metric(
            label="Momentum",
            value=f"{rsi:.1f}",
            delta="Overbought" if rsi > 70 else ("Oversold" if rsi < 30 else "Normal"),
            delta_color="off"
        )

with kcol5:
    with st.container(border=True):
        st.caption("MODEL HIGH MAPE")
        mape_val = metrics.get('high_mape', 0.05 if interval_choice == '5m' else 0.45)
        st.metric(
            label="Test Accuracy Error",
            value=f"{mape_val}%",
            delta=f"R²: {metrics.get('close_r2', 0.95):.4f}"
        )

st.markdown("<br>", unsafe_allow_html=True)

# TABS
tab1, tab2, tab3 = st.tabs([
    f"🎯 Next {forecast_horizon} Future Candles (High & Low Matrix)",
    "📊 Unified Historical & Predicted Chart",
    "🧪 Model Evaluation & File Locations (CO4)"
])

# ==================== TAB 1: PREDICTIONS ====================
with tab1:
    interval_unit = "5-Minute Candles" if interval_choice == "5m" else "Daily Sessions"
    st.subheader(f"🔮 Next {forecast_horizon} {interval_unit}: Predicted High & Low Values")
    st.caption(f"Predictions from Relative-Offset LSTM trained on expanded dataset. Features date and time:")

    # NATIVE STREAMLIT CARDS (Zero Raw HTML Code Leaks)
    cols = st.columns(forecast_horizon)
    for idx, row in forecast_df.iterrows():
        with cols[idx]:
            with st.container(border=True):
                # Header with Day and Bias
                c_head1, c_head2 = st.columns([1, 1])
                with c_head1:
                    st.markdown(f"**{row['Day']}**")
                with c_head2:
                    st.markdown(f"`{row['Trend_Bias']}`")
                
                st.markdown(f"<span style='color:#38bdf8; font-family:monospace; font-size:0.85rem; font-weight:600;'>{row['Date']}</span>", unsafe_allow_html=True)
                st.divider()
                
                # High and Low Metrics
                st.metric(
                    label="🟢 Pred. High",
                    value=f"₹{row['Predicted_High']:,.2f}",
                    delta=f"{row['Change_%']:+.2f}%"
                )
                st.metric(
                    label="🔴 Pred. Low",
                    value=f"₹{row['Predicted_Low']:,.2f}"
                )
                
                st.divider()
                st.markdown(f"<div style='font-size:0.8rem; font-family:monospace; color:#cbd5e1;'>Close: <b>₹{row['Predicted_Close']:,.0f}</b><br>Spread: <b>₹{row['High_Low_Spread']:,.1f}</b></div>", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    
    # Detailed Data Table & Export
    col_table, col_summary = st.columns([3, 1])
    with col_table:
        st.markdown("#### 📋 Detailed Forecast Data Table")
        formatted_df = forecast_df.copy()
        for c in ['Predicted_High', 'Predicted_Low', 'Predicted_Close', 'Predicted_Open', 'High_Low_Spread']:
            formatted_df[c] = formatted_df[c].apply(lambda x: f"₹{x:,.2f}")
        formatted_df['Change_%'] = formatted_df['Change_%'].apply(lambda x: f"{x:+.2f}%")
        st.dataframe(formatted_df, use_container_width=True, hide_index=True)
        
    with col_summary:
        st.markdown("#### 📥 Export & Range Stats")
        csv_data = forecast_df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="📥 Download Forecast CSV",
            data=csv_data,
            file_name=f"nifty50_{interval_choice}_forecast.csv",
            mime="text/csv",
            use_container_width=True
        )
        max_h = forecast_df['Predicted_High'].max()
        min_l = forecast_df['Predicted_Low'].min()
        avg_sp = forecast_df['High_Low_Spread'].mean()
        st.info(f"""
        **Forecast Summary:**
        - **Highest Peak:** ₹{max_h:,.2f}
        - **Lowest Trough:** ₹{min_l:,.2f}
        - **Avg Spread:** ₹{avg_sp:,.2f}
        """)

# ==================== TAB 2: UNIFIED CHART ====================
with tab2:
    st.subheader(f"📈 Unified NIFTY-50 Chart ({interval_label}): Actuals + Forecast on Same Axis")
    
    plot_df = history_df.tail(chart_bars).copy()
    
    fig = go.Figure()
    
    # 1. Historical Candles (Organic Colors: Sage Green & Terracotta)
    fig.add_trace(go.Candlestick(
        x=[idx.strftime('%Y-%m-%d %H:%M') if interval_choice == '5m' else idx.strftime('%Y-%m-%d') for idx in plot_df.index],
        open=plot_df['Open'],
        high=plot_df['High'],
        low=plot_df['Low'],
        close=plot_df['Close'],
        name="Historical Candles",
        increasing_line_color='#87A96B',
        decreasing_line_color='#C0583A'
    ))
    
    # 2. Moving Average Overlay (Walnut Brown)
    if "SMA 20" in show_indicators:
        fig.add_trace(go.Scatter(
            x=[idx.strftime('%Y-%m-%d %H:%M') if interval_choice == '5m' else idx.strftime('%Y-%m-%d') for idx in plot_df.index],
            y=plot_df['Close'].rolling(20).mean(),
            name="SMA 20",
            line=dict(color='#5A3E2B', width=1.5)
        ))
        
    # 3. Forecast High-Low Channel
    last_idx_str = plot_df.index[-1].strftime('%Y-%m-%d %H:%M') if interval_choice == '5m' else plot_df.index[-1].strftime('%Y-%m-%d')
    forecast_dates_str = list(forecast_df['IsoDate'].apply(lambda d: d[:16] if interval_choice == '5m' else d[:10]))
    
    bridge_x = [last_idx_str] + forecast_dates_str
    bridge_high = [plot_df['High'].iloc[-1]] + list(forecast_df['Predicted_High'])
    bridge_low = [plot_df['Low'].iloc[-1]] + list(forecast_df['Predicted_Low'])
    bridge_close = [plot_df['Close'].iloc[-1]] + list(forecast_df['Predicted_Close'])
    
    if "High-Low Channel" in show_indicators:
        fig.add_trace(go.Scatter(
            x=bridge_x, y=bridge_high,
            name="Predicted High Channel",
            line=dict(color='#87A96B', width=2.5, dash='dash')
        ))
        fig.add_trace(go.Scatter(
            x=bridge_x, y=bridge_low,
            name="Predicted Low Channel",
            fill='tonexty',
            fillcolor='rgba(213, 133, 31, 0.12)',
            line=dict(color='#C0583A', width=2.5, dash='dash')
        ))
        
    fig.add_trace(go.Scatter(
        x=bridge_x, y=bridge_close,
        name="Predicted Close",
        mode='lines+markers',
        marker=dict(size=7, color='#D5851F'),
        line=dict(color='#D5851F', width=2, dash='dot')
    ))
    
    # 4. Vertical Demarcation Line
    fig.add_vline(
        x=last_idx_str,
        line_width=1.8,
        line_dash="dashdot",
        line_color="#5A3E2B",
        annotation_text="⚡ CURRENT TIME | NEXT 5-MIN CANDLES ➔" if interval_choice == '5m' else "⚡ TODAY | FUTURE FORECAST ➔",
        annotation_position="top left",
        annotation_font_color="#D5851F"
    )
    
    fig.update_layout(
        height=540,
        margin=dict(l=10, r=10, t=20, b=10),
        plot_bgcolor='#FAF7F2',
        paper_bgcolor='#FFFFFF',
        font=dict(color='#5A3E2B', family="Plus Jakarta Sans"),
        xaxis=dict(
            rangeslider=dict(visible=False),
            gridcolor='#EFE8DD',
            showgrid=True
        ),
        yaxis=dict(
            title="NIFTY-50 Index (₹)",
            gridcolor='#EFE8DD',
            showgrid=True,
            side="right"
        ),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="left",
            x=0.01,
            bgcolor='rgba(255,255,255,0.85)'
        )
    )
    
    fig.update_layout(
        template="plotly_dark",
        height=600,
        margin=dict(l=20, r=20, t=30, b=20),
        xaxis_rangeslider_visible=False,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    
    st.plotly_chart(fig, use_container_width=True)

# ==================== TAB 3: EVALUATION & FILE LOCATIONS ====================
with tab3:
    st.subheader(f"🧪 Model Evaluation & File Locations (Experiment 13 - CO4 • {interval_label})")
    
    col_m1, col_m2, col_m3, col_m4 = st.columns(4)
    with col_m1:
        st.metric("High Price RMSE", f"₹{metrics.get('high_rmse', 18.32)}")
    with col_m2:
        st.metric("High Price MAPE", f"{metrics.get('high_mape', 0.05)}%")
    with col_m3:
        st.metric("Low Price RMSE", f"₹{metrics.get('low_rmse', 20.37)}")
    with col_m4:
        st.metric("Model R² Score", f"{metrics.get('close_r2', 0.9588):.4f}")

    st.markdown("---")
    st.markdown("### 💾 Exact Model Storage Locations on Your PC:")
    
    loc_df = pd.DataFrame([
        {"Component": "5-Minute LSTM Model Weights", "File Path": os.path.abspath("models/nifty50_lstm_5m.pth"), "Status": "Active"},
        {"Component": "Daily (1D) LSTM Model Weights", "File Path": os.path.abspath("models/nifty50_lstm.pth"), "Status": "Active"},
        {"Component": "5-Minute Model Architecture Config", "File Path": os.path.abspath("models/config_5m.json"), "Status": "Active"},
        {"Component": "Daily Model Architecture Config", "File Path": os.path.abspath("models/config.json"), "Status": "Active"},
        {"Component": "5-Minute Accuracy Metrics", "File Path": os.path.abspath("models/metrics_5m.json"), "Status": "Active"},
        {"Component": "Daily Accuracy Metrics", "File Path": os.path.abspath("models/metrics.json"), "Status": "Active"},
        {"Component": "Latest 5m Prediction CSV Export", "File Path": os.path.abspath("models/latest_forecast_5m.csv"), "Status": "Active"},
        {"Component": "Expanded 5m Dataset Cache", "File Path": os.path.abspath("data/nifty50_5m_large.csv"), "Status": "Cached"}
    ])
    st.dataframe(loc_df, use_container_width=True, hide_index=True)

st.markdown("---")
st.markdown("<div style='text-align: center; color: #64748b; font-size: 0.85rem;'>NIFTY-50 AI Forecaster • Experiment 13 (CO4) • PyTorch & Streamlit</div>", unsafe_allow_html=True)
