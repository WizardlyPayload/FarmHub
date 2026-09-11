import type { ComponentChildren } from "preact";
import { Component } from "preact";
import { tOr } from "@/i18n/i18n";

interface Props {
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

/** Catch section render crashes so the shell stays usable. */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[SectionErrorBoundary]", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div class="fd-section-placeholder">
          <h2>{tOr("common.error", "Something went wrong")}</h2>
          <p class="fd-muted">{this.state.error.message}</p>
          <button
            type="button"
            class="fd-btn fd-btn--ghost"
            onClick={() => this.setState({ error: null })}
          >
            {tOr("common.retry", "Try again")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
