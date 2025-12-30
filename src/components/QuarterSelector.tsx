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
    <div className="flex items-center gap-3">
      <button
        onClick={goToPrevious}
        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <ChevronLeft size={20} />
      </button>

      <div className="text-center min-w-[160px]">
        <div className="text-xl font-bold text-white">
          {quarter} {year}
        </div>
        <div className="text-xs text-zinc-500">{quarterLabels[quarter]}</div>
        <div className="text-xs text-emerald-500 font-medium mt-0.5">90-day sprint</div>
      </div>

      <button
        onClick={goToNext}
        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  )
}
