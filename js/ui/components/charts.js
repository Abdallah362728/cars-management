// Chart.js: blueprint theme + lifecycle management.
// Pages create one manager per module and destroy all instances in cleanup()
// — combined with the router's epoch guard this prevents charts leaking onto
// removed canvases.

export function createChartManager() {
  const charts = []
  return {
    add(chart) {
      charts.push(chart)
      return chart
    },
    destroyAll() {
      charts.forEach(c => c.destroy())
      charts.length = 0
    },
  }
}

function tokens() {
  const s = getComputedStyle(document.documentElement)
  return {
    amber: s.getPropertyValue('--amber').trim() || '#E8A33D',
    amberDim: s.getPropertyValue('--amber-dim').trim() || 'rgba(232,163,61,0.14)',
    inkMute: s.getPropertyValue('--ink-mute').trim() || '#5E7186',
    grid: s.getPropertyValue('--grid').trim() || 'rgba(94,113,134,0.07)',
    line: s.getPropertyValue('--line').trim() || '#22303F',
    danger: s.getPropertyValue('--danger').trim() || '#D95C5C',
    bg: s.getPropertyValue('--bg').trim() || '#0E141C',
    surface2: s.getPropertyValue('--surface-2').trim() || '#17212D',
  }
}

export function applyChartDefaults() {
  const t = tokens()
  Chart.defaults.font.family = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace'
  Chart.defaults.font.size = 10
  Chart.defaults.color = t.inkMute
}

// Efficiency trend: straight technical segments, solid amber squares for
// measured points, hollow squares + dashed segments for estimates, dashed
// red factory-spec reference line.
export function makeTrendChart(canvas, points, { factorySpec = null } = {}) {
  const t = tokens()
  const spec = Number(factorySpec) || null

  const factoryLinePlugin = {
    id: 'factoryLine',
    afterDraw(chart) {
      if (!spec) return
      const { ctx, chartArea, scales } = chart
      const y = scales.y.getPixelForValue(spec)
      if (y < chartArea.top || y > chartArea.bottom) return
      ctx.save()
      ctx.strokeStyle = t.danger
      ctx.globalAlpha = 0.8
      ctx.lineWidth = 1
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(chartArea.left, y)
      ctx.lineTo(chartArea.right, y)
      ctx.stroke()
      ctx.restore()
    },
  }

  const values = points.map(p => p.value)
  const yBounds = spec
    ? { min: Math.floor(Math.min(...values, spec) * 0.92), max: Math.ceil(Math.max(...values, spec) * 1.08) }
    : {}

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => p.label),
      datasets: [{
        data: values,
        borderColor: t.amber,
        borderWidth: 1.4,
        pointStyle: 'rect',
        pointRadius: 4.5,
        pointHoverRadius: 6,
        pointBackgroundColor: points.map(p => p.isEstimate ? t.bg : t.amber),
        pointBorderColor: t.amber,
        pointBorderWidth: 1.4,
        fill: false,
        tension: 0,
        segment: {
          borderDash: ctx =>
            (points[ctx.p1DataIndex]?.isEstimate || points[ctx.p0DataIndex]?.isEstimate) ? [4, 3] : undefined,
        },
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1,
          titleColor: t.inkMute, bodyColor: t.amber, displayColors: false,
          callbacks: { label: c => ` ${c.parsed.y} L/100km${points[c.dataIndex]?.isEstimate ? ' (est.)' : ''}` },
        },
      },
      scales: {
        x: { grid: { color: t.grid }, border: { color: t.line }, ticks: { maxRotation: 0 } },
        y: {
          grid: { color: t.grid }, border: { color: t.line },
          ticks: { callback: v => v + 'L' },
          ...yBounds,
        },
      },
    },
    plugins: [factoryLinePlugin],
  })
}

// Monthly spend: dim outlined bars, current month solid amber.
export function makeMonthlyChart(canvas, months) {
  const t = tokens()
  const lastIdx = months.length - 1
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        data: months.map(m => m.total),
        backgroundColor: months.map((m, i) => i === lastIdx ? t.amber : t.amberDim),
        borderColor: months.map((m, i) => i === lastIdx ? t.amber : t.line),
        borderWidth: 1,
        borderRadius: 2,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1,
          titleColor: t.inkMute, bodyColor: t.amber, displayColors: false,
          callbacks: { label: c => ` €${c.parsed.y}` },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.line } },
        y: { grid: { color: t.grid }, border: { color: t.line }, ticks: { callback: v => '€' + v } },
      },
    },
  })
}
