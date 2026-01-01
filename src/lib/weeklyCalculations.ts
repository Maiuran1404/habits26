import { HabitWithEntries, HabitEntry, POINTS_PER_DONE, MAX_POINTS_PER_HABIT_PER_WEEK } from '@/types/database'
import { format, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, isAfter } from 'date-fns'

// Day column data for the grid
export interface DayColumnData {
  date: Date
  dateStr: string
  dayLabel: string
  isToday: boolean
  isFuture: boolean
}

// Weekly data for a single habit
export interface WeeklyHabitData {
  habit: HabitWithEntries
  dailyEntries: Map<string, HabitEntry | null>
  weeklyPoints: number
  weeklyDoneCount: number
}

// Weekly data for a user
export interface UserWeeklyData {
  userId: string
  displayName: string
  email: string
  habits: WeeklyHabitData[]
  totalWeeklyPoints: number
  totalMaxPoints: number
  weeklyPercentage: number
}

// Generate week day columns
export function getWeekDays(weekStart: Date): DayColumnData[] {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const today = new Date()

  return eachDayOfInterval({ start: weekStart, end: weekEnd }).map(date => ({
    date,
    dateStr: format(date, 'yyyy-MM-dd'),
    dayLabel: format(date, 'EEE'),
    isToday: isSameDay(date, today),
    isFuture: isAfter(date, today)
  }))
}

// Calculate points for a single entry
export function getEntryPoints(entry: HabitEntry | null | undefined): number {
  if (!entry) return 0
  return entry.status === 'done' ? POINTS_PER_DONE : 0
}

// Calculate weekly data for a single habit
export function calculateWeeklyHabitData(
  habit: HabitWithEntries,
  weekDays: DayColumnData[]
): WeeklyHabitData {
  const dailyEntries = new Map<string, HabitEntry | null>()
  let weeklyPoints = 0
  let weeklyDoneCount = 0

  weekDays.forEach(day => {
    const entry = habit.entries.find(e => e.date === day.dateStr) || null
    dailyEntries.set(day.dateStr, entry)

    if (entry?.status === 'done') {
      weeklyPoints += POINTS_PER_DONE
      weeklyDoneCount++
    }
  })

  return {
    habit,
    dailyEntries,
    weeklyPoints,
    weeklyDoneCount
  }
}

// Calculate weekly data for a user
export function calculateUserWeeklyData(
  userId: string,
  displayName: string,
  email: string,
  habits: HabitWithEntries[],
  weekDays: DayColumnData[]
): UserWeeklyData {
  const weeklyHabits = habits.map(h => calculateWeeklyHabitData(h, weekDays))

  const totalWeeklyPoints = weeklyHabits.reduce((sum, h) => sum + h.weeklyPoints, 0)
  const totalMaxPoints = habits.length * MAX_POINTS_PER_HABIT_PER_WEEK
  const weeklyPercentage = totalMaxPoints > 0
    ? Math.round((totalWeeklyPoints / totalMaxPoints) * 100)
    : 0

  return {
    userId,
    displayName,
    email,
    habits: weeklyHabits,
    totalWeeklyPoints,
    totalMaxPoints,
    weeklyPercentage
  }
}

// Get status display info
export function getStatusDisplay(entry: HabitEntry | null, isFuture: boolean): {
  icon: string
  className: string
  label: string
} {
  if (isFuture) {
    return { icon: '', className: 'bg-[var(--card-border)]/30', label: 'future' }
  }

  if (!entry) {
    return { icon: '', className: 'bg-[var(--card-bg)] border border-[var(--card-border)]', label: 'not tracked' }
  }

  switch (entry.status) {
    case 'done':
      return { icon: '✓', className: 'bg-emerald-500 text-white', label: 'done' }
    case 'skipped':
      return { icon: '–', className: 'bg-gray-400 text-white', label: 'rest day' }
    case 'missed':
      return { icon: '✕', className: 'bg-red-500 text-white', label: 'missed' }
    default:
      return { icon: '', className: 'bg-[var(--card-bg)]', label: 'unknown' }
  }
}

// Format points display
export function formatPoints(points: number, maxPoints: number): string {
  return `${points}/${maxPoints}`
}
