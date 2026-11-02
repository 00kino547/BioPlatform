import { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
// Shared i18next instance: getDerivedStateFromError is static, so it cannot
// reach the injected `t` prop — the fallback text is resolved imperatively.
import i18n from "@/i18n";

interface ErrorBoundaryProps extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode;
  ns?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

class ErrorBoundaryInner extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message || error.name || i18n.t("common:errorBoundary.unexpected") : i18n.t("common:errorBoundary.unexpected"),
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] caught render error:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ hasError: false, message: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // A custom `fallback` (e.g. null to silently drop a non-essential widget) prevents
      // one faulty embed — like a YouTube track that failed to load — from taking down
      // the whole page on the public profile.
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div
          role="alert"
          className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          <p className="text-sm font-semibold">{this.props.t("errorBoundary.heading")}</p>
          {this.state.message && <p className="max-w-sm text-xs opacity-70">{this.state.message}</p>}
          <button
            type="button"
            onClick={this.reset}
            className="mt-1 rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold transition-colors hover:border-white/40"
          >
            {this.props.t("errorBoundary.tryAgain")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation("common")(ErrorBoundaryInner);
