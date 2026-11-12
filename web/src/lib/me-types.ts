export type SavedJobRow = {
  job_id: string;
  title: string;
  company: string;
  location: string | null;
  eligibility: string | null;
  evidence: string[] | null;
  apply_url: string;
  saved_at: string;
  status: "open" | "closed" | "removed";
};

export type McpTokenPublic = {
  id: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  active: boolean;
};
