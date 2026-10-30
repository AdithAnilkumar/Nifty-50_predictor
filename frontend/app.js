/**
 * NIFTY-50 Matte Obsidian & Electric Lime Forecaster
 * Syne Display Font, Electric Lime (#CCFF00) & Coral Red (#FF3366)
 * Continuous Real-Time Live Streaming (2s Ticks)
 */

// Application State
const state = {
    interval: '5m',
    bars: 150,
    horizon: 6,
    chartData: null,
    isLive: true,
    tickCount: 0,
    overlays: {
        sma: true,
        envelope: true
    }
};

// Chart References
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
const headerPrice = document.getElementById('header-price');
const headerChange = document.getElementById('header-change');
const liveTime = document.getElementById('live-time');
const tickCounter = document.getElementById('tick-counter');
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
        startLiveStreaming();
    });
});

// Initialize Custom Canvas with Matte Obsidian & Electric Lime Palette
function initChartEngine() {
    if (!chartMount) return;
    chartMount.innerHTML = '';

    chart = LightweightCharts.createChart(chartMount, {
        width: chartMount.clientWidth,
        height: chartMount.clientHeight,
        layout: {
            background: { type: 'solid', color: '#0A0A0A' }, // Deep Matte Obsidian
            textColor: '#8E8E93',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontSize: 11
        },
        grid: {
            vertLines: { color: '#161616' },
            horzLines: { color: '#161616' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#333333',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#CCFF00',
                labelTextColor: '#000000'
            },
            horzLine: {
                color: '#333333',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#CCFF00',
                labelTextColor: '#000000'
            }
        },
        rightPriceScale: {
            borderColor: '#222222',
            visible: true,
            autoScale: true,
            scaleMargins: { top: 0.08, bottom: 0.18 }
        },
        timeScale: {
            borderColor: '#222222',
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
        color: '#CCFF00',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: { top: 0.85, bottom: 0 }
    });
    chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 }
    });

    // Candlesticks: Electric Lime (#CCFF00) Up, Coral Red (#FF3366) Down
    candleSeries = chart.addCandlestickSeries({
        upColor: '#CCFF00',
        downColor: '#FF3366',
        borderUpColor: '#CCFF00',
        borderDownColor: '#FF3366',
        wickUpColor: '#CCFF00',
        wickDownColor: '#FF3366'
    });

    // SMA 20 Overlay (Slate Gray)
    smaSeries = chart.addLineSeries({
        color: '#6E6E73',
        lineWidth: 1.5,
        title: 'SMA 20',
        crosshairMarkerVisible: false
    });

    // AI Forecast Predicted Candles (Electric Lime Glow)
    forecastCandleSeries = chart.addCandlestickSeries({
        upColor: '#CCFF00',
        downColor: '#8E8E93',
        borderUpColor: '#FFFFFF',
        borderDownColor: '#FF3366',
        wickUpColor: '#CCFF00',
        wickDownColor: '#FF3366',
        priceLineVisible: false
    });

    // Forecast Upper Boundary (Electric Lime)
    forecastHighLine = chart.addLineSeries({
        color: '#CCFF00',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Pred High'
    });

    // Forecast Lower Boundary (Coral Red)
    forecastLowLine = chart.addLineSeries({
        color: '#FF3366',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Pred Low'
    });

    // Forecast Close Path (Pure White)
    forecastCloseLine = chart.addLineSeries({
        color: '#FFFFFF',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        title: 'Target Close'
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

// Initial Data Fetch
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
            color: v.color.includes('089981') ? 'rgba(204, 255, 0, 0.45)' : 'rgba(255, 51, 102, 0.4)'
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
                    color: '#CCFF00',
                    shape: 'arrowDown',
                    text: 'Neural Projection ➔'
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

// Real-Time Live Streaming (2s Polling)
function startLiveStreaming() {
    if (liveIntervalId) clearInterval(liveIntervalId);
    liveIntervalId = setInterval(async () => {
        if (!state.isLive) return;
        await streamTick();
    }, 2000);
}

// Single Live Tick Stream
async function streamTick() {
    try {
        const res = await fetch(`/api/live-tick?interval=${state.interval}`);
        if (!res.ok) return;
        const tick = await res.json();

        state.tickCount++;
        if (tickCounter) tickCounter.textContent = state.tickCount.toString();

        // 1. Live Candle Canvas Update
        if (candleSeries && tick.candle) {
            candleSeries.update(tick.candle);
        }

        // 2. Live Volume Update
        if (volumeSeries && tick.volume) {
            const volColor = tick.candle.close >= tick.candle.open ? 'rgba(204, 255, 0, 0.45)' : 'rgba(255, 51, 102, 0.4)';
            volumeSeries.update({ ...tick.volume, color: volColor });
        }

        // 3. Dynamic Forecast Updates
        if (tick.forecast_candles && forecastCandleSeries) {
            forecastCandleSeries.setData(tick.forecast_candles);
            if (forecastHighLine) forecastHighLine.setData(tick.forecast_high_line || []);
            if (forecastLowLine) forecastLowLine.setData(tick.forecast_low_line || []);
            if (forecastCloseLine) forecastCloseLine.setData(tick.forecast_close_line || []);
            
            updateForecastCardsLive(tick.forecast_candles);
            updateStatistics(tick.forecast_candles);
        }

        // 4. Update Header Live Price & Animate Glow
        if (headerPrice) {
            headerPrice.textContent = formatPrice(tick.tick_price);
            headerPrice.classList.remove('tick-glow-up', 'tick-glow-down');
            void headerPrice.offsetWidth;
            headerPrice.classList.add(tick.is_uptick ? 'tick-glow-up' : 'tick-glow-down');
        }

        if (headerChange) {
            const sign = tick.change_pts >= 0 ? '+' : '';
            headerChange.textContent = `${sign}₹${formatRaw(tick.change_pts)} (${sign}${tick.change_pct.toFixed(2)}%)`;
            headerChange.className = tick.change_pts >= 0 ?
                'text-xs font-semibold px-2 py-0.5 rounded-md bg-[#1C1C1C] text-electricLime border border-[#2E2E2E]' :
                'text-xs font-semibold px-2 py-0.5 rounded-md bg-[#1C1C1C] text-coralRed border border-[#2E2E2E]';
        }

        if (liveTime && tick.timestamp) {
            liveTime.textContent = tick.timestamp;
        }

        if (tick.candle) {
            updateOHLCHeader(tick.candle.open, tick.candle.high, tick.candle.low, tick.candle.close);
        }

    } catch (e) {
        console.warn("Live stream tick error:", e);
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
    if (headerPrice) headerPrice.textContent = formatPrice(last.close);
}

// Initial Forecast Cards Render
function renderForecastCards(forecasts) {
    if (!forecastCards || !forecasts) return;
    let html = '';

    forecasts.forEach((f, idx) => {
        const isUp = f.change_pct >= 0;
        const badgeClass = isUp ? 'badge-lime' : 'badge-coral';
        const sign = isUp ? '+' : '';

        html += `
            <div class="dark-prediction-card" id="card-${idx}">
                <div class="space-y-2">
                    <div class="flex items-center justify-between text-xs">
                        <span class="font-display font-bold text-white text-sm">${f.day || `Step +${idx+1}`}</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}">
                            ${sign}${f.change_pct.toFixed(2)}%
                        </span>
                    </div>
                    <div class="text-[10px] text-mutedText font-mono">${f.display_date}</div>

                    <div class="bg-[#181818] rounded-xl p-2.5 border border-[#262626] space-y-1 font-mono text-xs">
                        <div class="flex justify-between items-baseline">
                            <span class="text-mutedText text-[10px] uppercase">Pred High</span>
                            <span class="font-bold text-electricLime card-high">₹${formatRaw(f.high)}</span>
                        </div>
                        <div class="flex justify-between items-baseline">
                            <span class="text-mutedText text-[10px] uppercase">Pred Low</span>
                            <span class="font-bold text-coralRed card-low">₹${formatRaw(f.low)}</span>
                        </div>
                    </div>
                </div>

                <div class="mt-2.5 pt-2 border-t border-[#222222] flex items-center justify-between text-[11px] font-mono">
                    <span class="text-mutedText">Close: <b class="text-white font-bold card-close">₹${formatRaw(f.close)}</b></span>
                    <span class="text-electricLime font-bold card-spread text-[10px]">Δ ₹${formatRaw(f.spread)}</span>
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
        const elSpread = card.querySelector('.card-spread');

        if (elHigh) elHigh.textContent = `₹${formatRaw(f.high)}`;
        if (elLow) elLow.textContent = `₹${formatRaw(f.low)}`;
        if (elClose) elClose.textContent = `₹${formatRaw(f.close)}`;
        if (elSpread) elSpread.textContent = `Δ ₹${formatRaw(f.spread)}`;
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
            btnInterval5m.className = 'px-3 py-1 rounded-full bg-electricLime text-black font-bold shadow-xs transition';
            btnInterval1d.className = 'px-3 py-1 rounded-full text-mutedText hover:text-white transition';
            if (chartTitle) chartTitle.textContent = 'NIFTY 50 • 5m';
            loadHistoricalData();
        });

        btnInterval1d.addEventListener('click', () => {
            if (state.interval === '1d') return;
            state.interval = '1d';
            state.bars = 120;
            btnInterval1d.className = 'px-3 py-1 rounded-full bg-electricLime text-black font-bold shadow-xs transition';
            btnInterval5m.className = 'px-3 py-1 rounded-full text-mutedText hover:text-white transition';
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
                b.className = 'btn-range px-2.5 py-1 rounded-md text-mutedText hover:text-white transition';
            });
            e.target.className = 'btn-range px-2.5 py-1 rounded-md bg-[#222222] text-electricLime font-bold active';
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
            a.download = `nifty50_neural_forecast_${state.interval}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }
}
