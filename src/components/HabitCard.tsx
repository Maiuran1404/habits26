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

  // Weekly stats calculation
  const weeklyStats = useMemo(() => {
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 }) // Sunday

    const completedThisWeek = habit.entries.filter(
      (e) => e.status === 'done' &&
             isWithinInterval(new Date(e.date), { start: weekStart, end: weekEnd })
    ).length

    const target = habit.target_per_week || 7

    return {
      completed: completedThisWeek,
      target,
      isDaily: target === 7,
    }
  }, [habit.entries, habit.target_per_week])

  // Today's entry status
  const todayEntry = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    return habit.entries.find((e) => e.date === todayStr)
  }, [habit.entries])

  return (
    <div className="bg-[var(--card-bg)] backdrop-blur rounded-xl p-4 sm:p-5 border border-[var(--card-border)] hover:border-[var(--card-hover-border)] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--foreground)] text-lg truncate">{habit.name}</h3>
          {habit.description && (
            <p className="text-[var(--muted)] text-sm mt-1 line-clamp-2">{habit.description}</p>
          )}
        </div>

        {!readonly && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => onEdit?.(habit)}
              className="p-1.5 text-[var(--muted-light)] hover:text-[var(--foreground)] hover:bg-[var(--accent-bg)] rounded-lg transition-colors"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => onDelete?.(habit.id)}
              className="p-1.5 text-[var(--muted-light)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
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

      {/* Stats and Today Button Row */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]/50">
        <div className="flex items-center gap-4">
          {/* Main Stats */}
          <div className="text-center">
            <div
              className="text-2xl font-bold"
              style={{ color: habit.color }}
            >
              {stats.percentage}%
            </div>
            <div className="text-xs text-[var(--muted-light)]">
              {stats.completed}/{stats.total} days
            </div>
          </div>

          {/* Weekly Stats */}
          {!weeklyStats.isDaily && (
            <div className="text-center pl-4 border-l border-[var(--card-border)]/50">
              <div className="text-lg font-semibold text-[var(--foreground)]">
                {weeklyStats.completed}/{weeklyStats.target}
              </div>
              <div className="text-xs text-[var(--muted-light)]">
                this week
              </div>
            </div>
          )}
        </div>

        {/* Mark Today Button */}
        {!readonly && (
          <button
            onClick={() => onTodayClick?.(habit.id)}
            className="flex-shrink-0"
            title={todayEntry?.status === 'done' ? 'Completed today' : todayEntry?.status === 'missed' ? 'Missed today' : 'Mark today'}
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                todayEntry?.status === 'done'
                  ? 'shadow-lg'
                  : todayEntry?.status === 'missed'
                  ? 'bg-red-500/20'
                  : 'bg-[var(--card-border)] hover:bg-[var(--card-hover-border)]'
              }`}
              style={{
                backgroundColor: todayEntry?.status === 'done' ? habit.color : undefined,
              }}
            >
              {todayEntry?.status === 'done' ? (
                <Check size={24} className="text-white" />
              ) : todayEntry?.status === 'missed' ? (
                <X size={24} className="text-red-400" />
              ) : (
                <Circle size={24} className="text-[var(--muted-light)]" />
              )}
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
