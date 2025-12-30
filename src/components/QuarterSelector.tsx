'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Quarter } from '@/types/database'

interface QuarterSelectorProps {
  quarter: Quarter
  year: number
  onChange: (quarter: Quarter, year: number) => void
  compact?: boolean
}

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

export default function QuarterSelector({
  quarter,
  year,
  onChange,
  compact = false,
}: QuarterSelectorProps) {
  const currentIndex = quarters.indexOf(quarter)

  const goToPrevious = () => {
    if (currentIndex === 0) {
      onChange('Q4', year - 1)
    } else {
      onChange(quarters[currentIndex - 1], year)
    }
  }

  const goToNext = () => {
    if (currentIndex === 3) {
      onChange('Q1', year + 1)
    } else {
      onChange(quarters[currentIndex + 1], year)
    }
  }

  const quarterLabels: Record<Quarter, string> = {
    Q1: 'Jan - Mar',
    Q2: 'Apr - Jun',
    Q3: 'Jul - Sep',
    Q4: 'Oct - Dec',
  }

  return (
    <div className={`inline-flex items-center gap-0.5 ${compact ? 'bg-[var(--card-bg)] rounded-xl p-1' : 'glass-card p-1.5'}`}>
      <button
        onClick={goToPrevious}
        className={`pill-button text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors ${compact ? 'p-1.5' : 'p-2'}`}
      >
        <ChevronLeft size={compact ? 16 : 18} />
      </button>

      <div className={`text-center ${compact ? 'px-2' : 'px-4 py-1'}`}>
        <div className={`font-semibold text-[var(--foreground)] ${compact ? 'text-xs' : 'text-sm'}`}>
          {quarter} {year}
        </div>
        {!compact && (
          <div className="text-[10px] text-[var(--muted)]">{quarterLabels[quarter]}</div>
        )}
      </div>

      <button
        onClick={goToNext}
        className={`pill-button text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors ${compact ? 'p-1.5' : 'p-2'}`}
      >
        <ChevronRight size={compact ? 16 : 18} />
      </button>
    </div>
  )
}
