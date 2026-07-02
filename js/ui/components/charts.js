// Chart.js lifecycle management. Pages create one manager per module and
// destroy all instances in cleanup() — combined with the router's epoch
// guard this prevents charts leaking onto removed canvases.

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
