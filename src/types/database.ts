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
  created_at: string
  archived: boolean
}

export interface HabitEntry {
  id: string
  habit_id: string
  date: string
  status: 'done' | 'missed' | 'skipped'
  created_at: string
}

export interface Partnership {
  id: string
  user_id: string
  partner_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
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
