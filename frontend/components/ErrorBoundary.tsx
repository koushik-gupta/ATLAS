"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#FDFBF7] p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgba(15,39,71,0.08)] border border-[#0F2747]/[0.06] text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-serif text-[#0F2747] mb-3 leading-tight">
              Something went wrong
            </h1>
            <p className="text-[#0F2747]/60 text-sm mb-8 leading-relaxed">
              We encountered an unexpected error while planning your journey. Please refresh the page to try again.
            </p>
            <button
              onClick={this.handleRefresh}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#0F2747] text-white rounded-xl font-semibold text-[13px] tracking-wide hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              <RefreshCcw size={15} />
              Refresh Application
            </button>
            {this.state.error && (
              <div className="mt-8 pt-6 border-t border-[#0F2747]/10 text-left">
                <p className="text-[10px] uppercase tracking-widest font-bold text-[#0F2747]/40 mb-2">Error Details</p>
                <p className="text-xs font-mono text-red-500/80 bg-red-50/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                  {this.state.error.message}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
