'use client'

import { useMemo } from 'react'
import { format, eachDayOfInterval, getDay } from 'date-fns'
import { HabitEntry, Quarter, getQuarterDates } from '@/types/database'

interface HabitGridProps {
  entries: HabitEntry[]
  color: string
  quarter: Quarter
  year: number
  onDayClick?: (date: string) => void
  readonly?: boolean
}

export default function HabitGrid({
  entries,
  color,
  quarter,
  year,
  onDayClick,
  readonly = false,
}: HabitGridProps) {
  const { days, entryMap } = useMemo(() => {
    const { start, end } = getQuarterDates(year, quarter)
    const allDays = eachDayOfInterval({ start, end })

    const entryMap = new Map<string, HabitEntry>()
    entries.forEach((entry) => {
      entryMap.set(entry.date, entry)
    })

    return { days: allDays, entryMap }
  }, [entries, quarter, year])

  const weeks = useMemo(() => {
    const result: (Date | null)[][] = []
    let currentWeek: (Date | null)[] = []

    // Pad the start of the first week
    const firstDay = days[0]
    const startPadding = getDay(firstDay)
    for (let i = 0; i < startPadding; i++) {
      currentWeek.push(null)
    }

    days.forEach((day) => {
      currentWeek.push(day)
      if (currentWeek.length === 7) {
        result.push(currentWeek)
        currentWeek = []
      }
    })

    // Pad the end of the last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      result.push(currentWeek)
    }

    return result
  }, [days])

  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
      {weeks.map((week, weekIndex) =>
        week.map((day, dayIndex) => {
          if (!day) {
            return (
              <div
                key={`empty-${weekIndex}-${dayIndex}`}
                className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm"
              />
            )
          }

          const dateStr = format(day, 'yyyy-MM-dd')
          const entry = entryMap.get(dateStr)
          const isToday = dateStr === today
          const isFuture = dateStr > today

          let bgStyle = 'bg-[var(--card-border)]'
          let customBg: string | undefined

          if (entry) {
            if (entry.status === 'done') {
              bgStyle = ''
              customBg = color
            } else if (entry.status === 'missed') {
              bgStyle = 'bg-red-500/60'
            } else if (entry.status === 'skipped') {
              bgStyle = 'bg-[var(--muted-light)]/50'
            }
          } else if (isFuture) {
            bgStyle = 'bg-[var(--card-border)]/30'
          }

          return (
            <button
              key={dateStr}
              onClick={() => !readonly && onDayClick?.(dateStr)}
              disabled={readonly || isFuture}
              className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm transition-all ${
                !readonly && !isFuture ? 'hover:scale-110 cursor-pointer' : ''
              } ${isToday ? 'ring-1 ring-[var(--foreground)]/50' : ''} ${bgStyle}`}
              style={{
                backgroundColor: customBg,
              }}
              title={`${format(day, 'MMM d, yyyy')}${entry ? ` - ${entry.status}` : ''}`}
            />
          )
        })
      )}
    </div>
  )
}
