'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Quarter } from '@/types/database'

interface QuarterSelectorProps {
  quarter: Quarter
  year: number
  onChange: (quarter: Quarter, year: number) => void
}

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

export default function QuarterSelector({
  quarter,
  year,
  onChange,
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
    <div className="glass-card inline-flex items-center gap-1 p-1.5">
      <button
        onClick={goToPrevious}
        className="pill-button p-2 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="text-center px-4 py-1">
        <div className="text-sm font-semibold text-[var(--foreground)]">
          {quarter} {year}
        </div>
        <div className="text-[10px] text-[var(--muted)]">{quarterLabels[quarter]}</div>
      </div>

      <button
        onClick={goToNext}
        className="pill-button p-2 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
