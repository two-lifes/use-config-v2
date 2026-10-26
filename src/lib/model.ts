export const SCHEMA_VERSION = 1;

export interface StoredCatalog {
  schemaVersion: typeof SCHEMA_VERSION;
  topics: Topic[];
  entries: Entry[];
}

export interface Topic {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Entry {
  id: string;
  topicId: string;
  name: string;
  url: string;
  description: string;
  username: string;
  password: string;
  extraUrl: string;
  twoFactorNote: string;
  createdAt: string;
  updatedAt: string;
}

// Lengths are counted in Unicode code points.
export const LIMITS = {
  topicName: 100,
  entryName: 200,
  url: 2048,
  secret: 1000,
  longText: 10_000,
} as const;
