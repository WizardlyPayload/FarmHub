import type { ComponentChildren } from "preact";
import "@/components/ui/ui.css";

interface CardProps {
  title?: string;
  children: ComponentChildren;
  class?: string;
}

export function Card({ title, children, class: className }: CardProps) {
  return (
    <div class={`fd-card ${className ?? ""}`.trim()}>
      {title ? <h3 class="fd-card__title">{title}</h3> : null}
      <div class="fd-card__body">{children}</div>
    </div>
  );
}

interface BadgeProps {
  children: ComponentChildren;
  tone?: "default" | "accent" | "warn" | "danger";
  title?: string;
}

export function Badge({ children, tone = "default", title }: BadgeProps) {
  return (
    <span class={`fd-badge fd-badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

interface ButtonProps {
  children: ComponentChildren;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  "aria-label"?: string;
  "aria-busy"?: boolean;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
}: ButtonProps) {
  return (
    <button
      type={type}
      class={`fd-btn fd-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-busy={ariaBusy ? "true" : undefined}
    >
      {children}
    </button>
  );
}
