-- SocialForge Initial Database Schema
-- Version: 1.0.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Credits table: tracks user subscription and available credits
CREATE TABLE IF NOT EXISTS credits (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  text_credits INTEGER NOT NULL DEFAULT 10,
  image_credits INTEGER NOT NULL DEFAULT 0,
  video_credits INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  credits_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generations table: logs all content generations for analytics
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video')),
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'twitter', 'facebook', 'instagram', 'tiktok')),
  context_type TEXT NOT NULL CHECK (context_type IN ('product', 'article', 'video', 'social', 'general')),
  tone TEXT CHECK (tone IN ('professional', 'casual', 'humorous', 'promotional', 'educational')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drafts table: saved content for later use
CREATE TABLE IF NOT EXISTS drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'twitter', 'facebook', 'instagram', 'tiktok')),
  image_url TEXT,
  context_url TEXT,
  context_title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_created_at ON drafts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credits
CREATE POLICY "Users can view own credits"
  ON credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits"
  ON credits FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for generations
CREATE POLICY "Users can view own generations"
  ON generations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generations"
  ON generations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for drafts
CREATE POLICY "Users can view own drafts"
  ON drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drafts"
  ON drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
  ON drafts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts"
  ON drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Function to create initial credits for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO credits (user_id, text_credits, image_credits, video_credits, plan)
  VALUES (NEW.id, 10, 0, 0, 'free');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create credits on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_credits_updated_at
  BEFORE UPDATE ON credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_drafts_updated_at
  BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to deduct credits (called by edge functions)
CREATE OR REPLACE FUNCTION deduct_credit(
  p_user_id UUID,
  p_credit_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  -- Get current credits based on type
  IF p_credit_type = 'text' THEN
    SELECT text_credits INTO v_credits FROM credits WHERE user_id = p_user_id;
    IF v_credits > 0 THEN
      UPDATE credits SET text_credits = text_credits - 1 WHERE user_id = p_user_id;
      RETURN TRUE;
    END IF;
  ELSIF p_credit_type = 'image' THEN
    SELECT image_credits INTO v_credits FROM credits WHERE user_id = p_user_id;
    IF v_credits > 0 THEN
      UPDATE credits SET image_credits = image_credits - 1 WHERE user_id = p_user_id;
      RETURN TRUE;
    END IF;
  ELSIF p_credit_type = 'video' THEN
    SELECT video_credits INTO v_credits FROM credits WHERE user_id = p_user_id;
    IF v_credits > 0 THEN
      UPDATE credits SET video_credits = video_credits - 1 WHERE user_id = p_user_id;
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
