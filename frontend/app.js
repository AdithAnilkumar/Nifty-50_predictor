/**
 * NIFTY-50 AI Forecaster Frontend Application
 * Interacts with FastAPI backend to render unified historical and predicted time-series charts.
 */

let appState = {
    historyDays: 90,
    horizon: 6,
    chartType: 'candlestick',
    showSMA: true,
    showChannel: true,
    showBB: false,
    chartData: null
};

// DOM Elements
const chartContainer = document.getElementById('plotly-chart-container');
const chartLoader = document.getElementById('chart-loader');
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const selectHorizon = document.getElementById('select-horizon');
const btnCandle = document.getElementById('btn-chart-candle');
const btnLine = document.getElementById('btn-chart-line');
const toggleSMA = document.getElementById('toggle-sma');
const toggleChannel = document.getElementById('toggle-channel');
const toggleBB = document.getElementById('toggle-bb');
const btnDownloadCSV = document.getElementById('btn-download-csv');
const btnRetrain = document.getElementById('btn-retrain');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    fetchChartData(false);
});

function setupEventListeners() {
    // Refresh button
    btnRefresh.addEventListener('click', () => {
        refreshIcon.classList.add('animate-spin');
        fetchChartData(true).finally(() => {
            setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);
        });
    });

    // Timeframe selector
    document.querySelectorAll('.btn-timeframe').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn-timeframe').forEach(b => b.classList.remove('active', 'bg-sky-600', 'text-white', 'font-bold'));
            e.target.classList.add('active', 'bg-sky-600', 'text-white', 'font-bold');
            appState.historyDays = parseInt(e.target.dataset.days);
            fetchChartData(false);
        });
    });

    // Horizon selector
    selectHorizon.addEventListener('change', (e) => {
        appState.horizon = parseInt(e.target.value);
        fetchChartData(false);
    });

    // Chart Type (Candle vs Line)
    btnCandle.addEventListener('click', () => {
        appState.chartType = 'candlestick';
        btnCandle.classList.add('active', 'bg-slate-700', 'text-white', 'font-semibold');
        btnCandle.classList.remove('text-slate-400');
        btnLine.classList.remove('active', 'bg-slate-700', 'text-white', 'font-semibold');
        btnLine.classList.add('text-slate-400');
        renderUnifiedChart();
    });

    btnLine.addEventListener('click', () => {
        appState.chartType = 'line';
        btnLine.classList.add('active', 'bg-slate-700', 'text-white', 'font-semibold');
        btnLine.classList.remove('text-slate-400');
        btnCandle.classList.remove('active', 'bg-slate-700', 'text-white', 'font-semibold');
        btnCandle.classList.add('text-slate-400');
        renderUnifiedChart();
    });

    // Overlays
    toggleSMA.addEventListener('change', (e) => {
        appState.showSMA = e.target.checked;
        renderUnifiedChart();
    });

    toggleChannel.addEventListener('change', (e) => {
        appState.showChannel = e.target.checked;
        renderUnifiedChart();
    });

    toggleBB.addEventListener('change', (e) => {
        appState.showBB = e.target.checked;
        renderUnifiedChart();
    });

    // CSV Download
    btnDownloadCSV.addEventListener('click', downloadForecastCSV);

    // Retrain button
    btnRetrain.addEventListener('click', handleRetrain);
}

/**
 * Fetch unified chart data from the FastAPI backend
 */
async function fetchChartData(forceRefresh = false) {
    showLoader(true);
    try {
        const url = `/api/chart-data?history_days=${appState.historyDays}&horizon=${appState.horizon}&force_refresh=${forceRefresh}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        appState.chartData = data;
        
        // Update components
        updateMarketKPIs(data.market_summary);
        renderUnifiedChart();
        renderForecastCards(data.forecast);
        renderForecastTable(data.forecast);
        updateModelMetrics(data.metrics);
        
    } catch (err) {
        console.error('Error fetching chart data:', err);
        alert('Could not load data from API. Please ensure server.py is running.');
    } finally {
        showLoader(false);
    }
}

function showLoader(visible) {
    if (!chartLoader) return;
    if (visible) {
        chartLoader.classList.remove('hidden');
        chartLoader.style.opacity = '1';
    } else {
        chartLoader.style.opacity = '0';
        setTimeout(() => chartLoader.classList.add('hidden'), 200);
    }
}

/**
 * Update Top Bar KPIs
 */
function updateMarketKPIs(summary) {
    if (!summary) return;
    
    document.getElementById('kpi-close').textContent = `₹${summary.last_close.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    
    const chgEl = document.getElementById('kpi-change');
    const sign = summary.day_change >= 0 ? '+' : '';
    chgEl.textContent = `${sign}${summary.day_change.toFixed(2)} (${sign}${summary.day_change_pct.toFixed(2)}%)`;
    
    if (summary.day_change >= 0) {
        chgEl.className = 'text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    } else {
        chgEl.className = 'text-xs font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30';
    }

    document.getElementById('kpi-high').textContent = `₹${summary.last_high.toLocaleString('en-IN')}`;
    document.getElementById('kpi-low').textContent = `₹${summary.last_low.toLocaleString('en-IN')}`;
    document.getElementById('kpi-52w').textContent = `₹${summary.low_52w.toLocaleString('en-IN')} - ₹${summary.high_52w.toLocaleString('en-IN')}`;
    document.getElementById('kpi-rsi').textContent = summary.current_rsi.toFixed(1);
}

/**
 * RENDER THE UNIFIED CHART: Current + Predicted in the EXACT Same Graph
 */
function renderUnifiedChart() {
    if (!appState.chartData) return;
    
    const { historical, forecast, transition_date, transition_price } = appState.chartData;
    const traces = [];

    // 1. HISTORICAL COMPONENT (Current Actual Market Data)
    const histDates = historical.map(d => d.date);
    const histOpens = historical.map(d => d.open);
    const histHighs = historical.map(d => d.high);
    const histLows = historical.map(d => d.low);
    const histCloses = historical.map(d => d.close);

    if (appState.chartType === 'candlestick') {
        // Historical Actual Candlesticks
        traces.push({
            type: 'candlestick',
            name: 'Historical NIFTY-50',
            x: histDates,
            open: histOpens,
            high: histHighs,
            low: histLows,
            close: histCloses,
            increasing: { line: { color: '#22c55e', width: 1.5 }, fillcolor: '#22c55e' },
            decreasing: { line: { color: '#ef4444', width: 1.5 }, fillcolor: '#ef4444' },
            hoverinfo: 'x+y+text',
            hoverlabel: { bgcolor: '#1e293b' }
        });
    } else {
        // Historical Line Chart
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Historical Close',
            x: histDates,
            y: histCloses,
            line: { color: '#38bdf8', width: 2.2 },
            hoverinfo: 'x+y'
        });
    }

    // 2. TECHNICAL OVERLAYS (on historical portion)
    if (appState.showSMA) {
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'SMA 20',
            x: histDates,
            y: historical.map(d => d.sma20),
            line: { color: '#fbbf24', width: 1.5 },
            hoverinfo: 'skip'
        });
    }

    if (appState.showBB) {
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Upper BB',
            x: histDates,
            y: historical.map(d => d.upper_bb),
            line: { color: 'rgba(148, 163, 184, 0.4)', dash: 'dot', width: 1 },
            hoverinfo: 'skip'
        });
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Lower BB',
            x: histDates,
            y: historical.map(d => d.lower_bb),
            line: { color: 'rgba(148, 163, 184, 0.4)', dash: 'dot', width: 1 },
            fill: 'tonexty',
            fillcolor: 'rgba(148, 163, 184, 0.05)',
            hoverinfo: 'skip'
        });
    }

    // 3. PREDICTED COMPONENT (Continuous on the EXACT SAME TIME AXIS)
    // Bridge from last historical date to forecast dates
    const lastHist = historical[historical.length - 1];
    const bridgeDates = [lastHist.date, ...forecast.map(f => f.date)];
    const bridgeHighs = [lastHist.high, ...forecast.map(f => f.high)];
    const bridgeLows = [lastHist.low, ...forecast.map(f => f.low)];
    const bridgeCloses = [lastHist.close, ...forecast.map(f => f.close)];

    // Shaded Forecast Channel (High-Low Envelope)
    if (appState.showChannel) {
        // Upper High Boundary
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Predicted High Channel',
            x: bridgeDates,
            y: bridgeHighs,
            line: { color: '#4ade80', width: 2.5, dash: 'dash' },
            hoverinfo: 'x+y',
            hoverlabel: { bgcolor: '#064e3b' }
        });

        // Lower Low Boundary with Shaded Fill between High and Low
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Predicted Low Channel',
            x: bridgeDates,
            y: bridgeLows,
            fill: 'tonexty',
            fillcolor: 'rgba(56, 189, 248, 0.15)', // Shaded prediction channel
            line: { color: '#38bdf8', width: 2.5, dash: 'dash' },
            hoverinfo: 'x+y',
            hoverlabel: { bgcolor: '#0c4a6e' }
        });
    }

    // Predicted Candlesticks (rendered directly in the forecast window)
    if (appState.chartType === 'candlestick') {
        traces.push({
            type: 'candlestick',
            name: 'Predicted Candlesticks (AI)',
            x: forecast.map(f => f.date),
            open: forecast.map(f => f.open),
            high: forecast.map(f => f.high),
            low: forecast.map(f => f.low),
            close: forecast.map(f => f.close),
            increasing: { line: { color: '#34d399', width: 2 }, fillcolor: 'rgba(52, 211, 153, 0.6)' },
            decreasing: { line: { color: '#f87171', width: 2 }, fillcolor: 'rgba(248, 113, 113, 0.6)' },
            hoverinfo: 'x+y+text',
            hoverlabel: { bgcolor: '#1e293b' }
        });
    }

    // Predicted Close Trajectory Line
    traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Predicted Close Path',
        x: bridgeDates,
        y: bridgeCloses,
        line: { color: '#fbbf24', width: 2, dash: 'dot' },
        marker: { size: 6, color: '#fbbf24' },
        hoverinfo: 'x+y'
    });

    // 4. VERTICAL DEMARCATION LINE (Today vs Forecast Horizon)
    const shapes = [
        {
            type: 'line',
            x0: transition_date,
            x1: transition_date,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: '#e2e8f0',
                width: 1.8,
                dash: 'dashdot'
            }
        }
    ];

    const annotations = [
        {
            x: transition_date,
            y: 0.98,
            yref: 'paper',
            text: '⚡ TODAY (Actual) | FORECAST ➔',
            showarrow: false,
            font: {
                color: '#38bdf8',
                size: 11,
                family: 'JetBrains Mono, monospace',
                weight: 'bold'
            },
            bgcolor: 'rgba(15, 23, 42, 0.85)',
            bordercolor: '#38bdf8',
            borderwidth: 1,
            borderpad: 4
        }
    ];

    // Plotly Layout Configuration
    const layout = {
        template: 'plotly_dark',
        paper_bgcolor: '#111827',
        plot_bgcolor: '#111827',
        font: { family: 'Inter, sans-serif', color: '#94a3b8' },
        margin: { l: 60, r: 40, t: 30, b: 40 },
        height: 560,
        dragmode: 'pan',
        xaxis: {
            type: 'category',
            showgrid: true,
            gridcolor: '#1f2937',
            linecolor: '#334155',
            tickfont: { size: 10, family: 'JetBrains Mono' },
            rangeslider: { visible: false }
        },
        yaxis: {
            showgrid: true,
            gridcolor: '#1f2937',
            linecolor: '#334155',
            tickfont: { size: 11, family: 'JetBrains Mono' },
            tickprefix: '₹',
            autorange: true
        },
        legend: {
            orientation: 'h',
            x: 0,
            y: 1.08,
            font: { size: 11, color: '#e2e8f0' },
            bgcolor: 'rgba(17, 24, 39, 0.5)'
        },
        shapes: shapes,
        annotations: annotations
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

    Plotly.react('plotly-chart-container', traces, layout, config);
}

/**
 * Render individual forecast cards
 */
function renderForecastCards(forecast) {
    const grid = document.getElementById('forecast-cards-grid');
    if (!grid || !forecast) return;

    grid.innerHTML = forecast.map((f, i) => {
        const isBullish = f.trend_bias.includes('Bullish');
        const isBearish = f.trend_bias.includes('Bearish');
        const badgeClass = isBullish ? 'badge-bullish' : (isBearish ? 'badge-bearish' : 'badge-neutral');
        const changeSign = f.change_pct >= 0 ? '+' : '';

        return `
            <div class="forecast-card-glass rounded-xl p-4 flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <span class="text-xs font-bold text-sky-400 uppercase tracking-wider">${f.day}</span>
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeClass}">
                            ${changeSign}${f.change_pct.toFixed(2)}%
                        </span>
                    </div>
                    <div class="text-[11px] text-slate-400 font-medium mb-3">${f.display_date}</div>

                    <!-- Predicted High -->
                    <div class="mb-2 bg-emerald-950/30 p-2 rounded-lg border border-emerald-500/20">
                        <div class="text-[10px] text-emerald-400 uppercase font-semibold">Pred. High</div>
                        <div class="text-base font-['JetBrains_Mono'] font-bold text-emerald-400">
                            ₹${f.high.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                        </div>
                    </div>

                    <!-- Predicted Low -->
                    <div class="mb-2 bg-rose-950/30 p-2 rounded-lg border border-rose-500/20">
                        <div class="text-[10px] text-rose-400 uppercase font-semibold">Pred. Low</div>
                        <div class="text-base font-['JetBrains_Mono'] font-bold text-rose-400">
                            ₹${f.low.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                        </div>
                    </div>
                </div>

                <div class="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between font-['JetBrains_Mono']">
                    <span>Close: <b class="text-slate-200">₹${Math.round(f.close).toLocaleString('en-IN')}</b></span>
                    <span>Spread: <b class="text-sky-300">₹${Math.round(f.spread)}</b></span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render detailed table
 */
function renderForecastTable(forecast) {
    const tbody = document.getElementById('forecast-table-body');
    if (!tbody || !forecast) return;

    tbody.innerHTML = forecast.map(f => {
        const isBullish = f.trend_bias.includes('Bullish');
        const badgeClass = isBullish ? 'text-emerald-400' : 'text-rose-400';
        return `
            <tr class="hover:bg-slate-800/40 transition">
                <td class="py-2.5 px-3 font-bold text-sky-400">${f.day}</td>
                <td class="py-2.5 px-3 text-slate-300">${f.display_date}</td>
                <td class="py-2.5 px-3 text-right font-bold text-emerald-400">₹${f.high.toFixed(2)}</td>
                <td class="py-2.5 px-3 text-right font-bold text-rose-400">₹${f.low.toFixed(2)}</td>
                <td class="py-2.5 px-3 text-right text-amber-300">₹${f.close.toFixed(2)}</td>
                <td class="py-2.5 px-3 text-right text-slate-300">₹${f.spread.toFixed(2)}</td>
                <td class="py-2.5 px-3 text-center">
                    <span class="text-xs font-semibold ${badgeClass}">${f.trend_bias}</span>
                </td>
            </tr>
        `;
    }).join('');
}

function updateModelMetrics(metrics) {
    if (!metrics) return;
    if (metrics.high_mape) {
        document.getElementById('stat-high-mape').textContent = `${metrics.high_mape}%`;
    }
    if (metrics.low_mape) {
        document.getElementById('stat-low-mape').textContent = `${metrics.low_mape}%`;
    }
}

/**
 * CSV Export
 */
function downloadForecastCSV() {
    if (!appState.chartData || !appState.chartData.forecast) return;
    
    const headers = ['Day', 'Date', 'Predicted_High', 'Predicted_Low', 'Predicted_Close', 'Predicted_Open', 'Spread', 'Change_%', 'Trend_Bias'];
    const rows = appState.chartData.forecast.map(f => [
        f.day,
        `"${f.display_date}"`,
        f.high,
        f.low,
        f.close,
        f.open,
        f.spread,
        f.change_pct,
        `"${f.trend_bias}"`
    ]);
    
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nifty50_forecast_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Retrain Handler
 */
async function handleRetrain() {
    const statusEl = document.getElementById('retrain-status');
    const confirmRetrain = confirm('Trigger retraining of PyTorch LSTM on historical NIFTY-50 dataset? This runs in background on the server.');
    if (!confirmRetrain) return;

    statusEl.textContent = 'Retraining started...';
    statusEl.className = 'text-[11px] text-amber-400 font-semibold animate-pulse';

    try {
        const res = await fetch('/api/retrain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ epochs: 30, learning_rate: 0.002 })
        });
        const data = await res.json();
        alert(data.message);
    } catch (e) {
        statusEl.textContent = 'Error';
        alert('Failed to trigger retrain: ' + e);
    }
}

