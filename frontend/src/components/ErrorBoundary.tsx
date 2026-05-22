import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="flex justify-center mb-6">
              <div className="bg-red-100 p-6 rounded-full">
                <AlertTriangle size={48} className="text-red-600" />
              </div>
            </div>

            <h1 className="text-4xl font-bold text-gray-900 mb-2">Error</h1>

            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Something's Wrong
            </h2>

            <p className="text-lg text-gray-600 mb-2">
              I Think We Need to See This To Admin
            </p>

            <p className="text-gray-500 mb-8">
              There's Nothing in Here
            </p>

            <div className="space-y-3">
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
              >
                Go to Dashboard
              </button>

              <button
                onClick={() => window.location.href = '/'}
                className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition"
              >
                Go Home
              </button>
            </div>

            <div className="mt-8 p-4 bg-white rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 break-words">
                Error: {this.state.error?.message || 'Unknown error'}<br />
                Please contact admin if this persists
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
