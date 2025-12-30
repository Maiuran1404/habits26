'use client'

import { useMemo } from 'react'
import { Trash2, Edit2, Check, X, Circle } from 'lucide-react'
import { HabitWithEntries, Quarter, getQuarterDates } from '@/types/database'
import HabitGrid from './HabitGrid'
import { format, eachDayOfInterval, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'

interface HabitCardProps {
  habit: HabitWithEntries
  quarter: Quarter
  year: number
  onDayClick?: (habitId: string, date: string) => void
  onEdit?: (habit: HabitWithEntries) => void
  onDelete?: (habitId: string) => void
  readonly?: boolean
}

export default function HabitCard({
  habit,
  quarter,
  year,
  onDayClick,
  onEdit,
  onDelete,
  readonly = false,
}: HabitCardProps) {
  const stats = useMemo(() => {
    const { start, end } = getQuarterDates(year, quarter)
    const today = new Date()
    const effectiveEnd = end > today ? today : end

    if (start > today) {
      return { completed: 0, total: 0, percentage: 0 }
    }

    const daysInRange = eachDayOfInterval({
      start,
      end: effectiveEnd
    })

    const completed = habit.entries.filter(
      (e) => e.status === 'done' &&
             e.date >= format(start, 'yyyy-MM-dd') &&
             e.date <= format(effectiveEnd, 'yyyy-MM-dd')
    ).length

    return {
      completed,
      total: daysInRange.length,
      percentage: daysInRange.length > 0
        ? Math.round((completed / daysInRange.length) * 100)
        : 0,
    }
  }, [habit.entries, quarter, year])

  return (
    <div className="bg-zinc-900/80 backdrop-blur rounded-xl p-4 sm:p-5 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-lg truncate">{habit.name}</h3>
          {habit.description && (
            <p className="text-zinc-400 text-sm mt-1 line-clamp-2">{habit.description}</p>
          )}
        </div>

        {!readonly && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => onEdit?.(habit)}
              className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => onDelete?.(habit.id)}
              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <HabitGrid
            entries={habit.entries}
            color={habit.color}
            quarter={quarter}
            year={year}
            onDayClick={readonly ? undefined : (date) => onDayClick?.(habit.id, date)}
            readonly={readonly}
          />
        </div>

        <div className="flex-shrink-0">
          <div
            className="text-2xl font-bold"
            style={{ color: habit.color }}
          >
            {stats.percentage}%
          </div>
          <div className="text-xs text-zinc-500">
            {stats.completed}/{stats.total}
          </div>
        </div>
      </div>
    </div>
  )
}
