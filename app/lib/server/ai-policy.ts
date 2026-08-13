import type { AIPermissionMode } from "../../ai/types";

export type AIToolPolicy = {
  requiredPermission: AIPermissionMode;
  riskLevel: 1 | 2 | 3;
  requiresConfirmation: boolean;
};

const permissionRank: Record<AIPermissionMode, number> = {
  read_only: 1,
  administrative: 2,
  financial_confirm: 3,
};

export function evaluateAIToolAccess(
  policy: AIToolPolicy,
  permissionMode: AIPermissionMode,
  confirmed = false,
) {
  if (permissionRank[permissionMode] < permissionRank[policy.requiredPermission]) {
    return {
      allowed: false,
      confirmationRequired: false,
      reason: policy.riskLevel === 2
        ? "A IA está em modo somente leitura. Altere a permissão para permitir ações administrativas."
        : "A permissão atual não autoriza alterações financeiras.",
    } as const;
  }

  if (policy.requiresConfirmation && !confirmed) {
    return { allowed: false, confirmationRequired: true, reason: "Confirmação explícita necessária." } as const;
  }

  return { allowed: true, confirmationRequired: false, reason: null } as const;
}
