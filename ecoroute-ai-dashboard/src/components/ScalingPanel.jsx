import { ArrowRight, ServerCog, Zap, CheckCircle2 } from 'lucide-react'

export default function ScalingPanel({ current, required }) {
  const currentCount = Number(current ?? 0)
  const requiredCount = Number(required ?? currentCount)
  const additional = Math.max(0, requiredCount - currentCount)

  const needsScaleUp = additional > 0
  const needsScaleDown = requiredCount < currentCount

  const decisionText = needsScaleUp
    ? 'Scale-up recommended'
    : needsScaleDown
      ? 'Scale-down recommended'
      : 'Capacity matches target'

  const decisionDescription = needsScaleUp
    ? `Prepare ${additional} additional instance${additional === 1 ? '' : 's'} before the predicted traffic peak.`
    : needsScaleDown
      ? `The target is ${Math.abs(requiredCount - currentCount)} fewer instance${Math.abs(requiredCount - currentCount) === 1 ? '' : 's'}.`
      : 'The current instance count matches the required count.'

  return (
    <section className="panel scaling-panel" id="auto-scaling">
      <div className="panel-heading">
        <div>
          <h2>Auto-Scaling Decision</h2>
          <p>Control Plane recommendation based on predicted workload</p>
        </div>

        <span className="decision-pill">
          {needsScaleUp ? <Zap size={14} /> : <CheckCircle2 size={14} />}
          {needsScaleUp ? 'Action recommended' : 'No scale-up needed'}
        </span>
      </div>

      <div className="scale-content">
        <div className="scale-flow">
          <div className="scale-node">
            <span>Current</span>
            <strong>{currentCount}</strong>
            <small>instances</small>
          </div>

          <ArrowRight className="scale-arrow" size={24} />

          <div className="scale-node recommended">
            <span>Required</span>
            <strong>{requiredCount}</strong>
            <small>instances</small>
          </div>
        </div>

        <div className="scale-message">
          <div className="scale-icon">
            {needsScaleUp ? <ServerCog size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div>
            <b>{decisionText}</b>
            <p>{decisionDescription}</p>
          </div>
        </div>

        <div className="capacity-bar">
          <div className="bar-label">
            <span>Instance target</span>
            <b>{currentCount} / {requiredCount}</b>
          </div>

          <div className="bar">
            <i
              style={{
                width: `${requiredCount > 0
                  ? Math.min(100, (currentCount / requiredCount) * 100)
                  : 100}%`,
              }}
            />
          </div>

          <small>
            {needsScaleUp
              ? `${additional} more instance${additional === 1 ? '' : 's'} required to reach the target.`
              : needsScaleDown
                ? 'The current count is above the target. No instances are removed by this panel.'
                : 'The current instance count matches the target.'}
          </small>
        </div>
      </div>
    </section>
  )
}