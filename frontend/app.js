/**
 * NIFTY-50 Curated Organic Neural Forecaster
 * Sage Green (#87A96B), Walnut Brown (#5A3E2B), Amber Glow (#D5851F)
 * Featuring Real-Time Live Streaming Ticks & Dynamic Projections
 */

// Application State
const state = {
    interval: '5m',
    bars: 150,
    horizon: 6,
    chartData: null,
    isLiveStreaming: true,
    tickCount: 0,
    lastPrice: null,
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
let liveIntervalId = null;

// DOM Elements
const chartMount = document.getElementById('chart-mount');
const chartLoader = document.getElementById('chart-loader');
const livePriceDisplay = document.getElementById('live-price-display');
const liveChangeDisplay = document.getElementById('live-change-display');
const liveTickClock = document.getElementById('live-tick-clock');
const liveBadge = document.getElementById('live-badge');
const liveBadgeText = document.getElementById('live-badge-text');
const btnToggleLive = document.getElementById('btn-toggle-live');
const liveToggleText = document.getElementById('live-toggle-text');
const liveIcon = document.getElementById('live-icon');
const tickCounter = document.getElementById('tick-counter');

// Header OHLC
const barOpen = document.getElementById('bar-open');
const barHigh = document.getElementById('bar-high');
const barLow = document.getElementById('bar-low');
const barClose = document.getElementById('bar-close');
const systemClock = document.getElementById('system-clock');
const chartIntervalBadge = document.getElementById('chart-interval-badge');

// Controls
const btnInterval5m = document.getElementById('btn-interval-5m');
const btnInterval1d = document.getElementById('btn-interval-1d');
const btnExportCSV = document.getElementById('btn-export-csv');
const chkSma = document.getElementById('chk-sma');
const chkEnvelope = document.getElementById('chk-envelope');
const forecastCardsContainer = document.getElementById('forecast-cards-container');

// Range Statistics
const statMaxHigh = document.getElementById('stat-max-high');
const statMinLow = document.getElementById('stat-min-low');
const statAvgSpread = document.getElementById('stat-avg-spread');
const statNetBias = document.getElementById('stat-net-bias');

// Number Formatter
const numFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPrice = (v) => v != null ? '₹' + numFmt.format(v) : '--';
const formatRaw = (v) => v != null ? numFmt.format(v) : '--';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initChartEngine();
    setupEventHandlers();
    loadInitialHistoricalData().then(() => {
        startLiveStream();
    });
});

// System Clock
function initClock() {
    function tick() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
        if (systemClock) systemClock.textContent = `${dateStr} • ${timeStr} IST`;
    }
    tick();
    setInterval(tick, 1000);
}

// Initialize Custom Organic Canvas
function initChartEngine() {
    if (!chartMount) return;
    chartMount.innerHTML = '';

    chart = LightweightCharts.createChart(chartMount, {
        width: chartMount.clientWidth,
        height: chartMount.clientHeight,
        layout: {
            background: { type: 'solid', color: '#FAF6F0' }, // Warm Sand/Linen
            textColor: '#5A3E2B', // Walnut Brown
            fontFamily: '"Plus Jakarta Sans", -apple-system, sans-serif',
            fontSize: 11
        },
        grid: {
            vertLines: { color: '#EBE3D7' },
            horzLines: { color: '#EBE3D7' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#9E7E66',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#5A3E2B'
            },
            horzLine: {
                color: '#9E7E66',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#5A3E2B'
            }
        },
        rightPriceScale: {
            borderColor: '#E2D8CC',
            visible: true,
            autoScale: true,
            scaleMargins: { top: 0.08, bottom: 0.18 }
        },
        timeScale: {
            borderColor: '#E2D8CC',
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

    // Volume Series
    volumeSeries = chart.addHistogramSeries({
        color: '#87A96B',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: { top: 0.85, bottom: 0 }
    });
    chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 }
    });

    // Candlesticks: Sage Green (#87A96B) Up, Terracotta (#C0583A) Down
    candleSeries = chart.addCandlestickSeries({
        upColor: '#87A96B',
        downColor: '#C0583A',
        borderUpColor: '#6F9154',
        borderDownColor: '#A0452C',
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

    // AI Forecast Candles (Amber Glow #D5851F)
    forecastCandleSeries = chart.addCandlestickSeries({
        upColor: '#D5851F',
        downColor: '#9E7E66',
        borderUpColor: '#B86F15',
        borderDownColor: '#5A3E2B',
        wickUpColor: '#D5851F',
        wickDownColor: '#9E7E66',
        priceLineVisible: false
    });

    // Forecast Upper Boundary (Sage Green #87A96B)
    forecastHighLine = chart.addLineSeries({
        color: '#87A96B',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Pred High'
    });

    // Forecast Lower Boundary (Terracotta #C0583A)
    forecastLowLine = chart.addLineSeries({
        color: '#C0583A',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Pred Low'
    });

    // Forecast Path (Amber Glow #D5851F)
    forecastCloseLine = chart.addLineSeries({
        color: '#D5851F',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        title: 'Expected Close'
    });

    // Crosshair Sync
    chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesPrices) {
            restoreActiveCandleHeader();
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
    ro.observe(chartMount);
}

// Initial Data Load
async function loadInitialHistoricalData() {
    if (chartLoader) chartLoader.classList.remove('opacity-0', 'pointer-events-none');
    try {
        const url = `/api/chart-data?interval=${state.interval}&bars=${state.bars}&horizon=${state.horizon}&force_refresh=false`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        state.chartData = data;

        // Render Historical Candles & Overlays
        candleSeries.setData(data.candles);
        
        const customVolBars = data.volume_bars.map(v => ({
            time: v.time,
            value: v.value,
            color: v.color.includes('089981') ? 'rgba(135, 169, 107, 0.45)' : 'rgba(192, 88, 58, 0.4)'
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

        // Add Marker
        if (data.transition_time) {
            candleSeries.setMarkers([
                {
                    time: data.transition_time,
                    position: 'aboveBar',
                    color: '#D5851F',
                    shape: 'arrowDown',
                    text: 'Neural Horizon ➔'
                }
            ]);
        }

        // Initial Cards Render
        renderForecastCards(data.forecast_candles);
        updateStatistics(data.forecast_candles);
        restoreActiveCandleHeader();

        chart.timeScale().scrollToPosition(3, false);

    } catch (err) {
        console.error("Failed to load initial chart data:", err);
    } finally {
        if (chartLoader) chartLoader.classList.add('opacity-0', 'pointer-events-none');
    }
}

// Real-Time Live Streaming Engine (Every 2 seconds)
function startLiveStream() {
    if (liveIntervalId) clearInterval(liveIntervalId);
    
    liveIntervalId = setInterval(async () => {
        if (!state.isLiveStreaming) return;
        await streamLiveTick();
    }, 2000);
}

// Single Live Tick Request & Smooth Real-Time Canvas Update
async function streamLiveTick() {
    try {
        const res = await fetch(`/api/live-tick?interval=${state.interval}`);
        if (!res.ok) return;
        const tickData = await res.json();

        state.tickCount++;
        if (tickCounter) tickCounter.textContent = state.tickCount.toString();

        const newPrice = tickData.tick_price;
        const isUp = tickData.is_uptick;

        // 1. LIVE CHART UPDATE: Update current in-flight candle
        if (candleSeries && tickData.candle) {
            candleSeries.update(tickData.candle);
        }

        // 2. LIVE VOLUME UPDATE
        if (volumeSeries && tickData.volume) {
            volumeSeries.update(tickData.volume);
        }

        // 3. DYNAMIC FORECAST ADJUSTMENT
        if (tickData.forecast_candles && forecastCandleSeries) {
            forecastCandleSeries.setData(tickData.forecast_candles);
            if (forecastHighLine) forecastHighLine.setData(tickData.forecast_high_line || []);
            if (forecastLowLine) forecastLowLine.setData(tickData.forecast_low_line || []);
            if (forecastCloseLine) forecastCloseLine.setData(tickData.forecast_close_line || []);
            
            // In-place update of forecast cards
            updateForecastCardsLive(tickData.forecast_candles);
            updateStatistics(tickData.forecast_candles);
        }

        // 4. ANIMATE BIG LIVE PRICE CARD
        if (livePriceDisplay) {
            livePriceDisplay.textContent = formatPrice(newPrice);
            livePriceDisplay.classList.remove('flash-uptick', 'flash-downtick');
            void livePriceDisplay.offsetWidth; // trigger reflow
            livePriceDisplay.classList.add(isUp ? 'flash-uptick' : 'flash-downtick');
        }

        if (liveChangeDisplay) {
            const sign = tickData.change_pts >= 0 ? '+' : '';
            liveChangeDisplay.textContent = `${sign}₹${formatRaw(tickData.change_pts)} (${sign}${tickData.change_pct.toFixed(2)}%)`;
            liveChangeDisplay.className = tickData.change_pts >= 0 ?
                'font-mono font-bold px-2.5 py-0.5 rounded-lg bg-sage-100 text-sage-800 transition' :
                'font-mono font-bold px-2.5 py-0.5 rounded-lg bg-red-50 text-terracotta transition';
        }

        if (liveTickClock && tickData.timestamp) {
            liveTickClock.textContent = `${tickData.timestamp}`;
        }

        // Update header bar
        if (tickData.candle) {
            updateOHLCHeader(tickData.candle.open, tickData.candle.high, tickData.candle.low, tickData.candle.close);
        }

    } catch (e) {
        console.warn("Live tick poll error:", e);
    }
}

// Update Header OHLC
function updateOHLCHeader(o, h, l, c) {
    if (barOpen) barOpen.textContent = formatRaw(o);
    if (barHigh) barHigh.textContent = formatRaw(h);
    if (barLow) barLow.textContent = formatRaw(l);
    if (barClose) barClose.textContent = formatRaw(c);
}

function restoreActiveCandleHeader() {
    if (!state.chartData || !state.chartData.candles || !state.chartData.candles.length) return;
    const last = state.chartData.candles[state.chartData.candles.length - 1];
    updateOHLCHeader(last.open, last.high, last.low, last.close);
    if (livePriceDisplay) livePriceDisplay.textContent = formatPrice(last.close);
}

// Initial Forecast Cards Render
function renderForecastCards(forecasts) {
    if (!forecastCardsContainer || !forecasts) return;
    let html = '';

    forecasts.forEach((f, idx) => {
        const isUp = f.change_pct >= 0;
        const biasBadgeClass = isUp ? 'badge-bullish' : 'badge-bearish';
        const biasIcon = isUp ? '▲' : '▼';

        html += `
            <div class="prediction-card" id="card-forecast-${idx}">
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-serif font-bold text-walnut-900 text-base">
                            ${f.day || `Step +${idx+1}`}
                        </span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${biasBadgeClass} card-bias">
                            ${biasIcon} ${f.trend_bias ? f.trend_bias.replace(/\([^)]*\)/, '').trim() : (isUp ? 'Bullish' : 'Bearish')}
                        </span>
                    </div>
                    <div class="text-[10px] text-walnut-400 font-mono mb-2">${f.display_date}</div>

                    <div class="bg-sand-base/90 rounded-xl p-2.5 border border-sand-border space-y-1.5">
                        <div class="flex items-baseline justify-between">
                            <span class="text-[9px] uppercase font-bold text-walnut-400">Pred High</span>
                            <span class="font-mono font-bold text-sage-600 text-xs card-high">₹${formatRaw(f.high)}</span>
                        </div>
                        <div class="flex items-baseline justify-between">
                            <span class="text-[9px] uppercase font-bold text-walnut-400">Pred Low</span>
                            <span class="font-mono font-bold text-terracotta text-xs card-low">₹${formatRaw(f.low)}</span>
                        </div>
                    </div>
                </div>

                <div class="mt-2.5 pt-2 border-t border-sand-border/80 flex items-center justify-between text-[11px]">
                    <span class="text-walnut-400">Close: <b class="font-mono text-walnut-800 font-semibold card-close">₹${formatRaw(f.close)}</b></span>
                    <span class="font-mono text-[10px] text-amberGlow-600 font-bold card-spread">Δ ₹${formatRaw(f.spread)}</span>
                </div>
            </div>
        `;
    });

    forecastCardsContainer.innerHTML = html;
}

// In-Place Smooth Update of Forecast Cards (No Layout Flickering)
function updateForecastCardsLive(forecasts) {
    if (!forecastCardsContainer || !forecasts) return;

    forecasts.forEach((f, idx) => {
        const card = document.getElementById(`card-forecast-${idx}`);
        if (!card) return;

        const elHigh = card.querySelector('.card-high');
        const elLow = card.querySelector('.card-low');
        const elClose = card.querySelector('.card-close');
        const elSpread = card.querySelector('.card-spread');

        if (elHigh) elHigh.textContent = `₹${formatRaw(f.high)}`;
        if (elLow) elLow.textContent = `₹${formatRaw(f.low)}`;
        if (elClose) elClose.textContent = `₹${formatRaw(f.close)}`;
        if (elSpread) elSpread.textContent = `Δ ₹${formatRaw(f.spread)}`;
    });
}

// Update Range Extremes Statistics
function updateStatistics(forecasts) {
    if (!forecasts || !forecasts.length) return;
    const highs = forecasts.map(c => c.high);
    const lows = forecasts.map(c => c.low);
    const spreads = forecasts.map(c => c.spread);

    if (statMaxHigh) statMaxHigh.textContent = '₹' + formatRaw(Math.max(...highs));
    if (statMinLow) statMinLow.textContent = '₹' + formatRaw(Math.min(...lows));
    if (statAvgSpread) {
        const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
        statAvgSpread.textContent = '₹' + formatRaw(avg);
    }
    if (statNetBias) {
        const net = forecasts[forecasts.length - 1].close - forecasts[0].open;
        statNetBias.textContent = net >= 0 ? `Bullish Expansion (+${formatRaw(net)} pts)` : `Bearish Contraction (${formatRaw(net)} pts)`;
        statNetBias.className = net >= 0 ? 'font-semibold text-sage-600' : 'font-semibold text-terracotta';
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
            btnInterval5m.className = 'px-3 py-1.5 rounded-lg bg-walnut-600 text-white shadow-xs transition-all font-medium flex items-center gap-1.5';
            btnInterval1d.className = 'px-3 py-1.5 rounded-lg text-walnut-600 hover:text-walnut-900 transition-all font-medium';
            if (chartIntervalBadge) chartIntervalBadge.textContent = '5-Minute Candles';
            loadInitialHistoricalData();
        });

        btnInterval1d.addEventListener('click', () => {
            if (state.interval === '1d') return;
            state.interval = '1d';
            state.bars = 120;
            btnInterval1d.className = 'px-3 py-1.5 rounded-lg bg-walnut-600 text-white shadow-xs transition-all font-medium flex items-center gap-1.5';
            btnInterval5m.className = 'px-3 py-1.5 rounded-lg text-walnut-600 hover:text-walnut-900 transition-all font-medium';
            if (chartIntervalBadge) chartIntervalBadge.textContent = 'Daily Candles';
            loadInitialHistoricalData();
        });
    }

    // Toggle Live Streaming Button
    if (btnToggleLive) {
        btnToggleLive.addEventListener('click', () => {
            state.isLiveStreaming = !state.isLiveStreaming;
            if (state.isLiveStreaming) {
                if (liveToggleText) liveToggleText.textContent = 'Live: Active';
                if (liveIcon) liveIcon.className = 'w-3.5 h-3.5 text-sage-600 animate-pulse';
                if (liveBadge) liveBadge.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 text-[10px] font-bold tracking-wider uppercase animate-pulse';
                if (liveBadgeText) liveBadgeText.textContent = 'Live Ticking';
            } else {
                if (liveToggleText) liveToggleText.textContent = 'Live: Paused';
                if (liveIcon) liveIcon.className = 'w-3.5 h-3.5 text-walnut-400';
                if (liveBadge) liveBadge.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 text-[10px] font-bold tracking-wider uppercase';
                if (liveBadgeText) liveBadgeText.textContent = 'Paused';
            }
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
                b.classList.remove('active', 'bg-sand-muted', 'text-walnut-900', 'font-bold');
            });
            e.target.classList.add('active', 'bg-sand-muted', 'text-walnut-900', 'font-bold');
            state.bars = parseInt(e.target.dataset.bars, 10);
            loadInitialHistoricalData();
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
            a.download = `nifty50_neural_forecast_${state.interval}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}
