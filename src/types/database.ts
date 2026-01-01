export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface Habit {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  target_per_week: number
  created_at: string
  archived: boolean
  goal_metric: string | null
}

// Points calculation constants
export const POINTS_PER_DONE = 3
export const MAX_POINTS_PER_HABIT_PER_WEEK = 21 // 7 days * 3 points

export interface HabitEntry {
  id: string
  habit_id: string
  date: string
  status: 'done' | 'missed' | 'skipped'
  note: string | null
  created_at: string
}

export interface Partnership {
  id: string
  user_id: string
  partner_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export type GoalType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Goal {
  id: string
  user_id: string
  title: string
  type: GoalType
  completed: boolean
  created_at: string
  quarter?: Quarter | null
  year?: number | null
  week_start?: string | null
}

export interface PartnerWithProfile extends Partnership {
  partner: Profile
}

export interface HabitWithEntries extends Habit {
  entries: HabitEntry[]
}

export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export function getQuarterDates(year: number, quarter: Quarter): { start: Date; end: Date } {
  const quarterMap = {
    Q1: { startMonth: 0, endMonth: 2 },
    Q2: { startMonth: 3, endMonth: 5 },
    Q3: { startMonth: 6, endMonth: 8 },
    Q4: { startMonth: 9, endMonth: 11 },
  }

  const { startMonth, endMonth } = quarterMap[quarter]
  const start = new Date(year, startMonth, 1)
  const end = new Date(year, endMonth + 1, 0)

  return { start, end }
}

export function getCurrentQuarter(): Quarter {
  const month = new Date().getMonth()
  if (month < 3) return 'Q1'
  if (month < 6) return 'Q2'
  if (month < 9) return 'Q3'
  return 'Q4'
}
