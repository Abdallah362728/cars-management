// Global app state. Pages read it; mutations go through the helpers.

export const state = {
  cars: [],
  activeCar: null,
}

export function setCars(cars) {
  state.cars = cars || []
}

export function setActiveCar(car) {
  state.activeCar = car ?? null
}

export function activeCars() {
  return state.cars.filter(c => c.status === 'active')
}

// Advance to the next active car (used by the header switch button).
export function switchToNextCar() {
  const cars = activeCars()
  if (cars.length < 2) return
  const idx = cars.findIndex(c => c.id === state.activeCar?.id)
  state.activeCar = cars[(idx + 1) % cars.length]
}
