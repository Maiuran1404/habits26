'use client'

import { useMemo } from 'react'
import { Trash2, Edit2, Check, X, Circle } from 'lucide-react'
import { HabitWithEntries, Quarter, getQuarterDates } from '@/types/database'
import HabitGrid from './HabitGrid'
import { format, eachDayOfInterval, startOfWeek, endOfWeek, isWithinInterval, subDays, parseISO } from 'date-fns'

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

export default function HabitCard({
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
    <div className="bg-[var(--card-bg)] backdrop-blur rounded-xl p-4 sm:p-5 border border-[var(--card-border)] hover:border-[var(--card-hover-border)] transition-colors">
      {/* Header: Name + Large Checkbox */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-[var(--foreground)] text-lg truncate flex-1">
          {habit.name}
        </h3>

        {/* Large Today Checkbox - Top Right */}
        {!readonly && (
          <button
            onClick={() => onTodayClick?.(habit.id)}
            className="flex-shrink-0 ml-3"
            title={todayEntry?.status === 'done' ? 'Completed today' : todayEntry?.status === 'missed' ? 'Missed today' : 'Mark today as done'}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                todayEntry?.status === 'done'
                  ? 'shadow-md'
                  : todayEntry?.status === 'missed'
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'bg-[var(--card-border)]/50 hover:bg-[var(--card-border)] border border-[var(--card-border)]'
              }`}
              style={{
                backgroundColor: todayEntry?.status === 'done' ? habit.color : undefined,
              }}
            >
              {todayEntry?.status === 'done' ? (
                <Check size={18} className="text-white" />
              ) : todayEntry?.status === 'missed' ? (
                <X size={16} className="text-red-400" />
              ) : (
                <Check size={16} className="text-[var(--muted-light)]" />
              )}
            </div>
          </button>
        )}
      </div>

      {/* Stats Badges Row */}
      <div className="flex items-center gap-2 mb-4">
        <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-[var(--card-border)]/50 text-[var(--muted)]">
          Streak: {streak}
        </span>
        <span
          className="px-2 py-0.5 text-xs font-medium rounded-md"
          style={{
            backgroundColor: `${habit.color}20`,
            color: habit.color
          }}
        >
          {stats.percentage}%
        </span>
        <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-[var(--card-border)]/50 text-[var(--muted)]">
          {stats.completed} check-ins
        </span>
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

      {/* Edit/Delete Buttons - Bottom */}
      {!readonly && (
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--card-border)]/50">
          <button
            onClick={() => onEdit?.(habit)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-bg)] rounded-lg transition-colors border border-[var(--card-border)]"
          >
            <Edit2 size={14} />
            Edit
          </button>
          <button
            onClick={() => onDelete?.(habit.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/30"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
