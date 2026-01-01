'use client'

import { useMemo, memo, useState, useRef, useEffect } from 'react'
import { Trash2, Edit2, Check, MessageSquare } from 'lucide-react'
import { HabitWithEntries, HabitEntry, Quarter, getQuarterDates } from '@/types/database'
import HabitGrid from './HabitGrid'
import { format, eachDayOfInterval, subDays, parseISO, startOfWeek, endOfWeek } from 'date-fns'

interface HabitCardProps {
  habit: HabitWithEntries
  quarter: Quarter
  year: number
  onDayClick?: (habitId: string, date: string) => void
  onNoteUpdate?: (habitId: string, date: string, note: string | null) => void
  onEdit?: (habit: HabitWithEntries) => void
  onDelete?: (habitId: string) => void
  readonly?: boolean
}

// Single day button with animation
function DayButton({
  date,
  label,
  entry,
  color,
  isToday,
  canSkip,
  onClick,
}: {
  date: string
  label: string
  entry?: HabitEntry
  color: string
  isToday: boolean
  canSkip: boolean
  onClick: (date: string) => void
}) {
  const [isAnimating, setIsAnimating] = useState(false)
  const isDone = entry?.status === 'done'
  const isSkipped = entry?.status === 'skipped'
  const isMissed = entry?.status === 'missed'
  const hasNote = !!entry?.note

  const handleClick = () => {
    setIsAnimating(true)
    onClick(date)
    setTimeout(() => setIsAnimating(false), 300)
  }

  // Determine background and border colors
  const getColors = () => {
    if (isDone) return { bg: color, border: color }
    if (isSkipped) return { bg: '#9ca3af', border: '#9ca3af' } // gray-400 (rest day)
    if (isMissed) return { bg: '#ef4444', border: '#ef4444' } // red-500
    return { bg: undefined, border: undefined }
  }
  const colors = getColors()

  // Get tooltip text based on whether skipping is allowed
  const getTooltip = () => {
    const dayLabel = isToday ? 'Today' : label
    if (isDone) {
      return canSkip
        ? `${dayLabel} - done (click for rest day)`
        : `${dayLabel} - done (click to mark missed)`
    }
    if (isSkipped) return `${dayLabel} - rest day (click to mark missed)`
    if (isMissed) return `${dayLabel} - missed (click to clear)`
    return `${dayLabel} - click to mark done`
  }

  return (
    <div className="group flex flex-col items-center gap-0.5">
      {/* Day label */}
      <span className={`text-[9px] font-medium ${isToday ? 'text-[var(--foreground)]' : 'text-[var(--muted-light)]'}`}>
        {label}
      </span>

      {/* Clickable circle */}
      <button
        onClick={handleClick}
        className="relative"
        title={getTooltip()}
      >
        <div
          className={`
            relative w-6 h-6 rounded-full flex items-center justify-center
            transition-all duration-200 ease-out cursor-pointer
            ${isAnimating ? 'scale-90' : 'scale-100 hover:scale-110'}
            ${isDone || isSkipped || isMissed
              ? 'shadow-sm'
              : 'border-2 border-[var(--card-border)] group-hover:border-[var(--accent-400)] bg-[var(--card-bg)] group-hover:bg-[var(--accent-bg)]'
            }
          `}
          style={{
            backgroundColor: colors.bg,
            borderColor: colors.border,
          }}
        >
          {isDone && (
            <Check
              size={12}
              className={`text-white transition-all duration-200 ${isAnimating ? 'scale-125' : 'scale-100'}`}
              strokeWidth={3}
            />
          )}
          {isSkipped && (
            <span className="text-white text-[10px] font-bold">–</span>
          )}
          {isMissed && (
            <span className="text-white text-[10px] font-bold">✕</span>
          )}

          {/* Ripple effect */}
          {isAnimating && !isDone && !isSkipped && !isMissed && (
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{ backgroundColor: color }}
            />
          )}
        </div>

        {/* Note indicator - small dot (not a button) */}
        {hasNote && (
          <div
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent-500)]"
            title="Has note"
          />
        )}
      </button>
    </div>
  )
}

// Recent days selector (today + past 3 days)
function RecentDaysSelector({
  entries,
  color,
  targetPerWeek,
  onDayClick,
}: {
  entries: HabitEntry[]
  color: string
  targetPerWeek: number
  onDayClick: (date: string) => void
}) {
  // Calculate allowed rest days per week
  const allowedRestDays = 7 - targetPerWeek

  const recentDays = useMemo(() => {
    const today = new Date()
    const days = []

    for (let i = 3; i >= 0; i--) {
      const date = subDays(today, i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dayOfWeek = format(date, 'EEE').toUpperCase().slice(0, 2)

      let label: string
      if (i === 0) {
        label = 'TODAY'
      } else if (i === 1) {
        label = 'YST'
      } else {
        label = dayOfWeek
      }

      days.push({
        date: dateStr,
        dateObj: date,
        label,
        isToday: i === 0,
      })
    }

    return days
  }, [])

  const getEntry = (date: string) => {
    return entries.find(e => e.date === date)
  }

  // Calculate if skipping is allowed for a specific date
  const canSkipForDate = (dateStr: string, dateObj: Date) => {
    if (allowedRestDays <= 0) return false

    const weekStartDate = startOfWeek(dateObj, { weekStartsOn: 1 })
    const weekEndDate = endOfWeek(dateObj, { weekStartsOn: 1 })
    const weekStartStr = format(weekStartDate, 'yyyy-MM-dd')
    const weekEndStr = format(weekEndDate, 'yyyy-MM-dd')

    // Count existing skipped entries in this week (excluding the current day)
    const skippedInWeek = entries.filter(e =>
      e.status === 'skipped' &&
      e.date >= weekStartStr &&
      e.date <= weekEndStr &&
      e.date !== dateStr
    ).length

    return skippedInWeek < allowedRestDays
  }

  return (
    <div className="flex items-end gap-1">
      {recentDays.map((day) => (
        <DayButton
          key={day.date}
          date={day.date}
          label={day.label}
          entry={getEntry(day.date)}
          color={color}
          isToday={day.isToday}
          canSkip={canSkipForDate(day.date, day.dateObj)}
          onClick={onDayClick}
        />
      ))}
    </div>
  )
}

// Memoized to prevent re-renders when parent state changes but props are the same
const HabitCard = memo(function HabitCard({
  habit,
  quarter,
  year,
  onDayClick,
  onNoteUpdate,
  onEdit,
  onDelete,
  readonly = false,
}: HabitCardProps) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const noteInputRef = useRef<HTMLInputElement>(null)

  // Get today's entry
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayEntry = useMemo(() => {
    return habit.entries.find(e => e.date === todayStr)
  }, [habit.entries, todayStr])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingNote && noteInputRef.current) {
      noteInputRef.current.focus()
    }
  }, [isEditingNote])

  // Start editing note
  const handleStartEditNote = () => {
    setNoteText(todayEntry?.note || '')
    setIsEditingNote(true)
  }

  // Save note
  const handleSaveNote = () => {
    if (onNoteUpdate && todayEntry) {
      const trimmed = noteText.trim()
      onNoteUpdate(habit.id, todayStr, trimmed || null)
    }
    setIsEditingNote(false)
  }

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

  return (
    <div className="glass-card p-4 transition-all hover:scale-[1.005]">
      {/* Header: Name + Stats + Day Buttons */}
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

        {/* Recent Days - Quick toggle for today and past 3 days */}
        {!readonly && onDayClick && (
          <RecentDaysSelector
            entries={habit.entries}
            color={habit.color}
            targetPerWeek={habit.target_per_week ?? 7}
            onDayClick={(date) => onDayClick(habit.id, date)}
          />
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

      {/* Footer: Note input + Edit/Delete buttons */}
      {!readonly && (
        <div className="pt-2 border-t border-[var(--card-border)]">
          {/* Note section - show if today has any entry (done or missed) */}
          {todayEntry && onNoteUpdate && (
            <div className="mb-2">
              {isEditingNote ? (
                <input
                  ref={noteInputRef}
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNote()
                    if (e.key === 'Escape') setIsEditingNote(false)
                  }}
                  onBlur={handleSaveNote}
                  placeholder="Add a note for today..."
                  className="w-full text-xs px-2 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] focus:border-[var(--accent-400)] focus:outline-none text-[var(--foreground)] placeholder-[var(--muted-light)]"
                  maxLength={100}
                />
              ) : (
                <button
                  onClick={handleStartEditNote}
                  className="w-full flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg hover:bg-[var(--card-bg)] transition-colors text-left group"
                >
                  <MessageSquare
                    size={12}
                    className={
                      todayEntry.note
                        ? todayEntry.status === 'missed' ? 'text-red-400' : 'text-[var(--accent-500)]'
                        : 'text-[var(--muted-light)]'
                    }
                  />
                  {todayEntry.note ? (
                    <span className="text-[var(--foreground)] truncate">{todayEntry.note}</span>
                  ) : (
                    <span className="text-[var(--muted-light)] group-hover:text-[var(--muted)]">
                      {todayEntry.status === 'missed' ? 'Add note (why missed?)...' :
                       todayEntry.status === 'skipped' ? 'Add note (rest day)...' : 'Add note for today...'}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Edit/Delete Buttons */}
          <div className="flex items-center justify-end gap-1">
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
        </div>
      )}
    </div>
  )
})

export default HabitCard
