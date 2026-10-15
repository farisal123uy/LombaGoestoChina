import type { ActionPlan, FinancialState } from "@guardian-wallet/shared";
export interface PlanningRequest {
    taskId: string;
    instruction: string;
    financialState: FinancialState;
    policyVersion: string;
}
export interface Planner {
    plan(request: PlanningRequest): Promise<ActionPlan>;
}
export declare const plannerImplementationStatus: "pending";
//# sourceMappingURL=index.d.ts.map