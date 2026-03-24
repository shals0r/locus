import type { ReactNode } from "react";

interface WizardStepProps {
  heading: string;
  body: string;
  isActive: boolean;
  isCompleted: boolean;
  children: ReactNode;
}

export function WizardStep({
  heading,
  body,
  isActive,
  isCompleted,
  children,
}: WizardStepProps) {
  if (!isActive && !isCompleted) return null;

  return (
    <div
      className={`rounded-lg border p-6 ${
        isActive
          ? "border-border bg-secondary"
          : "border-border/50 bg-secondary/50 opacity-60"
      }`}
    >
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-primary-text">{heading}</h2>
          {isCompleted && (
            <span className="text-xs text-success">Done</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>

      {isActive && <div>{children}</div>}
    </div>
  );
}
