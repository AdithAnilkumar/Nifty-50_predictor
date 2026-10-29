/**
 * NIFTY-50 AI Forecaster Frontend Application
 * Supports 5-Minute Intraday and Daily Unified Charts with Real-Time Timestamps.
 */

let appState = {
    interval: '5m',
    bars: 75, // 75 5-min candles = 1 full trading day of 6.25 hrs (09:15 to 15:30)
    horizon: 6,
    chartType: 'candlestick',
    showSMA: true,
    showChannel: true,
    chartData: null
};

// DOM Elements
const chartLoader = document.getElementById('chart-loader');
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const selectHorizon = document.getElementById('select-horizon');
const btnCandle = document.getElementById('btn-chart-candle');
const btnLine = document.getElementById('btn-chart-line');
const toggleSMA = document.getElementById('toggle-sma');
const toggleChannel = document.getElementById('toggle-channel');
const btnDownloadCSV = document.getElementById('btn-download-csv');
const btnRetrain = document.getElementById('btn-retrain');
const btnInterval5m = document.getElementById('btn-interval-5m');
const btnInterval1d = document.getElementById('btn-interval-1d');
const badgeInterval = document.getElementById('badge-interval');
const timeframeContainer = document.getElementById('timeframe-container');
const labelActiveTimeframe = document.getElementById('label-active-timeframe');
const labelActiveIntervalBox = document.getElementById('label-active-interval-box');
const clockEl = document.getElementById('current-clock');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    renderTimeframeButtons();
    setupEventListeners();
    fetchChartData(false);
});

function updateClock() {
    const now = new Date();
    if (clockEl) {
        clockEl.textContent = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + 
                              ' ' + now.toLocaleTimeString('en-US', { hour12: false }) + ' IST';
    }
}

function renderTimeframeButtons() {
    if (!timeframeContainer) return;
    if (appState.interval === '5m') {
        timeframeContainer.innerHTML = `
            <button class="btn-timeframe px-2.5 py-1 rounded" data-bars="35">3 Hrs</button>
            <button class="btn-timeframe px-2.5 py-1 rounded active bg-emerald-600 text-white font-bold" data-bars="75">1 Day (75c)</button>
            <button class="btn-timeframe px-2.5 py-1 rounded" data-bars="150">2 Days</button>
            <button class="btn-timeframe px-2.5 py-1 rounded" data-bars="300">4 Days</button>
        `;
    } else {
        timeframeContainer.innerHTML = `
            <button class="btn-timeframe px-2.5 py-1 rounded" data-bars="30">1M</button>
            <button class="btn-timeframe px-2.5 py-1 rounded active bg-sky-600 text-white font-bold" data-bars="90">3M</button>
            <button class="btn-timeframe px-2.5 py-1 rounded" data-bars="180">6M</button>
            <button class="btn-timeframe px-2.5 py-1 rounded" data-bars="365">1Y</button>
        `;
    }

    // Attach listeners
    timeframeContainer.querySelectorAll('.btn-timeframe').forEach(btn => {
        btn.addEventListener('click', (e) => {
            timeframeContainer.querySelectorAll('.btn-timeframe').forEach(b => {
                b.classList.remove('active', 'bg-emerald-600', 'bg-sky-600', 'text-white', 'font-bold');
            });
            const activeColor = appState.interval === '5m' ? 'bg-emerald-600' : 'bg-sky-600';
            e.target.classList.add('active', activeColor, 'text-white', 'font-bold');
            appState.bars = parseInt(e.target.dataset.bars);
            fetchChartData(false);
        });
    });
}

function setupEventListeners() {
    // 5m vs 1d Toggle
    btnInterval5m.addEventListener('click', () => {
        if (appState.interval === '5m') return;
        appState.interval = '5m';
        appState.bars = 75;
        btnInterval5m.className = 'px-3 py-1.5 rounded bg-emerald-600 text-white font-bold transition flex items-center gap-1.5';
        btnInterval1d.className = 'px-3 py-1.5 rounded text-slate-400 hover:text-white transition flex items-center gap-1.5';
        badgeInterval.className = 'px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        badgeInterval.textContent = '5-Min Intraday';
        labelActiveTimeframe.textContent = '5-Minute Candles';
        labelActiveTimeframe.className = 'text-emerald-400 font-bold';
        labelActiveIntervalBox.textContent = '5-Minute Candles';
        renderTimeframeButtons();
        fetchChartData(false);
    });

    btnInterval1d.addEventListener('click', () => {
        if (appState.interval === '1d') return;
        appState.interval = '1d';
        appState.bars = 90;
        btnInterval1d.className = 'px-3 py-1.5 rounded bg-sky-600 text-white font-bold transition flex items-center gap-1.5';
        btnInterval5m.className = 'px-3 py-1.5 rounded text-slate-400 hover:text-white transition flex items-center gap-1.5';
        badgeInterval.className = 'px-2 py-0.5 text-xs font-semibold rounded bg-sky-500/20 text-sky-400 border border-sky-500/30';
        badgeInterval.textContent = 'Daily (1D)';
        labelActiveTimeframe.textContent = 'Daily Candles (1D)';
        labelActiveTimeframe.className = 'text-sky-400 font-bold';
        labelActiveIntervalBox.textContent = 'Daily Candles';
        renderTimeframeButtons();
        fetchChartData(false);
    });

    // Refresh button
    btnRefresh.addEventListener('click', () => {
        refreshIcon.classList.add('animate-spin');
        fetchChartData(true).finally(() => {
            setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);
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
        const url = `/api/chart-data?interval=${appState.interval}&bars=${appState.bars}&horizon=${appState.horizon}&force_refresh=${forceRefresh}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        appState.chartData = data;
        
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
    document.getElementById('kpi-rsi').textContent = summary.current_rsi ? summary.current_rsi.toFixed(1) : '--';
}

/**
 * RENDER THE UNIFIED CHART: Current + Predicted in the EXACT Same Graph
 */
function renderUnifiedChart() {
    if (!appState.chartData) return;
    
    const { historical, forecast, transition_date, transition_price, interval } = appState.chartData;
    const traces = [];

    // 1. HISTORICAL COMPONENT
    const histDates = historical.map(d => d.date);
    const histOpens = historical.map(d => d.open);
    const histHighs = historical.map(d => d.high);
    const histLows = historical.map(d => d.low);
    const histCloses = historical.map(d => d.close);

    if (appState.chartType === 'candlestick') {
        traces.push({
            type: 'candlestick',
            name: `Historical ${interval === '5m' ? '5-Min' : 'Daily'} Candles`,
            x: histDates,
            open: histOpens,
            high: histHighs,
            low: histLows,
            close: histCloses,
            increasing: { line: { color: '#22c55e', width: 1.5 }, fillcolor: '#22c55e' },
            decreasing: { line: { color: '#ef4444', width: 1.5 }, fillcolor: '#ef4444' },
            hoverlabel: { bgcolor: '#1e293b' }
        });
    } else {
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Historical Close',
            x: histDates,
            y: histCloses,
            line: { color: '#38bdf8', width: 2.2 }
        });
    }

    // 2. TECHNICAL OVERLAYS
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

    // 3. PREDICTED COMPONENT (Continuous on the EXACT SAME TIME AXIS)
    const lastHist = historical[historical.length - 1];
    const bridgeDates = [lastHist.date, ...forecast.map(f => f.date)];
    const bridgeHighs = [lastHist.high, ...forecast.map(f => f.high)];
    const bridgeLows = [lastHist.low, ...forecast.map(f => f.low)];
    const bridgeCloses = [lastHist.close, ...forecast.map(f => f.close)];

    // Shaded Forecast Channel
    if (appState.showChannel) {
        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Predicted High Channel',
            x: bridgeDates,
            y: bridgeHighs,
            line: { color: '#4ade80', width: 2.5, dash: 'dash' },
            hoverinfo: 'x+y'
        });

        traces.push({
            type: 'scatter',
            mode: 'lines',
            name: 'Predicted Low Channel',
            x: bridgeDates,
            y: bridgeLows,
            fill: 'tonexty',
            fillcolor: 'rgba(56, 189, 248, 0.15)',
            line: { color: '#38bdf8', width: 2.5, dash: 'dash' },
            hoverinfo: 'x+y'
        });
    }

    // Predicted Candlesticks
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
            hoverlabel: { bgcolor: '#1e293b' }
        });
    }

    // Predicted Close Line
    traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Predicted Close Path',
        x: bridgeDates,
        y: bridgeCloses,
        line: { color: '#fbbf24', width: 2, dash: 'dot' },
        marker: { size: 6, color: '#fbbf24' }
    });

    // 4. VERTICAL DEMARCATION LINE
    const demarcationText = interval === '5m' 
        ? `⚡ LATEST: ${transition_date.split(' ')[1]} IST | NEXT 5-MIN CANDLES ➔` 
        : `⚡ TODAY: ${transition_date} | FUTURE FORECAST ➔`;

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
            text: demarcationText,
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
        const badgeClass = isBullish ? 'badge-bullish' : (f.trend_bias.includes('Bearish') ? 'badge-bearish' : 'badge-neutral');
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
                    <div class="text-[11px] text-slate-300 font-mono font-semibold mb-3">${f.display_date}</div>

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
                    <span>Spread: <b class="text-sky-300">₹${f.spread.toFixed(1)}</b></span>
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
                <td class="py-2.5 px-3 text-slate-200 font-semibold">${f.display_date}</td>
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
    if (metrics.high_mape !== undefined) {
        document.getElementById('stat-high-mape').textContent = `${metrics.high_mape}%`;
    }
    if (metrics.low_mape !== undefined) {
        document.getElementById('stat-low-mape').textContent = `${metrics.low_mape}%`;
    }
}

function downloadForecastCSV() {
    if (!appState.chartData || !appState.chartData.forecast) return;
    
    const headers = ['Interval', 'DateTime', 'Predicted_High', 'Predicted_Low', 'Predicted_Close', 'Predicted_Open', 'Spread', 'Change_%', 'Trend_Bias'];
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
    link.setAttribute('download', `nifty50_${appState.interval}_forecast.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function handleRetrain() {
    const statusEl = document.getElementById('retrain-status');
    const confirmRetrain = confirm(`Trigger retraining of active ${appState.interval} PyTorch LSTM model?`);
    if (!confirmRetrain) return;

    statusEl.textContent = 'Retraining in progress...';
    statusEl.className = 'text-[11px] text-amber-400 font-semibold animate-pulse';

    try {
        const res = await fetch('/api/retrain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interval: appState.interval, epochs: 25, learning_rate: 0.003 })
        });
        const data = await res.json();
        alert(data.message);
    } catch (e) {
        statusEl.textContent = 'Error';
        alert('Failed: ' + e);
    }
}
