-- Supabase Schema for Habit Tracker App
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habits table
CREATE TABLE habits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#22c55e',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE
);

-- Habit entries table (daily tracking)
CREATE TABLE habit_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('done', 'missed', 'skipped')) DEFAULT 'done',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(habit_id, date)
);

-- Partnerships table (for tracking with friends)
CREATE TABLE partnerships (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  partner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, partner_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_habit_entries_habit_id ON habit_entries(habit_id);
CREATE INDEX idx_habit_entries_date ON habit_entries(date);
CREATE INDEX idx_partnerships_user_id ON partnerships(user_id);
CREATE INDEX idx_partnerships_partner_id ON partnerships(partner_id);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnerships ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view partner profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT partner_id FROM partnerships
      WHERE user_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT user_id FROM partnerships
      WHERE partner_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Habits policies
CREATE POLICY "Users can view their own habits"
  ON habits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view partner habits"
  ON habits FOR SELECT
  USING (
    user_id IN (
      SELECT partner_id FROM partnerships
      WHERE user_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT user_id FROM partnerships
      WHERE partner_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "Users can insert their own habits"
  ON habits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habits"
  ON habits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habits"
  ON habits FOR DELETE
  USING (auth.uid() = user_id);

-- Habit entries policies
CREATE POLICY "Users can view their own habit entries"
  ON habit_entries FOR SELECT
  USING (
    habit_id IN (SELECT id FROM habits WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can view partner habit entries"
  ON habit_entries FOR SELECT
  USING (
    habit_id IN (
      SELECT id FROM habits WHERE user_id IN (
        SELECT partner_id FROM partnerships
        WHERE user_id = auth.uid() AND status = 'accepted'
        UNION
        SELECT user_id FROM partnerships
        WHERE partner_id = auth.uid() AND status = 'accepted'
      )
    )
  );

CREATE POLICY "Users can insert their own habit entries"
  ON habit_entries FOR INSERT
  WITH CHECK (
    habit_id IN (SELECT id FROM habits WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their own habit entries"
  ON habit_entries FOR UPDATE
  USING (
    habit_id IN (SELECT id FROM habits WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete their own habit entries"
  ON habit_entries FOR DELETE
  USING (
    habit_id IN (SELECT id FROM habits WHERE user_id = auth.uid())
  );

-- Partnerships policies
CREATE POLICY "Users can view their partnerships"
  ON partnerships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = partner_id);

CREATE POLICY "Users can create partnership requests"
  ON partnerships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update partnerships they're part of"
  ON partnerships FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = partner_id);

CREATE POLICY "Users can delete their own partnership requests"
  ON partnerships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = partner_id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to find user by email (for partnerships)
CREATE OR REPLACE FUNCTION find_user_by_email(search_email TEXT)
RETURNS TABLE (id UUID, email TEXT, display_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.email, p.display_name
  FROM profiles p
  WHERE p.email = search_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
