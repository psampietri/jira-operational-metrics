import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error: error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("[ErrorBoundary] Caught an error:", error, errorInfo);
    this.setState({ errorInfo: errorInfo }); // Store errorInfo for potential display
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="container mx-auto mt-4 max-w-7xl p-4">
             <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 shadow" role="alert">
                 <strong className="font-bold">Rendering Error:</strong>
                 <p>Something went wrong while rendering the dashboard content.</p>
                 <pre className="mt-2 text-sm whitespace-pre-wrap">
                     {this.state.error?.message || 'Unknown error'}
                     {/* Optionally display stack trace during development */}
                     {/* {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                        <details className="mt-2">
                            <summary>Component Stack</summary>
                            {this.state.errorInfo.componentStack}
                        </details>
                     )} */}
                 </pre>
             </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
