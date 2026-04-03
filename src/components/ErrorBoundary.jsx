import { Component } from "react";
import { C, bt } from "../shared.jsx";
import { t } from "../i18n.js";

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: C.tx }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>{t("error.something_wrong")}</div>
          <p style={{ color: C.txm, marginBottom: 16 }}>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={bt(C.vi)}>{t("common.retry")}</button>
        </div>
      );
    }
    return this.props.children;
  }
}
