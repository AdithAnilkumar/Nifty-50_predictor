/**
 * NIFTY-50 Neural Time Series Forecaster
 * Custom Organic Editorial Aesthetics: Sage Green (#87A96B), Walnut Brown (#5A3E2B), Amber Glow (#D5851F)
 */

// Application State
const state = {
    interval: '5m',
    bars: 150,
    horizon: 6,
    chartData: null,
    overlays: {
        sma: true,
        envelope: true
    }
};

// Chart & Series References
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let smaSeries = null;
let forecastCandleSeries = null;
let forecastHighLine = null;
let forecastLowLine = null;
let forecastCloseLine = null;

// DOM Elements
const chartContainer = document.getElementById('chart-container');
const chartLoader = document.getElementById('chart-loader');
const headerPrice = document.getElementById('header-price');
const headerChange = document.getElementById('header-change');
const ohlcOpen = document.getElementById('ohlc-open');
const ohlcHigh = document.getElementById('ohlc-high');
const ohlcLow = document.getElementById('ohlc-low');
const ohlcClose = document.getElementById('ohlc-close');
const clockDisplay = document.getElementById('clock-display');
const btnInterval5m = document.getElementById('btn-interval-5m');
const btnInterval1d = document.getElementById('btn-interval-1d');
const chartIntervalBadge = document.getElementById('chart-interval-badge');
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const btnExportCSV = document.getElementById('btn-export-csv');
const chkSma = document.getElementById('chk-sma');
const chkForecastEnvelope = document.getElementById('chk-forecast-envelope');
const forecastCardsContainer = document.getElementById('forecast-cards-container');

// Stat Elements
const statMaxHigh = document.getElementById('stat-max-high');
const statMinLow = document.getElementById('stat-min-low');
const statAvgSpread = document.getElementById('stat-avg-spread');
const statNetBias = document.getElementById('stat-net-bias');
const statMape = document.getElementById('stat-mape');
const statR2 = document.getElementById('stat-r2');

// Number Formatter
const numFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPrice = (val) => val != null ? '₹' + numFmt.format(val) : '--';
const formatRawPrice = (val) => val != null ? numFmt.format(val) : '--';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    startClock();
    initChartEngine();
    setupEventListeners();
    fetchForecastData(false);
});

// Live IST Clock
function startClock() {
    function tick() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
        if (clockDisplay) {
            clockDisplay.textContent = `${dateStr} • ${timeStr} IST`;
        }
    }
    tick();
    setInterval(tick, 1000);
}

// Initialize Custom Canvas with Organic Editorial Theme
function initChartEngine() {
    if (!chartContainer) return;
    chartContainer.innerHTML = '';

    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight,
        layout: {
            background: { type: 'solid', color: '#FAF7F2' }, // Warm Sand
            textColor: '#5A3E2B', // Walnut Brown
            fontFamily: '"Plus Jakarta Sans", -apple-system, sans-serif',
            fontSize: 11
        },
        grid: {
            vertLines: { color: '#EFE8DD' },
            horzLines: { color: '#EFE8DD' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#8A6A50',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#5A3E2B'
            },
            horzLine: {
                color: '#8A6A50',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#5A3E2B'
            }
        },
        rightPriceScale: {
            borderColor: '#E6DFD5',
            visible: true,
            autoScale: true,
            scaleMargins: {
                top: 0.08,
                bottom: 0.18
            }
        },
        timeScale: {
            borderColor: '#E6DFD5',
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

    // Volume Series (Lower 15% overlay)
    volumeSeries = chart.addHistogramSeries({
        color: '#87A96B',
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
        scaleMargins: { top: 0.85, bottom: 0 }
    });
    chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 }
    });

    // Historical Candlestick Series: Sage Green Up (#87A96B), Warm Terracotta Down (#C0583A)
    candleSeries = chart.addCandlestickSeries({
        upColor: '#87A96B',
        downColor: '#C0583A',
        borderUpColor: '#759759',
        borderDownColor: '#A8492E',
        wickUpColor: '#87A96B',
        wickDownColor: '#C0583A'
    });

    // SMA 20 Overlay (Walnut Brown #5A3E2B)
    smaSeries = chart.addLineSeries({
        color: '#5A3E2B',
        lineWidth: 1.5,
        title: 'SMA 20',
        crosshairMarkerVisible: false
    });

    // AI Forecast Predicted Candles (Amber Glow #D5851F)
    forecastCandleSeries = chart.addCandlestickSeries({
        upColor: '#D5851F',
        downColor: '#8A6A50',
        borderUpColor: '#B86F15',
        borderDownColor: '#5A3E2B',
        wickUpColor: '#D5851F',
        wickDownColor: '#8A6A50',
        priceLineVisible: false
    });

    // AI Forecast Upper High Envelope (Sage Green #87A96B)
    forecastHighLine = chart.addLineSeries({
        color: '#87A96B',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'High Bound'
    });

    // AI Forecast Lower Low Envelope (Terracotta #C0583A)
    forecastLowLine = chart.addLineSeries({
        color: '#C0583A',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Low Bound'
    });

    // AI Forecast Expected Path (Amber Glow #D5851F)
    forecastCloseLine = chart.addLineSeries({
        color: '#D5851F',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        title: 'Expected Close'
    });

    // Crosshair Sync
    chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesPrices) {
            restoreLatestOHLC();
            return;
        }
        const candle = param.seriesPrices.get(candleSeries) || param.seriesPrices.get(forecastCandleSeries);
        if (candle) {
            updateOHLCHeader(candle.open, candle.high, candle.low, candle.close);
        }
    });

    // Resize Observer
    const ro = new ResizeObserver(entries => {
        if (!entries || !entries.length || !chart) return;
        chart.applyOptions({
            width: entries[0].contentRect.width,
            height: entries[0].contentRect.height
        });
    });
    ro.observe(chartContainer);
}

// Fetch Forecast & Chart Data from Server
async function fetchForecastData(forceRefresh = false) {
    if (chartLoader) chartLoader.classList.remove('opacity-0', 'pointer-events-none');
    if (refreshIcon) refreshIcon.classList.add('animate-spin');

    try {
        const url = `/api/chart-data?interval=${state.interval}&bars=${state.bars}&horizon=${state.horizon}&force_refresh=${forceRefresh}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

        const data = await res.json();
        state.chartData = data;

        // Render visual components
        populateChart(data);
        populateForecastCards(data.forecast_candles);
        populateMetricsAndStats(data);

    } catch (err) {
        console.error("Failed to load forecast data:", err);
    } finally {
        if (chartLoader) chartLoader.classList.add('opacity-0', 'pointer-events-none');
        if (refreshIcon) refreshIcon.classList.remove('animate-spin');
    }
}

// Populate Chart Series
function populateChart(data) {
    if (!chart || !data) return;

    // 1. Candlesticks
    if (candleSeries && data.candles) {
        candleSeries.setData(data.candles);
    }

    // 2. Volume
    if (volumeSeries && data.volume_bars) {
        // Adjust volume colors to Sage/Terracotta
        const customVolBars = data.volume_bars.map(v => ({
            time: v.time,
            value: v.value,
            color: v.color.includes('089981') ? 'rgba(135, 169, 107, 0.45)' : 'rgba(192, 88, 58, 0.4)'
        }));
        volumeSeries.setData(customVolBars);
    }

    // 3. SMA 20
    if (smaSeries) {
        if (state.overlays.sma && data.sma_points && data.sma_points.length > 0) {
            smaSeries.setData(data.sma_points);
            smaSeries.applyOptions({ visible: true });
        } else {
            smaSeries.applyOptions({ visible: false });
        }
    }

    // 4. Forecast Candles
    if (forecastCandleSeries && data.forecast_candles) {
        forecastCandleSeries.setData(data.forecast_candles);
    }

    // 5. Forecast Boundaries
    if (forecastHighLine && forecastLowLine && forecastCloseLine) {
        if (state.overlays.envelope) {
            forecastHighLine.setData(data.forecast_high_line || []);
            forecastLowLine.setData(data.forecast_low_line || []);
            forecastCloseLine.setData(data.forecast_close_line || []);
            forecastHighLine.applyOptions({ visible: true });
            forecastLowLine.applyOptions({ visible: true });
            forecastCloseLine.applyOptions({ visible: true });
        } else {
            forecastHighLine.applyOptions({ visible: false });
            forecastLowLine.applyOptions({ visible: false });
            forecastCloseLine.applyOptions({ visible: false });
        }
    }

    // 6. Transition Marker
    if (candleSeries && data.transition_time) {
        candleSeries.setMarkers([
            {
                time: data.transition_time,
                position: 'aboveBar',
                color: '#D5851F',
                shape: 'arrowDown',
                text: 'AI Projection ➔'
            }
        ]);
    }

    restoreLatestOHLC();
    chart.timeScale().scrollToPosition(3, false);
}

// Update Header OHLC
function updateOHLCHeader(o, h, l, c) {
    if (ohlcOpen) ohlcOpen.textContent = formatRawPrice(o);
    if (ohlcHigh) ohlcHigh.textContent = formatRawPrice(h);
    if (ohlcLow) ohlcLow.textContent = formatRawPrice(l);
    if (ohlcClose) ohlcClose.textContent = formatRawPrice(c);
}

function restoreLatestOHLC() {
    if (!state.chartData || !state.chartData.candles || !state.chartData.candles.length) return;
    const last = state.chartData.candles[state.chartData.candles.length - 1];
    updateOHLCHeader(last.open, last.high, last.low, last.close);
    
    // Header Price Banner
    if (headerPrice) headerPrice.textContent = formatPrice(last.close);
    if (headerChange && state.chartData.market_summary) {
        const sum = state.chartData.market_summary;
        const sign = sum.change_pts >= 0 ? '+' : '';
        headerChange.textContent = `${sign}₹${numFmt.format(sum.change_pts)} (${sign}${sum.change_pct.toFixed(2)}%)`;
        headerChange.className = sum.change_pts >= 0 ? 
            'font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-sage-100 text-sage-800' : 
            'font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-red-50 text-terracotta';
    }
}

// Populate the 6 Editorial Prediction Cards
function populateForecastCards(forecasts) {
    if (!forecastCardsContainer || !forecasts) return;

    let html = '';
    forecasts.forEach((f, idx) => {
        const isUp = f.change_pct >= 0;
        const biasBadgeClass = isUp ? 'badge-bullish' : 'badge-bearish';
        const biasIcon = isUp ? '▲' : '▼';

        html += `
            <div class="prediction-card">
                <div>
                    <!-- Header -->
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-serif font-bold text-walnut-900 text-base">
                            ${f.day || `Step +${idx+1}`}
                        </span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${biasBadgeClass}">
                            ${biasIcon} ${f.trend_bias ? f.trend_bias.replace(/\([^)]*\)/, '').trim() : (isUp ? 'Bullish' : 'Bearish')}
                        </span>
                    </div>
                    <div class="text-[10px] text-walnut-400 font-mono mb-2">${f.display_date}</div>

                    <!-- Values Box -->
                    <div class="bg-sand/80 rounded-xl p-2.5 border border-sandBorder space-y-1.5">
                        <div class="flex items-baseline justify-between">
                            <span class="text-[10px] uppercase font-bold text-walnut-400">Pred High</span>
                            <span class="font-mono font-bold text-sage-600 text-xs">₹${numFmt.format(f.high)}</span>
                        </div>
                        <div class="flex items-baseline justify-between">
                            <span class="text-[10px] uppercase font-bold text-walnut-400">Pred Low</span>
                            <span class="font-mono font-bold text-terracotta text-xs">₹${numFmt.format(f.low)}</span>
                        </div>
                    </div>
                </div>

                <!-- Footer Spread & Target -->
                <div class="mt-2.5 pt-2 border-t border-sandBorder/70 flex items-center justify-between text-[11px]">
                    <span class="text-walnut-400">Close: <b class="font-mono text-walnut-800 font-semibold">₹${numFmt.format(f.close)}</b></span>
                    <span class="font-mono text-[10px] text-amberGlow-600 font-bold">Δ ₹${numFmt.format(f.spread)}</span>
                </div>
            </div>
        `;
    });

    forecastCardsContainer.innerHTML = html;
}

// Populate Diagnostic & Summary Stats
function populateMetricsAndStats(data) {
    if (!data) return;

    if (data.forecast_candles && data.forecast_candles.length) {
        const highs = data.forecast_candles.map(c => c.high);
        const lows = data.forecast_candles.map(c => c.low);
        const spreads = data.forecast_candles.map(c => c.spread);

        if (statMaxHigh) statMaxHigh.textContent = '₹' + numFmt.format(Math.max(...highs));
        if (statMinLow) statMinLow.textContent = '₹' + numFmt.format(Math.min(...lows));
        if (statAvgSpread) {
            const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
            statAvgSpread.textContent = '₹' + numFmt.format(avg);
        }

        const firstClose = data.candles[data.candles.length - 1].close;
        const lastPredClose = data.forecast_candles[data.forecast_candles.length - 1].close;
        const diff = lastPredClose - firstClose;
        if (statNetBias) {
            statNetBias.textContent = diff >= 0 ? `Bullish Expansion (+${numFmt.format(diff)} pts)` : `Bearish Contraction (${numFmt.format(diff)} pts)`;
            statNetBias.className = diff >= 0 ? 'font-semibold text-sage-600' : 'font-semibold text-terracotta';
        }
    }

    if (data.metrics) {
        if (statMape && data.metrics.high_mape != null) {
            statMape.textContent = `${data.metrics.high_mape.toFixed(2)}%`;
        }
        if (statR2 && data.metrics.close_r2 != null) {
            statR2.textContent = data.metrics.close_r2.toFixed(4);
        }
    }
}

// Event Listeners
function setupEventListeners() {
    // Interval Switchers
    if (btnInterval5m && btnInterval1d) {
        btnInterval5m.addEventListener('click', () => {
            if (state.interval === '5m') return;
            state.interval = '5m';
            state.bars = 150;
            btnInterval5m.className = 'px-3 py-1.5 rounded-lg bg-walnut-600 text-white shadow-xs transition-all font-medium flex items-center gap-1.5';
            btnInterval1d.className = 'px-3 py-1.5 rounded-lg text-walnut-600 hover:text-walnut-900 transition-all font-medium';
            if (chartIntervalBadge) chartIntervalBadge.textContent = '5-Minute Candles';
            fetchForecastData(false);
        });

        btnInterval1d.addEventListener('click', () => {
            if (state.interval === '1d') return;
            state.interval = '1d';
            state.bars = 120;
            btnInterval1d.className = 'px-3 py-1.5 rounded-lg bg-walnut-600 text-white shadow-xs transition-all font-medium flex items-center gap-1.5';
            btnInterval5m.className = 'px-3 py-1.5 rounded-lg text-walnut-600 hover:text-walnut-900 transition-all font-medium';
            if (chartIntervalBadge) chartIntervalBadge.textContent = 'Daily Candles';
            fetchForecastData(false);
        });
    }

    // Refresh Button
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => fetchForecastData(true));
    }

    // Overlays
    if (chkSma) {
        chkSma.addEventListener('change', (e) => {
            state.overlays.sma = e.target.checked;
            if (smaSeries) smaSeries.applyOptions({ visible: state.overlays.sma });
        });
    }

    if (chkForecastEnvelope) {
        chkForecastEnvelope.addEventListener('change', (e) => {
            state.overlays.envelope = e.target.checked;
            if (forecastHighLine && forecastLowLine && forecastCloseLine) {
                forecastHighLine.applyOptions({ visible: state.overlays.envelope });
                forecastLowLine.applyOptions({ visible: state.overlays.envelope });
                forecastCloseLine.applyOptions({ visible: state.overlays.envelope });
            }
        });
    }

    // Timeframe range buttons
    document.querySelectorAll('.btn-range').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn-range').forEach(b => {
                b.classList.remove('active', 'bg-sandMuted', 'text-walnut-900', 'font-bold');
            });
            e.target.classList.add('active', 'bg-sandMuted', 'text-walnut-900', 'font-bold');
            state.bars = parseInt(e.target.dataset.bars, 10);
            fetchForecastData(false);
        });
    });

    // Export CSV
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            if (!state.chartData || !state.chartData.forecast_candles) return;
            let csv = "Step,DisplayDate,Predicted_High,Predicted_Low,Predicted_Close,Spread,TrendBias\n";
            state.chartData.forecast_candles.forEach(f => {
                csv += `"${f.day}","${f.display_date}",${f.high},${f.low},${f.close},${f.spread},"${f.trend_bias || ''}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nifty50_${state.interval}_neural_forecast.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}
