import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    const state = (this as any).state;
    if (state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(state.error?.message || "");
        if (parsed.error && parsed.error.includes("permission-denied")) {
          errorMessage = "You don't have permission to view this. Please make sure you are signed in.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8] p-8 text-center">
          <div className="max-w-md">
            <h2 className="text-2xl font-serif mb-4">Oops!</h2>
            <p className="text-[#666] mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#1A1A1A] text-white px-6 py-3 rounded-full"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
