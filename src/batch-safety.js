import { analyzeMotionDynamics } from './motion-analysis.js'

// The blank may overhang the machine travel. The caller checks actual carriage
// coordinates and collisions. Dynamics are estimates for operator review.
export const validateManualBatchNc = ({ nc, limits, maximumFeed = 300 }) => {
  const dynamics = analyzeMotionDynamics(nc, {
    maximumFeed, acceleration: 100,
    limits: { X: Number(limits.x), Y: Number(limits.y), A: Number(limits.a), Z: Number(limits.z) }
  })
  const estimatedRisks = dynamics.findings.filter(finding => finding.severity === 'danger'
    && !/Межа|Швидкість/.test(finding.type))
  const warnings = estimatedRisks.length
    ? [`ОЦІНОЧНЕ ПОПЕРЕДЖЕННЯ: ${estimatedRisks.length} небезпечних рухів, ${dynamics.burnThroughRiskCount} зон ризику пропалу; перший — рядок ${estimatedRisks[0].lineNumber}. Перевірте симуляцію й холодний прогін`]
    : []
  return { valid: true, errors: [], warnings, dynamics }
}
