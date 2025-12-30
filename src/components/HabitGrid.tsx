'use client'

import { useMemo } from 'react'
import { format, eachDayOfInterval, startOfWeek, getDay } from 'date-fns'
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
          const isPast = dateStr < today
          const isFuture = dateStr > today

          let bgColor = 'bg-zinc-800'
          let opacity = '0.3'

          if (entry) {
            if (entry.status === 'done') {
              bgColor = ''
              opacity = '1'
            } else if (entry.status === 'missed') {
              bgColor = 'bg-red-500'
              opacity = '0.6'
            } else if (entry.status === 'skipped') {
              bgColor = 'bg-zinc-600'
              opacity = '0.5'
            }
          } else if (isFuture) {
            bgColor = 'bg-zinc-800/30'
            opacity = '0.2'
          }

          return (
            <button
              key={dateStr}
              onClick={() => !readonly && onDayClick?.(dateStr)}
              disabled={readonly || isFuture}
              className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm transition-all ${
                !readonly && !isFuture ? 'hover:scale-110 cursor-pointer' : ''
              } ${isToday ? 'ring-1 ring-white/50' : ''} ${bgColor}`}
              style={{
                backgroundColor: entry?.status === 'done' ? color : undefined,
                opacity: entry?.status === 'done' ? 1 : undefined,
              }}
              title={`${format(day, 'MMM d, yyyy')}${entry ? ` - ${entry.status}` : ''}`}
            />
          )
        })
      )}
    </div>
  )
}
