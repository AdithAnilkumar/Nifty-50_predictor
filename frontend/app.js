/**
 * NIFTY-50 Minimalist Clean Forecaster
 * Clean Architecture, Lightweight Charts v4.2.0, Real-Time Live Streaming (2s)
 */

// Application State
const state = {
    interval: '5m',
    bars: 150,
    horizon: 6,
    chartData: null,
    isLive: true,
    overlays: {
        sma: true,
        envelope: true
    }
};

// Chart & Series Handles
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let smaSeries = null;
let forecastCandleSeries = null;
let forecastHighLine = null;
let forecastLowLine = null;
let forecastCloseLine = null;
let liveTimer = null;

// DOM Elements
const chartMount = document.getElementById('chart-mount');
const chartLoader = document.getElementById('chart-loader');
const livePrice = document.getElementById('live-price');
const liveChange = document.getElementById('live-change');
const liveTime = document.getElementById('live-time');
const chartTitle = document.getElementById('chart-title');

// Header OHLC
const barOpen = document.getElementById('bar-open');
const barHigh = document.getElementById('bar-high');
const barLow = document.getElementById('bar-low');
const barClose = document.getElementById('bar-close');

// Controls
const btnInterval5m = document.getElementById('btn-interval-5m');
const btnInterval1d = document.getElementById('btn-interval-1d');
const btnExportCSV = document.getElementById('btn-export-csv');
const chkSma = document.getElementById('chk-sma');
const chkEnvelope = document.getElementById('chk-envelope');
const forecastCards = document.getElementById('forecast-cards');

// Statistics
const statHigh = document.getElementById('stat-high');
const statLow = document.getElementById('stat-low');
const statSpread = document.getElementById('stat-spread');

// Formatting
const numFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPrice = (v) => v != null ? '₹' + numFmt.format(v) : '--';
const formatRaw = (v) => v != null ? numFmt.format(v) : '--';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initChartEngine();
    setupEventHandlers();
    loadHistoricalData().then(() => {
        startLivePolling();
    });
});

// Initialize Clean Minimalist Canvas
function initChartEngine() {
    if (!chartMount) return;
    chartMount.innerHTML = '';

    chart = LightweightCharts.createChart(chartMount, {
        width: chartMount.clientWidth,
        height: chartMount.clientHeight,
        layout: {
            background: { type: 'solid', color: '#FFFFFF' },
            textColor: '#64748B',
            fontFamily: '"Inter", -apple-system, sans-serif',
            fontSize: 11
        },
        grid: {
            vertLines: { color: '#F1F5F9' },
            horzLines: { color: '#F1F5F9' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#94A3B8',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#0F172A'
            },
            horzLine: {
                color: '#94A3B8',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#0F172A'
            }
        },
        rightPriceScale: {
            borderColor: '#E2E8F0',
            visible: true,
            autoScale: true,
            scaleMargins: { top: 0.08, bottom: 0.16 }
        },
        timeScale: {
            borderColor: '#E2E8F0',
            timeVisible: true,
            secondsVisible: false,
            fixLeftEdge: true,
            fixRightEdge: false
        },
        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true
        },
        handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true
        }
    });

    // Volume Overlay (Bottom 15%)
    volumeSeries = chart.addHistogramSeries({
        color: '#10B981',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: { top: 0.85, bottom: 0 }
    });
    chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 }
    });

    // Candlesticks: Emerald (#10B981) Up, Rose (#F43F5E) Down
    candleSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#F43F5E',
        borderUpColor: '#10B981',
        borderDownColor: '#F43F5E',
        wickUpColor: '#10B981',
        wickDownColor: '#F43F5E'
    });

    // SMA 20 Overlay (Slate Gray)
    smaSeries = chart.addLineSeries({
        color: '#64748B',
        lineWidth: 1.5,
        title: 'SMA 20',
        crosshairMarkerVisible: false
    });

    // AI Forecast Predicted Candles (Modern Blue #2563EB)
    forecastCandleSeries = chart.addCandlestickSeries({
        upColor: '#2563EB',
        downColor: '#6366F1',
        borderUpColor: '#1D4ED8',
        borderDownColor: '#4338CA',
        wickUpColor: '#2563EB',
        wickDownColor: '#6366F1',
        priceLineVisible: false
    });

    // Forecast Upper Boundary (Emerald)
    forecastHighLine = chart.addLineSeries({
        color: '#10B981',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'High Bound'
    });

    // Forecast Lower Boundary (Rose)
    forecastLowLine = chart.addLineSeries({
        color: '#F43F5E',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Low Bound'
    });

    // Forecast Close Path (Blue)
    forecastCloseLine = chart.addLineSeries({
        color: '#2563EB',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        title: 'Expected Close'
    });

    // Crosshair Sync
    chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesPrices) {
            restoreCurrentCandleHeader();
            return;
        }
        const candle = param.seriesPrices.get(candleSeries) || param.seriesPrices.get(forecastCandleSeries);
        if (candle) {
            updateOHLCHeader(candle.open, candle.high, candle.low, candle.close);
        }
    });

    // Window Resize Observer
    const ro = new ResizeObserver(entries => {
        if (!entries || !entries.length || !chart) return;
        chart.applyOptions({
            width: entries[0].contentRect.width,
            height: entries[0].contentRect.height
        });
    });
    ro.observe(chartMount);
}

// Initial Data Load
async function loadHistoricalData() {
    if (chartLoader) chartLoader.classList.remove('opacity-0', 'pointer-events-none');
    try {
        const url = `/api/chart-data?interval=${state.interval}&bars=${state.bars}&horizon=${state.horizon}&force_refresh=false`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        state.chartData = data;

        candleSeries.setData(data.candles);

        const customVolBars = data.volume_bars.map(v => ({
            time: v.time,
            value: v.value,
            color: v.color.includes('089981') ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'
        }));
        volumeSeries.setData(customVolBars);

        if (state.overlays.sma && data.sma_points) {
            smaSeries.setData(data.sma_points);
            smaSeries.applyOptions({ visible: true });
        }

        if (data.forecast_candles) {
            forecastCandleSeries.setData(data.forecast_candles);
            forecastHighLine.setData(data.forecast_high_line || []);
            forecastLowLine.setData(data.forecast_low_line || []);
            forecastCloseLine.setData(data.forecast_close_line || []);
        }

        if (data.transition_time) {
            candleSeries.setMarkers([
                {
                    time: data.transition_time,
                    position: 'aboveBar',
                    color: '#2563EB',
                    shape: 'arrowDown',
                    text: 'Forecast ➔'
                }
            ]);
        }

        renderForecastCards(data.forecast_candles);
        updateStatistics(data.forecast_candles);
        restoreCurrentCandleHeader();

        chart.timeScale().scrollToPosition(3, false);

    } catch (err) {
        console.error("Failed to load chart data:", err);
    } finally {
        if (chartLoader) chartLoader.classList.add('opacity-0', 'pointer-events-none');
    }
}

// Real-Time Live Polling Engine (Every 2 seconds)
function startLivePolling() {
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(async () => {
        if (!state.isLive) return;
        await streamTick();
    }, 2000);
}

// Fetch & Apply Single Live Tick
async function streamTick() {
    try {
        const res = await fetch(`/api/live-tick?interval=${state.interval}`);
        if (!res.ok) return;
        const tick = await res.json();

        // 1. Live Candle Canvas Update
        if (candleSeries && tick.candle) {
            candleSeries.update(tick.candle);
        }

        // 2. Live Volume Update
        if (volumeSeries && tick.volume) {
            volumeSeries.update(tick.volume);
        }

        // 3. Dynamic Forecast Line & Candle Updates
        if (tick.forecast_candles && forecastCandleSeries) {
            forecastCandleSeries.setData(tick.forecast_candles);
            if (forecastHighLine) forecastHighLine.setData(tick.forecast_high_line || []);
            if (forecastLowLine) forecastLowLine.setData(tick.forecast_low_line || []);
            if (forecastCloseLine) forecastCloseLine.setData(tick.forecast_close_line || []);
            
            updateForecastCardsLive(tick.forecast_candles);
            updateStatistics(tick.forecast_candles);
        }

        // 4. Update Header Live Price
        if (livePrice) {
            livePrice.textContent = formatPrice(tick.tick_price);
            livePrice.classList.remove('tick-up', 'tick-down');
            void livePrice.offsetWidth;
            livePrice.classList.add(tick.is_uptick ? 'tick-up' : 'tick-down');
        }

        if (liveChange) {
            const sign = tick.change_pts >= 0 ? '+' : '';
            liveChange.textContent = `${sign}₹${formatRaw(tick.change_pts)} (${sign}${tick.change_pct.toFixed(2)}%)`;
            liveChange.className = tick.change_pts >= 0 ?
                'text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700' :
                'text-xs font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700';
        }

        if (liveTime && tick.timestamp) {
            liveTime.textContent = tick.timestamp;
        }

        if (tick.candle) {
            updateOHLCHeader(tick.candle.open, tick.candle.high, tick.candle.low, tick.candle.close);
        }

    } catch (e) {
        console.warn("Live stream error:", e);
    }
}

// Update Header OHLC
function updateOHLCHeader(o, h, l, c) {
    if (barOpen) barOpen.textContent = formatRaw(o);
    if (barHigh) barHigh.textContent = formatRaw(h);
    if (barLow) barLow.textContent = formatRaw(l);
    if (barClose) barClose.textContent = formatRaw(c);
}

function restoreCurrentCandleHeader() {
    if (!state.chartData || !state.chartData.candles || !state.chartData.candles.length) return;
    const last = state.chartData.candles[state.chartData.candles.length - 1];
    updateOHLCHeader(last.open, last.high, last.low, last.close);
    if (livePrice) livePrice.textContent = formatPrice(last.close);
}

// Render Initial Minimalist Cards
function renderForecastCards(forecasts) {
    if (!forecastCards || !forecasts) return;
    let html = '';

    forecasts.forEach((f, idx) => {
        const isUp = f.change_pct >= 0;
        const badgeClass = isUp ? 'badge-up' : 'badge-down';
        const sign = isUp ? '+' : '';

        html += `
            <div class="min-card" id="card-${idx}">
                <div class="space-y-1.5">
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-semibold text-gray-900">${f.day || `Step +${idx+1}`}</span>
                        <span class="text-[10px] font-medium px-1.5 py-0.5 rounded ${badgeClass}">
                            ${sign}${f.change_pct.toFixed(2)}%
                        </span>
                    </div>
                    <div class="text-[10px] text-gray-400 font-mono">${f.display_date}</div>

                    <div class="space-y-1 pt-1 font-mono text-xs">
                        <div class="flex justify-between items-baseline">
                            <span class="text-gray-400 text-[10px]">High</span>
                            <span class="font-semibold text-emerald-600 card-high">₹${formatRaw(f.high)}</span>
                        </div>
                        <div class="flex justify-between items-baseline">
                            <span class="text-gray-400 text-[10px]">Low</span>
                            <span class="font-semibold text-rose-600 card-low">₹${formatRaw(f.low)}</span>
                        </div>
                    </div>
                </div>

                <div class="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] font-mono">
                    <span class="text-gray-400">Close</span>
                    <span class="font-medium text-gray-900 card-close">₹${formatRaw(f.close)}</span>
                </div>
            </div>
        `;
    });

    forecastCards.innerHTML = html;
}

// Live In-Place Update of Forecast Cards
function updateForecastCardsLive(forecasts) {
    if (!forecastCards || !forecasts) return;

    forecasts.forEach((f, idx) => {
        const card = document.getElementById(`card-${idx}`);
        if (!card) return;

        const elHigh = card.querySelector('.card-high');
        const elLow = card.querySelector('.card-low');
        const elClose = card.querySelector('.card-close');

        if (elHigh) elHigh.textContent = `₹${formatRaw(f.high)}`;
        if (elLow) elLow.textContent = `₹${formatRaw(f.low)}`;
        if (elClose) elClose.textContent = `₹${formatRaw(f.close)}`;
    });
}

// Update Statistics
function updateStatistics(forecasts) {
    if (!forecasts || !forecasts.length) return;
    const highs = forecasts.map(c => c.high);
    const lows = forecasts.map(c => c.low);
    const spreads = forecasts.map(c => c.spread);

    if (statHigh) statHigh.textContent = '₹' + formatRaw(Math.max(...highs));
    if (statLow) statLow.textContent = '₹' + formatRaw(Math.min(...lows));
    if (statSpread) {
        const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
        statSpread.textContent = '₹' + formatRaw(avg);
    }
}

// Event Handlers
function setupEventHandlers() {
    // Interval Switchers
    if (btnInterval5m && btnInterval1d) {
        btnInterval5m.addEventListener('click', () => {
            if (state.interval === '5m') return;
            state.interval = '5m';
            state.bars = 150;
            btnInterval5m.className = 'px-2.5 py-1 rounded-md bg-white text-gray-900 shadow-xs font-semibold';
            btnInterval1d.className = 'px-2.5 py-1 rounded-md text-gray-500 hover:text-gray-900 transition';
            if (chartTitle) chartTitle.textContent = 'NIFTY 50 • 5m';
            loadHistoricalData();
        });

        btnInterval1d.addEventListener('click', () => {
            if (state.interval === '1d') return;
            state.interval = '1d';
            state.bars = 120;
            btnInterval1d.className = 'px-2.5 py-1 rounded-md bg-white text-gray-900 shadow-xs font-semibold';
            btnInterval5m.className = 'px-2.5 py-1 rounded-md text-gray-500 hover:text-gray-900 transition';
            if (chartTitle) chartTitle.textContent = 'NIFTY 50 • Daily';
            loadHistoricalData();
        });
    }

    // Overlays
    if (chkSma) {
        chkSma.addEventListener('change', (e) => {
            state.overlays.sma = e.target.checked;
            if (smaSeries) smaSeries.applyOptions({ visible: state.overlays.sma });
        });
    }

    if (chkEnvelope) {
        chkEnvelope.addEventListener('change', (e) => {
            state.overlays.envelope = e.target.checked;
            if (forecastHighLine && forecastLowLine && forecastCloseLine) {
                forecastHighLine.applyOptions({ visible: state.overlays.envelope });
                forecastLowLine.applyOptions({ visible: state.overlays.envelope });
                forecastCloseLine.applyOptions({ visible: state.overlays.envelope });
            }
        });
    }

    // Range buttons
    document.querySelectorAll('.btn-range').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn-range').forEach(b => {
                b.className = 'btn-range px-2 py-0.5 rounded text-gray-500 hover:text-gray-900';
            });
            e.target.className = 'btn-range px-2 py-0.5 rounded bg-gray-100 text-gray-900 font-semibold active';
            state.bars = parseInt(e.target.dataset.bars, 10);
            loadHistoricalData();
        });
    });

    // Export CSV
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            if (!state.chartData || !state.chartData.forecast_candles) return;
            let csv = "Step,DisplayDate,Predicted_High,Predicted_Low,Predicted_Close,Spread\n";
            state.chartData.forecast_candles.forEach(f => {
                csv += `"${f.day}","${f.display_date}",${f.high},${f.low},${f.close},${f.spread}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nifty50_forecast_${state.interval}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}
