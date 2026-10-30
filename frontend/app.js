/**
 * NIFTY 50 TradingView Engine with Deep Learning Neural Forecasts
 * Native Lightweight Charts v4.2.0 + Watchlist + Multi-Horizon AI Projections
 */

// Application State
const state = {
    interval: '5m',
    bars: 120,
    horizon: 6,
    theme: 'light',
    activeTab: 'ai', // 'ai' or 'tv'
    chartData: null,
    officialWidgetInitialized: false,
    overlays: {
        sma: true,
        envelope: true
    }
};

// Global Chart References
let tvChart = null;
let candleSeries = null;
let volumeSeries = null;
let smaSeries = null;
let forecastCandleSeries = null;
let forecastHighLine = null;
let forecastLowLine = null;
let forecastCloseLine = null;

// DOM Elements
const container = document.getElementById('tv-chart-container');
const loader = document.getElementById('tv-loader');
const officialContainer = document.getElementById('tv-official-container');
const tabAi = document.getElementById('tab-mode-ai');
const tabTv = document.getElementById('tab-mode-tv');
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const clockEl = document.getElementById('tv-clock');

// Interval Pills
const pill5m = document.getElementById('pill-5m');
const pill15m = document.getElementById('pill-15m');
const pill1h = document.getElementById('pill-1h');
const pill1d = document.getElementById('pill-1d');
const labelIntervalText = document.getElementById('label-interval-text');

// Header OHLC Elements
const barOpen = document.getElementById('bar-open');
const barHigh = document.getElementById('bar-high');
const barLow = document.getElementById('bar-low');
const barClose = document.getElementById('bar-close');
const barChange = document.getElementById('bar-change');
const barVol = document.getElementById('bar-vol');

// Checkbox Overlays
const chkSma = document.getElementById('chk-sma');
const chkEnvelope = document.getElementById('chk-envelope');

// Sidebar Elements
const watchlistBody = document.getElementById('watchlist-body');
const sideLastPrice = document.getElementById('side-last-price');
const sideChange = document.getElementById('side-change');
const sideVol = document.getElementById('side-vol');
const sideForecastList = document.getElementById('side-forecast-list');
const btnSideRetrain = document.getElementById('btn-side-retrain');

// Formatters
const numFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPrice = (val) => val != null ? numFormat.format(val) : '--';
const formatCompactVol = (val) => {
    if (!val) return '0';
    if (val >= 1e7) return (val / 1e7).toFixed(2) + ' Cr';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + ' M';
    if (val >= 1e5) return (val / 1e5).toFixed(2) + ' L';
    if (val >= 1e3) return (val / 1e3).toFixed(1) + ' K';
    return val.toString();
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTradingViewChart();
    setupEventHandlers();
    loadMarketAndChartData(false);
});

// Live TradingView Clock
function initClock() {
    function tick() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
        if (clockEl) {
            clockEl.textContent = `${timeStr} UTC+05:30`;
        }
    }
    tick();
    setInterval(tick, 1000);
}

// Initialize Lightweight Charts
function initTradingViewChart() {
    if (!container) return;

    const isDark = state.theme === 'dark';
    const bgCol = isDark ? '#131722' : '#ffffff';
    const textCol = isDark ? '#d1d4dc' : '#131722';
    const gridCol = isDark ? '#1e222d' : '#f0f3fa';
    const borderCol = isDark ? '#2a2e39' : '#e0e3eb';

    container.innerHTML = '';

    tvChart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
            background: { type: 'solid', color: bgCol },
            textColor: textCol,
            fontFamily: "'Trebuchet MS', Roboto, Ubuntu, sans-serif",
            fontSize: 11
        },
        grid: {
            vertLines: { color: gridCol },
            horzLines: { color: gridCol }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#758696',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#2962ff'
            },
            horzLine: {
                color: '#758696',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                labelBackgroundColor: '#2962ff'
            }
        },
        rightPriceScale: {
            borderColor: borderCol,
            visible: true,
            autoScale: true,
            scaleMargins: {
                top: 0.1,
                bottom: 0.2
            }
        },
        timeScale: {
            borderColor: borderCol,
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

    // Volume Histogram (Lower 20% overlay)
    volumeSeries = tvChart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
            type: 'volume'
        },
        priceScaleId: 'volume',
        scaleMargins: {
            top: 0.82,
            bottom: 0
        }
    });
    tvChart.priceScale('volume').applyOptions({
        scaleMargins: {
            top: 0.82,
            bottom: 0
        }
    });

    // Historical Candlestick Series (Exact TradingView Colors)
    candleSeries = tvChart.addCandlestickSeries({
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645'
    });

    // SMA 20 Overlay Series
    smaSeries = tvChart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 1.5,
        title: 'SMA 20',
        crosshairMarkerVisible: false
    });

    // AI Forecast Predicted Candles (Purple/Cyan Hue for distinction)
    forecastCandleSeries = tvChart.addCandlestickSeries({
        upColor: '#2962ff',
        downColor: '#e91e63',
        borderUpColor: '#2962ff',
        borderDownColor: '#e91e63',
        wickUpColor: '#2962ff',
        wickDownColor: '#e91e63',
        priceLineVisible: false
    });

    // AI Forecast Upper High Envelope Line
    forecastHighLine = tvChart.addLineSeries({
        color: '#089981',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Pred High',
        crosshairMarkerVisible: true
    });

    // AI Forecast Lower Low Envelope Line
    forecastLowLine = tvChart.addLineSeries({
        color: '#f23645',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'Pred Low',
        crosshairMarkerVisible: true
    });

    // AI Forecast Expected Close Path
    forecastCloseLine = tvChart.addLineSeries({
        color: '#2962ff',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        title: 'AI Path'
    });

    // Crosshair Sync for Header Bar
    tvChart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesPrices) {
            restoreLatestHeaderBar();
            return;
        }

        const candleData = param.seriesPrices.get(candleSeries) || param.seriesPrices.get(forecastCandleSeries);
        const volData = param.seriesPrices.get(volumeSeries);

        if (candleData) {
            updateHeaderOHLC(candleData.open, candleData.high, candleData.low, candleData.close, volData);
        }
    });

    // Window Resize Observer
    const resizeObserver = new ResizeObserver(entries => {
        if (!entries || entries.length === 0 || !tvChart) return;
        const entry = entries[0];
        tvChart.applyOptions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
        });
    });
    resizeObserver.observe(container);
}

// Fetch Market & Chart Data from Server
async function loadMarketAndChartData(forceRefresh = false) {
    if (loader) {
        loader.classList.remove('opacity-0', 'pointer-events-none');
    }
    if (refreshIcon) {
        refreshIcon.classList.add('animate-spin');
    }

    try {
        const url = `/api/chart-data?interval=${state.interval}&bars=${state.bars}&horizon=${state.horizon}&force_refresh=${forceRefresh}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        
        const data = await res.json();
        state.chartData = data;

        // Render everything
        renderChartData(data);
        renderWatchlist(data.watchlist);
        renderQuoteCard(data.market_summary);
        renderForecastCards(data.forecast_candles);

    } catch (err) {
        console.error("Failed to load chart data:", err);
    } finally {
        if (loader) {
            loader.classList.add('opacity-0', 'pointer-events-none');
        }
        if (refreshIcon) {
            refreshIcon.classList.remove('animate-spin');
        }
    }
}

// Populate Chart Series
function renderChartData(data) {
    if (!tvChart || !data) return;

    // 1. Candlesticks
    if (candleSeries && data.candles) {
        candleSeries.setData(data.candles);
    }

    // 2. Volume
    if (volumeSeries && data.volume_bars) {
        volumeSeries.setData(data.volume_bars);
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

    // 4. AI Forecast Candles & Envelope
    if (forecastCandleSeries && data.forecast_candles) {
        forecastCandleSeries.setData(data.forecast_candles);
    }

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

    // 5. Add Boundary Marker at Transition Point
    if (candleSeries && data.transition_time) {
        candleSeries.setMarkers([
            {
                time: data.transition_time,
                position: 'aboveBar',
                color: '#2962ff',
                shape: 'arrowDown',
                text: 'AI Projection ➔'
            }
        ]);
    }

    // Update Header Bar with Latest Candle
    restoreLatestHeaderBar();

    // Scroll to right edge
    tvChart.timeScale().scrollToPosition(4, false);
}

// Update Top Header OHLC Info
function updateHeaderOHLC(o, h, l, c, vol) {
    if (barOpen) barOpen.textContent = formatPrice(o);
    if (barHigh) barHigh.textContent = formatPrice(h);
    if (barLow) barLow.textContent = formatPrice(l);
    if (barClose) barClose.textContent = formatPrice(c);

    if (barChange && o != null && c != null) {
        const chg = c - o;
        const pct = ((chg / o) * 100);
        const sign = chg >= 0 ? '+' : '';
        barChange.textContent = `${sign}${formatPrice(chg)} (${sign}${pct.toFixed(2)}%)`;
        barChange.className = chg >= 0 ? 'text-xs font-bold text-[#089981]' : 'text-xs font-bold text-[#f23645]';
    }

    if (barVol && vol != null) {
        const v = typeof vol === 'object' ? vol.value : vol;
        barVol.textContent = formatCompactVol(v);
    }
}

function restoreLatestHeaderBar() {
    if (!state.chartData || !state.chartData.candles || state.chartData.candles.length === 0) return;
    const last = state.chartData.candles[state.chartData.candles.length - 1];
    const lastVol = state.chartData.volume_bars ? state.chartData.volume_bars[state.chartData.volume_bars.length - 1] : null;
    updateHeaderOHLC(last.open, last.high, last.low, last.close, lastVol);
}

// Render Watchlist (Matching TradingView Screenshot)
function renderWatchlist(watchlist) {
    if (!watchlistBody || !watchlist) return;

    const iconBadgeColors = {
        'NIFTY': { bg: 'bg-[#2962ff]', label: '50' },
        'BANKNIFTY': { bg: 'bg-[#6366f1]', label: 'BK' },
        'SENSEX': { bg: 'bg-[#0284c7]', label: '30' },
        'CNXIT': { bg: 'bg-[#8b5cf6]', label: 'IT' },
        'SPX': { bg: 'bg-[#f43f5e]', label: '500' }
    };

    let html = '';
    watchlist.forEach(item => {
        const isUp = item.chg >= 0;
        const chgColor = isUp ? 'text-[#089981]' : 'text-[#f23645]';
        const sign = isUp ? '+' : '';
        const badge = iconBadgeColors[item.symbol] || { bg: 'bg-slate-600', label: item.symbol.slice(0, 2) };
        const isSelected = item.symbol === 'NIFTY';

        html += `
            <tr class="watchlist-row ${isSelected ? 'bg-blue-50/70 dark:bg-blue-900/20' : ''}" data-symbol="${item.symbol}">
                <td class="py-2 px-3">
                    <div class="flex items-center gap-2">
                        <span class="w-5 h-5 rounded-full ${badge.bg} text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                            ${badge.label}
                        </span>
                        <div>
                            <div class="font-bold text-[#131722] dark:text-slate-200 text-xs">${item.symbol}</div>
                            <div class="text-[9px] text-slate-400">INDEX</div>
                        </div>
                    </div>
                </td>
                <td class="py-2 px-2 text-right font-medium text-[#131722] dark:text-slate-100">${formatPrice(item.last)}</td>
                <td class="py-2 px-2 text-right font-semibold ${chgColor}">${sign}${formatPrice(item.chg)}</td>
                <td class="py-2 px-3 text-right font-semibold ${chgColor}">${sign}${item.pct.toFixed(2)}%</td>
            </tr>
        `;
    });

    watchlistBody.innerHTML = html;
}

// Render Quote Card (Matching TradingView Screenshot)
function renderQuoteCard(summary) {
    if (!summary) return;

    const formatted = formatPrice(summary.last_close);
    if (sideLastPrice) sideLastPrice.textContent = formatted;
    
    // Update Floating Buy/Sell Badges
    const badgeSell = document.getElementById('badge-sell-price');
    const badgeBuy = document.getElementById('badge-buy-price');
    if (badgeSell) badgeSell.textContent = formatted;
    if (badgeBuy) badgeBuy.textContent = formatted;

    if (sideChange) {
        const isUp = summary.change_pts >= 0;
        const sign = isUp ? '+' : '';
        sideChange.textContent = `${sign}${formatPrice(summary.change_pts)} ${sign}${summary.change_pct.toFixed(2)}%`;
        sideChange.className = isUp ? 'text-[#089981] font-bold' : 'text-[#f23645] font-bold';
    }
    if (sideVol) {
        sideVol.textContent = formatCompactVol(summary.total_volume);
    }
}

// Render AI Prediction Cards
function renderForecastCards(forecast) {
    if (!sideForecastList || !forecast) return;

    let html = '';
    forecast.forEach((f, idx) => {
        const isUp = f.change_pct >= 0;
        const trendClass = isUp ? 'badge-bullish' : 'badge-bearish';
        const trendSign = isUp ? '+' : '';
        const trendIcon = isUp ? '▲' : '▼';

        html += `
            <div class="forecast-card text-xs">
                <div class="flex items-center justify-between mb-1.5">
                    <span class="font-bold text-slate-800 dark:text-slate-200 text-[11px] flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full ${isUp ? 'bg-[#089981]' : 'bg-[#f23645]'}"></span>
                        ${f.day || `Step +${idx+1}`} <span class="text-slate-400 font-normal">(${f.display_date})</span>
                    </span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${trendClass}">
                        ${trendIcon} ${f.trend_bias || (isUp ? 'Bullish' : 'Bearish')}
                    </span>
                </div>
                
                <div class="grid grid-cols-2 gap-2 my-1.5 bg-slate-50 dark:bg-slate-800/40 p-2 rounded">
                    <div>
                        <div class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Pred High</div>
                        <div class="font-mono font-bold text-[#089981] text-xs">₹${formatPrice(f.high)}</div>
                    </div>
                    <div>
                        <div class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Pred Low</div>
                        <div class="font-mono font-bold text-[#f23645] text-xs">₹${formatPrice(f.low)}</div>
                    </div>
                </div>

                <div class="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                    <span>Target Close: <b class="font-mono text-slate-800 dark:text-slate-200">₹${formatPrice(f.close)}</b></span>
                    <span>Spread: <b class="font-mono text-slate-700 dark:text-slate-300">₹${formatPrice(f.spread)}</b></span>
                </div>
            </div>
        `;
    });

    sideForecastList.innerHTML = html;
}

// Setup Event Handlers
function setupEventHandlers() {
    // Refresh Button
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => loadMarketAndChartData(true));
    }

    // Timeframe Pills (5m, 15m, 1H, D)
    const pills = [
        { el: pill5m, int: '5m', bars: 120, label: '5m' },
        { el: pill15m, int: '5m', bars: 180, label: '15m' },
        { el: pill1h, int: '5m', bars: 300, label: '1H' },
        { el: pill1d, int: '1d', bars: 90, label: '1D' }
    ];

    pills.forEach(p => {
        if (!p.el) return;
        p.el.addEventListener('click', () => {
            pills.forEach(item => {
                if (item.el) {
                    item.el.className = 'px-2 py-1 rounded text-slate-600 hover:bg-[#f0f3fa] transition';
                }
            });
            p.el.className = 'px-2 py-1 rounded font-bold text-[#2962ff] bg-[#f0f3fa] transition';
            
            state.interval = p.int;
            state.bars = p.bars;
            if (labelIntervalText) labelIntervalText.textContent = p.label;
            loadMarketAndChartData(false);
        });
    });

    // Bottom Range Buttons (1D, 5D, 1M, 3M, 6M, YTD, 1Y, ALL)
    document.querySelectorAll('.btn-range').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn-range').forEach(b => {
                b.classList.remove('active', 'bg-[#f0f3fa]', 'text-[#2962ff]', 'font-bold');
            });
            e.target.classList.add('active', 'bg-[#f0f3fa]', 'text-[#2962ff]', 'font-bold');
            
            const range = e.target.dataset.range;
            if (range === '1D') { state.interval = '5m'; state.bars = 75; }
            else if (range === '5D') { state.interval = '5m'; state.bars = 375; }
            else if (range === '1M') { state.interval = '1d'; state.bars = 30; }
            else if (range === '3M') { state.interval = '1d'; state.bars = 90; }
            else if (range === '6M') { state.interval = '1d'; state.bars = 180; }
            else if (range === 'YTD') { state.interval = '1d'; state.bars = 220; }
            else if (range === '1Y') { state.interval = '1d'; state.bars = 365; }
            else if (range === 'ALL') { state.interval = '1d'; state.bars = 500; }

            loadMarketAndChartData(false);
        });
    });

    // Checkbox Overlays
    if (chkSma) {
        chkSma.addEventListener('change', (e) => {
            state.overlays.sma = e.target.checked;
            if (smaSeries) {
                smaSeries.applyOptions({ visible: state.overlays.sma });
            }
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

    // Retrain Model Button
    if (btnSideRetrain) {
        btnSideRetrain.addEventListener('click', async () => {
            btnSideRetrain.disabled = true;
            btnSideRetrain.textContent = 'Training LSTM...';
            try {
                const res = await fetch('/api/retrain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ interval: state.interval, epochs: 25, learning_rate: 0.003 })
                });
                const d = await res.json();
                alert(d.message || "Model retraining initiated!");
            } catch (e) {
                alert("Failed to trigger retrain: " + e);
            } finally {
                setTimeout(() => {
                    btnSideRetrain.disabled = false;
                    btnSideRetrain.textContent = 'Retrain Model';
                }, 4000);
            }
        });
    }

    // Mode Switcher: AI TradingView vs Official Embed
    if (tabAi && tabTv) {
        tabAi.addEventListener('click', () => {
            state.activeTab = 'ai';
            tabAi.className = 'px-2.5 py-1 rounded-md bg-white text-[#2962ff] shadow-sm font-bold flex items-center gap-1';
            tabTv.className = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition flex items-center gap-1';
            if (container) container.classList.remove('hidden');
            if (officialContainer) officialContainer.classList.add('hidden');
        });

        tabTv.addEventListener('click', () => {
            state.activeTab = 'tv';
            tabTv.className = 'px-2.5 py-1 rounded-md bg-white text-[#2962ff] shadow-sm font-bold flex items-center gap-1';
            tabAi.className = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition flex items-center gap-1';
            if (container) container.classList.add('hidden');
            if (officialContainer) {
                officialContainer.classList.remove('hidden');
                initOfficialTradingViewWidget();
            }
        });
    }

    // Theme Toggle
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            state.theme = state.theme === 'light' ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', state.theme === 'dark');
            initTradingViewChart();
            if (state.chartData) {
                renderChartData(state.chartData);
            }
        });
    }
}

// Official Embedded TradingView Widget
function initOfficialTradingViewWidget() {
    if (state.officialWidgetInitialized) return;
    state.officialWidgetInitialized = true;

    if (window.TradingView) {
        new TradingView.widget({
            "autosize": true,
            "symbol": "NSE:NIFTY",
            "interval": "D",
            "timezone": "Asia/Kolkata",
            "theme": state.theme,
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "container_id": "tradingview_widget_mount",
            "studies": ["MASimple@tv-basicstudies"]
        });
    }
}
