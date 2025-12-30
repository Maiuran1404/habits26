'use client'

import { useMemo } from 'react'
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, addMonths, isSameMonth } from 'date-fns'
import { HabitEntry, Quarter, getQuarterDates } from '@/types/database'

interface HabitGridProps {
  entries: HabitEntry[]
  color: string
  quarter: Quarter
  year: number
  onDayClick?: (date: string) => void
  readonly?: boolean
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function HabitGrid({
  entries,
  color,
  quarter,
  year,
  onDayClick,
  readonly = false,
}: HabitGridProps) {
  const { months, entryMap } = useMemo(() => {
    const { start, end } = getQuarterDates(year, quarter)

    // Create entry map for quick lookup
    const entryMap = new Map<string, HabitEntry>()
    entries.forEach((entry) => {
      entryMap.set(entry.date, entry)
    })

    // Get the three months of the quarter
    const months: { name: string; weeks: (Date | null)[][] }[] = []
    let currentDate = start

    for (let m = 0; m < 3; m++) {
      const monthStart = startOfMonth(currentDate)
      const monthEnd = endOfMonth(currentDate)
      const monthName = MONTH_NAMES[currentDate.getMonth()]

      // Get all days in this month
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

      // Organize into weeks
      const weeks: (Date | null)[][] = []
      let currentWeek: (Date | null)[] = []

      // Pad the start of the first week (Monday = 0, Sunday = 6)
      const firstDayOfWeek = (getDay(monthStart) + 6) % 7
      for (let i = 0; i < firstDayOfWeek; i++) {
        currentWeek.push(null)
      }

      daysInMonth.forEach((day) => {
        currentWeek.push(day)
        if (currentWeek.length === 7) {
          weeks.push(currentWeek)
          currentWeek = []
        }
      })

      // Pad the end of the last week
      if (currentWeek.length > 0) {
        while (currentWeek.length < 7) {
          currentWeek.push(null)
        }
        weeks.push(currentWeek)
      }

      months.push({ name: monthName, weeks })
      currentDate = addMonths(currentDate, 1)
    }

    return { months, entryMap }
  }, [entries, quarter, year])

  const today = format(new Date(), 'yyyy-MM-dd')
  const { start: quarterStart, end: quarterEnd } = getQuarterDates(year, quarter)

  return (
    <div className="w-full">
      {/* Three months in a row */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {months.map((month, monthIndex) => (
          <div key={month.name} className="flex flex-col">
            {/* Month header */}
            <div className="text-xs font-semibold text-[var(--muted)] mb-1.5 text-center">
              {month.name}
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 gap-[2px] mb-1">
              {DAY_LABELS.map((day, i) => (
                <div
                  key={`${month.name}-${day}-${i}`}
                  className="text-[9px] sm:text-[10px] text-[var(--muted-light)] text-center font-medium"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="flex flex-col gap-[2px]">
              {month.weeks.map((week, weekIndex) => (
                <div key={`${month.name}-week-${weekIndex}`} className="grid grid-cols-7 gap-[2px]">
                  {week.map((day, dayIndex) => {
                    if (!day) {
                      return (
                        <div
                          key={`empty-${monthIndex}-${weekIndex}-${dayIndex}`}
                          className="w-3 h-3 sm:w-3.5 sm:h-3.5"
                        />
                      )
                    }

                    const dateStr = format(day, 'yyyy-MM-dd')
                    const entry = entryMap.get(dateStr)
                    const isToday = dateStr === today
                    const isFuture = dateStr > today
                    const isInQuarter = dateStr >= format(quarterStart, 'yyyy-MM-dd') &&
                                       dateStr <= format(quarterEnd, 'yyyy-MM-dd')

                    let bgStyle = 'bg-[var(--card-border)]/50'
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
                      bgStyle = 'bg-[var(--card-border)]/20'
                    } else if (!isInQuarter) {
                      bgStyle = 'bg-[var(--card-border)]/10'
                    }

                    return (
                      <button
                        key={dateStr}
                        onClick={() => !readonly && !isFuture && onDayClick?.(dateStr)}
                        disabled={readonly || isFuture}
                        className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-[3px] transition-all ${
                          !readonly && !isFuture ? 'hover:scale-125 hover:z-10 cursor-pointer' : ''
                        } ${isToday ? 'ring-1 ring-[var(--foreground)] ring-offset-1 ring-offset-[var(--card-bg)]' : ''} ${bgStyle}`}
                        style={{
                          backgroundColor: customBg,
                        }}
                        title={`${format(day, 'EEE, MMM d')}${entry ? ` - ${entry.status}` : ''}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
