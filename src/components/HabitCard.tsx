'use client'

import { useMemo, memo } from 'react'
import { Trash2, Edit2, Check, X, Circle } from 'lucide-react'
import { HabitWithEntries, Quarter, getQuarterDates } from '@/types/database'
import HabitGrid from './HabitGrid'
import { format, eachDayOfInterval, subDays, parseISO } from 'date-fns'

interface HabitCardProps {
  habit: HabitWithEntries
  quarter: Quarter
  year: number
  onDayClick?: (habitId: string, date: string) => void
  onTodayClick?: (habitId: string) => void
  onEdit?: (habit: HabitWithEntries) => void
  onDelete?: (habitId: string) => void
  readonly?: boolean
}

// Memoized to prevent re-renders when parent state changes but props are the same
const HabitCard = memo(function HabitCard({
  habit,
  quarter,
  year,
  onDayClick,
  onTodayClick,
  onEdit,
  onDelete,
  readonly = false,
}: HabitCardProps) {
  // Calculate streak (consecutive days ending today or yesterday)
  const streak = useMemo(() => {
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd')

    // Sort entries by date descending
    const sortedDoneEntries = habit.entries
      .filter((e) => e.status === 'done')
      .map((e) => e.date)
      .sort((a, b) => b.localeCompare(a))

    if (sortedDoneEntries.length === 0) return 0

    // Check if streak is active (completed today or yesterday)
    const lastDate = sortedDoneEntries[0]
    if (lastDate !== todayStr && lastDate !== yesterdayStr) return 0

    let count = 1
    let currentDate = parseISO(lastDate)

    for (let i = 1; i < sortedDoneEntries.length; i++) {
      const expectedPrev = format(subDays(currentDate, 1), 'yyyy-MM-dd')
      if (sortedDoneEntries[i] === expectedPrev) {
        count++
        currentDate = parseISO(sortedDoneEntries[i])
      } else {
        break
      }
    }

    return count
  }, [habit.entries])

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

  // Today's entry status
  const todayEntry = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    return habit.entries.find((e) => e.date === todayStr)
  }, [habit.entries])

  return (
    <div className="glass-card p-4 transition-all hover:scale-[1.005]">
      {/* Header: Name + Stats + Today Checkbox */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Color indicator */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: habit.color }}
          />
          <h3 className="font-medium text-[var(--foreground)] text-sm truncate">
            {habit.name}
          </h3>
          {/* Stats Pills - minimal */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {streak > 0 && (
              <span className="text-[10px] font-medium text-[var(--accent-text)]">
                {streak}d
              </span>
            )}
            <span
              className="text-[10px] font-medium"
              style={{ color: habit.color }}
            >
              {stats.percentage}%
            </span>
          </div>
        </div>

        {/* Today Checkbox */}
        {!readonly && (
          <button
            onClick={() => onTodayClick?.(habit.id)}
            className="flex-shrink-0"
            title={todayEntry?.status === 'done' ? 'Completed today' : todayEntry?.status === 'missed' ? 'Missed today' : 'Mark today as done'}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                todayEntry?.status === 'done'
                  ? ''
                  : todayEntry?.status === 'missed'
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'bg-[var(--card-bg)] hover:bg-[var(--accent-bg)] border border-[var(--card-border)]'
              }`}
              style={{
                backgroundColor: todayEntry?.status === 'done' ? habit.color : undefined,
              }}
            >
              {todayEntry?.status === 'done' ? (
                <Check size={14} className="text-white" strokeWidth={2.5} />
              ) : todayEntry?.status === 'missed' ? (
                <X size={12} className="text-red-400" />
              ) : (
                <Circle size={12} className="text-[var(--muted-light)]" />
              )}
            </div>
          </button>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="mb-3">
        <HabitGrid
          entries={habit.entries}
          color={habit.color}
          quarter={quarter}
          year={year}
          onDayClick={readonly ? undefined : (date) => onDayClick?.(habit.id, date)}
          readonly={readonly}
        />
      </div>

      {/* Edit/Delete Buttons - More subtle */}
      {!readonly && (
        <div className="flex items-center justify-end gap-1 pt-2 border-t border-[var(--card-border)]">
          <button
            onClick={() => onEdit?.(habit)}
            className="pill-button p-1.5 text-[var(--muted-light)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
            title="Edit habit"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => onDelete?.(habit.id)}
            className="pill-button p-1.5 text-[var(--muted-light)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete habit"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  )
})

export default HabitCard
