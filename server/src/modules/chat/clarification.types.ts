export type ClarificationSlot =
  | "budget"
  | "use_case"
  | "priority"
  | "audience";

export interface ClarificationDecision {
  needsClarification: boolean;
  question?: string;
  missingSlots: ClarificationSlot[];
}

export interface PendingClarification {
  originalQuestion: string;
  missingSlots: ClarificationSlot[];
}
