import { MaterialVisibility } from "@prisma/client";
import { MaterialSearchQueryDto } from "../dto/material-search-query.dto";

export const MATERIAL_SEARCH_ENGINE = Symbol("MATERIAL_SEARCH_ENGINE");

export type MaterialSearchItem = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  grade: string | null;
  subject: string | null;
  kind: string | null;
  year: number | null;
  region: string | null;
  visibility: MaterialVisibility;
  createdAt: Date;
  avg_score: number | null;
  download_count: number;
};

export type MaterialSearchResult = {
  page: number;
  pageSize: number;
  total: number;
  items: MaterialSearchItem[];
};

export interface MaterialSearchEngine {
  searchApproved(query: MaterialSearchQueryDto): Promise<MaterialSearchResult>;
}
