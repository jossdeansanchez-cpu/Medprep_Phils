// Shared application types mirroring the database schema.

export type Role = "student" | "admin";
export type ExamMode = "mock" | "practice";
export type AttemptStatus = "in_progress" | "submitted";

export type OptionLabel = "A" | "B" | "C" | "D" | "E";

export interface QuestionOption {
  label: OptionLabel;
  text: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  order: number;
}

export interface Question {
  id: string;
  subject_id: string;
  stem: string;
  options: QuestionOption[];
  correct_label: OptionLabel;
  explanation: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ExamTemplate {
  id: string;
  title: string;
  mode: ExamMode;
  category: import("@/lib/categories").ExamCategory;
  questions_per_subject: number;
  time_limit_minutes: number | null;
  pass_average: number;
  min_subject_score: number;
  subject_ids: string[] | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ExamAttempt {
  id: string;
  user_id: string;
  template_id: string;
  started_at: string;
  submitted_at: string | null;
  status: AttemptStatus;
  general_average: number | null;
  passed: boolean | null;
}

export interface AttemptQuestion {
  id: string;
  attempt_id: string;
  question_id: string;
  subject_id: string;
  position: number;
  selected_label: OptionLabel | null;
  is_correct: boolean | null;
}

/** Question shape sent to the client mid-exam — answers stripped. */
export interface SafeQuestion {
  attempt_question_id: string;
  question_id: string;
  subject_id: string;
  subject_name: string;
  position: number;
  stem: string;
  options: QuestionOption[];
  selected_label: OptionLabel | null;
}
