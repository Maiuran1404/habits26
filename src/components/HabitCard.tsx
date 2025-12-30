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
    <div className="glass-card p-5 transition-all hover:scale-[1.01]">
      {/* Header: Name + Today Checkbox */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--foreground)] text-base truncate">
            {habit.name}
          </h3>
          {/* Stats Pills */}
          <div className="flex items-center gap-1.5">
            {streak > 0 && (
              <span className="pill-button px-2 py-0.5 text-[10px] font-medium bg-[var(--accent-bg)] text-[var(--accent-text)]">
                {streak} day{streak !== 1 ? 's' : ''}
              </span>
            )}
            <span
              className="pill-button px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${habit.color}20`,
                color: habit.color
              }}
            >
              {stats.percentage}%
            </span>
          </div>
        </div>

        {/* Today Checkbox */}
        {!readonly && (
          <button
            onClick={() => onTodayClick?.(habit.id)}
            className="flex-shrink-0 ml-2"
            title={todayEntry?.status === 'done' ? 'Completed today' : todayEntry?.status === 'missed' ? 'Missed today' : 'Mark today as done'}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                todayEntry?.status === 'done'
                  ? 'shadow-lg'
                  : todayEntry?.status === 'missed'
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'bg-[var(--card-bg)] hover:bg-[var(--accent-bg)] border border-[var(--card-border)]'
              }`}
              style={{
                backgroundColor: todayEntry?.status === 'done' ? habit.color : undefined,
                boxShadow: todayEntry?.status === 'done' ? `0 4px 14px ${habit.color}40` : undefined,
              }}
            >
              {todayEntry?.status === 'done' ? (
                <Check size={18} className="text-white" strokeWidth={2.5} />
              ) : todayEntry?.status === 'missed' ? (
                <X size={16} className="text-red-400" />
              ) : (
                <Circle size={16} className="text-[var(--muted-light)]" />
              )}
            </div>
          </button>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="mb-4">
        <HabitGrid
          entries={habit.entries}
          color={habit.color}
          quarter={quarter}
          year={year}
          onDayClick={readonly ? undefined : (date) => onDayClick?.(habit.id, date)}
          readonly={readonly}
        />
      </div>

      {/* Edit/Delete Buttons */}
      {!readonly && (
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--card-border)]">
          <button
            onClick={() => onEdit?.(habit)}
            className="pill-button flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
          >
            <Edit2 size={12} />
            Edit
          </button>
          <button
            onClick={() => onDelete?.(habit.id)}
            className="pill-button flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
})

export default HabitCard
