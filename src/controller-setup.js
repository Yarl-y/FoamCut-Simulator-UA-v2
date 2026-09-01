export function calculateCalibratedSteps(currentSteps, commandedDistance, measuredDistance) {
  const current = Number(currentSteps)
  const commanded = Math.abs(Number(commandedDistance))
  const measured = Math.abs(Number(measuredDistance))
  if (![current, commanded, measured].every(Number.isFinite) || current <= 0 || commanded <= 0 || measured <= 0) {
    throw new Error('Для калібрування потрібні додатні кроки/мм та дві відстані')
  }
  return current * commanded / measured
}

export function createControllerPlan({ profile, controller, checks, notes = '' }) {
  return {
    format: 'FoamCut Simulator controller setup plan',
    version: 1,
    createdAt: new Date().toISOString(),
    controller,
    machine: profile,
    verification: { ...checks },
    notes,
    fluidNcConfiguration: {
      ready: false,
      reason: 'Потрібні точна модель контролера, карта контактів STEP/DIR/ENABLE та параметри драйверів.'
    }
  }
}
