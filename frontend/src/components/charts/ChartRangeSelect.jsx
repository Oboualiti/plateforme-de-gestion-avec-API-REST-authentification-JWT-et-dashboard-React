import { Select } from '../ui/select'
import { CHART_RANGE_OPTIONS } from '../../lib/chartRanges'

function ChartRangeSelect({ value, onChange, className = '' }) {
  return (
    <div className={className}>
      <Select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="[&>button]:h-9 [&>button]:min-w-[140px] [&>button]:border [&>button]:border-ink/10 [&>button]:bg-surface-2 [&>button]:px-3 [&>button]:text-xs [&>button]:font-semibold"
      >
        {CHART_RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

export default ChartRangeSelect

